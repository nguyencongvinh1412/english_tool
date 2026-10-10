/**
 * Auth Middleware
 * requireAuth / requireRole for authorization, checkOrigin against CSRF,
 * and a small in-memory rate limiter for login attempts
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { User } from '../db/schema.js';
import { config, IS_PRODUCTION } from '../config.js';
import { HttpError } from '../http/errors.js';
import { getSessionUser } from './sessions.js';

declare global {
  // Express augments its Request type through this namespace
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Signed-in user, set by requireAuth */
      user?: User;
    }
  }
}

/** Origins allowed in development (Vite dev server) */
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/** HTTP methods that never change state */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects requests without a valid session with 401
 * Sets req.user for downstream handlers
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const user = await getSessionUser(req, res);

  if (!user) {
    throw new HttpError(401, 'Please sign in to continue.', 'unauthenticated');
  }

  req.user = user;
  next();
};

/**
 * Rejects users without the given role with 403
 * Must run after requireAuth
 */
export function requireRole(role: User['role']): RequestHandler {
  return (req, _res, next) => {
    if (req.user?.role !== role) {
      throw new HttpError(403, 'You do not have permission to do this.', 'forbidden');
    }
    next();
  };
}

/**
 * Returns the signed-in user set by requireAuth
 * @throws HttpError 401 if used on a route without requireAuth
 */
export function currentUser(req: Request): User {
  if (!req.user) {
    throw new HttpError(401, 'Please sign in to continue.', 'unauthenticated');
  }
  return req.user;
}

/**
 * CSRF defence in depth on top of SameSite=Lax cookies:
 * state-changing requests from a browser must come from our own origin
 */
export function checkOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;

  // Non-browser clients (curl, server-to-server) send no Origin header
  if (!origin) {
    next();
    return;
  }

  const selfOrigin = `${req.protocol}://${req.headers.host}`;
  const allowed = new Set([selfOrigin, ...config.APP_ORIGIN, ...(IS_PRODUCTION ? [] : DEV_ORIGINS)]);

  if (!allowed.has(origin)) {
    throw new HttpError(403, 'Cross-origin request blocked.', 'bad_origin');
  }

  next();
}

/**
 * Creates a fixed-window rate limiter keyed by an arbitrary string
 * In-memory: fine for a single app instance
 *
 * @param maxAttempts - Attempts allowed per window
 * @param windowMs - Window length in milliseconds
 * @returns Functions to check, record, and reset attempts for a key
 */
export function createRateLimiter(maxAttempts: number, windowMs: number) {
  const attempts = new Map<string, { count: number; resetAt: number }>();

  /** Drops expired entries so the map cannot grow without bound */
  const prune = (now: number): void => {
    for (const [key, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(key);
    }
  };

  return {
    /** Throws 429 if the key is over the limit */
    check(key: string): void {
      const entry = attempts.get(key);
      if (entry && entry.resetAt > Date.now() && entry.count >= maxAttempts) {
        const retryAfterSec = Math.ceil((entry.resetAt - Date.now()) / 1000);
        throw new HttpError(
          429,
          `Too many attempts. Please try again in ${retryAfterSec} seconds.`,
          'rate_limited'
        );
      }
    },
    /** Records one attempt for the key */
    hit(key: string): void {
      const now = Date.now();
      if (attempts.size > 10_000) prune(now);

      const entry = attempts.get(key);
      if (!entry || entry.resetAt <= now) {
        attempts.set(key, { count: 1, resetAt: now + windowMs });
      } else {
        entry.count++;
      }
    },
    /** Clears attempts for the key (after a successful login) */
    reset(key: string): void {
      attempts.delete(key);
    },
  };
}

/** AI-backed requests a learner may start per minute (chat turns, generation, scoring) */
const AI_REQUESTS_PER_MINUTE = 15;
const aiBurstLimiter = createRateLimiter(AI_REQUESTS_PER_MINUTE, 60_000);

/**
 * Throttles routes that call the AI so a script cannot burn the daily quota (and the
 * proxy's capacity) in seconds. Admins are exempt. Must run after requireAuth.
 */
export const limitAiRequests: RequestHandler = (req, _res, next) => {
  const user = currentUser(req);
  if (user.role !== 'admin') {
    aiBurstLimiter.check(user.id);
    aiBurstLimiter.hit(user.id);
  }
  next();
};
