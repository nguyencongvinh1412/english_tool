/**
 * Auth Routes
 * Register with an invite code, sign in, sign out, current user
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { inviteCodes, users } from '../db/schema.js';
import { hashPassword, verifyPassword, verifyDummyPassword } from '../auth/password.js';
import { createSession, destroySession } from '../auth/sessions.js';
import { resetPassword } from '../auth/passwordReset.js';
import { createRateLimiter, currentUser, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { findUserByEmail, normalizeEmail, toCurrentUser } from '../services/users.js';

/** Login attempts allowed per IP + email per minute */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000;

/** Registration attempts allowed per IP per 10 minutes (slows invite-code guessing) */
const REGISTER_MAX_ATTEMPTS = 10;
const REGISTER_WINDOW_MS = 10 * 60 * 1000;

export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

const registerSchema = z.object({
  email: z.email('Please enter a valid email').max(254),
  password: passwordSchema,
  displayName: z.string().trim().min(1, 'Please enter your name').max(50),
  inviteCode: z.string().trim().min(1, 'An invite code is required').max(64),
});

/** Reset attempts per IP per 15 minutes (tokens are long, this only slows scripted guessing) */
const RESET_MAX_ATTEMPTS = 10;
const RESET_WINDOW_MS = 15 * 60 * 1000;

const resetSchema = z.object({
  token: z.string().min(20).max(100),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(PASSWORD_MAX_LENGTH),
});

/**
 * Creates the auth router
 * @returns Router mounted at /api/auth
 */
export function createAuthRouter(): Router {
  const router = Router();
  const loginLimiter = createRateLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  const registerLimiter = createRateLimiter(REGISTER_MAX_ATTEMPTS, REGISTER_WINDOW_MS);
  const resetLimiter = createRateLimiter(RESET_MAX_ATTEMPTS, RESET_WINDOW_MS);

  /**
   * POST /register - Create an account with an invite code and sign in
   * @throws {400} Invalid input or invite code
   * @throws {409} Email already registered
   */
  router.post('/register', async (req, res) => {
    const limiterKey = req.ip ?? 'unknown';
    registerLimiter.check(limiterKey);
    registerLimiter.hit(limiterKey);

    const body = registerSchema.parse(req.body);
    const email = normalizeEmail(body.email);
    const passwordHash = await hashPassword(body.password);

    const user = await db.transaction(async (tx) => {
      // Claim one use of the invite atomically, so concurrent sign-ups cannot exceed max_uses
      const [invite] = await tx
        .update(inviteCodes)
        .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
        .where(
          and(
            eq(inviteCodes.code, body.inviteCode.toUpperCase()),
            isNull(inviteCodes.revokedAt),
            lt(inviteCodes.usedCount, inviteCodes.maxUses),
            or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, new Date()))
          )
        )
        .returning();

      if (!invite) {
        throw new HttpError(400, 'This invite code is invalid or has expired.', 'invalid_invite');
      }

      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(sql`lower(${users.email})`, email))
        .limit(1);

      if (existing) {
        throw new HttpError(409, 'An account with this email already exists.', 'email_taken');
      }

      const [created] = await tx
        .insert(users)
        .values({ email, passwordHash, displayName: body.displayName, role: invite.role, lastLoginAt: new Date() })
        .returning();

      return created;
    });

    await createSession(req, res, user.id);
    res.status(201).json({ user: await toCurrentUser(user) });
  });

  /**
   * POST /login - Sign in with email and password
   * @throws {401} Wrong email or password
   * @throws {403} Account disabled
   * @throws {429} Too many attempts
   */
  router.post('/login', async (req, res) => {
    const body = loginSchema.parse(req.body);
    const limiterKey = `${req.ip}:${normalizeEmail(body.email)}`;
    loginLimiter.check(limiterKey);

    const user = await findUserByEmail(body.email);

    if (!user) {
      await verifyDummyPassword(body.password);
      loginLimiter.hit(limiterKey);
      throw new HttpError(401, 'Incorrect email or password.', 'invalid_credentials');
    }

    if (!(await verifyPassword(body.password, user.passwordHash))) {
      loginLimiter.hit(limiterKey);
      throw new HttpError(401, 'Incorrect email or password.', 'invalid_credentials');
    }

    if (user.status !== 'active') {
      throw new HttpError(403, 'This account has been disabled. Please contact the admin.', 'account_disabled');
    }

    loginLimiter.reset(limiterKey);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await createSession(req, res, user.id);
    res.json({ user: await toCurrentUser(user) });
  });

  /**
   * POST /password-reset - Set a new password with a one-time link from an admin
   * @throws {400} invalid_reset_token when the link is unknown, used or expired
   */
  router.post('/password-reset', async (req, res) => {
    const limiterKey = req.ip ?? 'unknown';
    resetLimiter.check(limiterKey);
    resetLimiter.hit(limiterKey);

    const body = resetSchema.parse(req.body);
    await resetPassword(body.token, body.password);
    res.status(204).end();
  });

  /**
   * POST /logout - Sign out of the current session
   */
  router.post('/logout', async (req, res) => {
    await destroySession(req, res);
    res.status(204).end();
  });

  /**
   * GET /me - Current user with today's AI quota
   * @throws {401} Not signed in
   */
  router.get('/me', requireAuth, async (req, res) => {
    res.json({ user: await toCurrentUser(currentUser(req)) });
  });

  return router;
}
