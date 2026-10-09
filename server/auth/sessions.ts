/**
 * Sessions
 * Opaque random tokens in an HttpOnly cookie; only the SHA-256 hash is stored,
 * so a database leak does not expose usable session tokens
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { and, eq, gt, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions, users, type User } from '../db/schema.js';
import { IS_PRODUCTION } from '../config.js';

export const SESSION_COOKIE = 'et_session';

/** Session lifetime; extended on activity (sliding expiry) */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Only refresh expiry/last-seen at most this often, to avoid a write per request */
const SESSION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Bytes of entropy in a session token */
const TOKEN_BYTES = 32;

/**
 * Hashes a raw session token for storage and lookup
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Reads a cookie value from the request without a cookie-parser dependency
 * @param req - Express request
 * @param name - Cookie name
 * @returns Cookie value, or undefined if absent
 */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) continue;

    if (part.slice(0, separatorIndex).trim() === name) {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    }
  }

  return undefined;
}

/**
 * Sets the session cookie on the response
 */
function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

/**
 * Clears the session cookie on the response
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    path: '/',
  });
}

/**
 * Creates a session for a user and sets the cookie
 * @param req - Express request (for user agent)
 * @param res - Express response
 * @param userId - User to sign in
 */
export async function createSession(req: Request, res: Response, userId: string): Promise<void> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
  });

  setSessionCookie(res, token);
}

/**
 * Resolves the signed-in user from the session cookie
 * Refreshes the sliding expiry at most once per SESSION_REFRESH_INTERVAL_MS
 *
 * @param req - Express request
 * @param res - Express response (to refresh the cookie)
 * @returns The active user, or null if not signed in
 */
export async function getSessionUser(req: Request, res: Response): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;

  const sessionId = hashToken(token);
  const now = new Date();

  const [row] = await db
    .select({ user: users, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!row || row.user.status !== 'active') {
    return null;
  }

  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_REFRESH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(sessions.id, sessionId));
    setSessionCookie(res, token);
  }

  return row.user;
}

/**
 * Deletes the current session (logout)
 */
export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  clearSessionCookie(res);
}

/**
 * Deletes every session of a user, optionally keeping the current one
 * Used when a password changes or an admin disables an account
 *
 * @param userId - User whose sessions to revoke
 * @param keepReq - If given, the session of this request is kept
 */
export async function revokeUserSessions(userId: string, keepReq?: Request): Promise<void> {
  const keepToken = keepReq ? readCookie(keepReq, SESSION_COOKIE) : undefined;

  await db
    .delete(sessions)
    .where(
      keepToken
        ? and(eq(sessions.userId, userId), ne(sessions.id, hashToken(keepToken)))
        : eq(sessions.userId, userId)
    );
}
