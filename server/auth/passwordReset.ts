/**
 * Password Reset
 * There is no email delivery, so an admin creates a one-time link and hands it to the user
 * (chat, in person). The user picks the new password; the admin never learns it.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { passwordResets, users } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import { hashPassword } from './password.js';
import { revokeUserSessions } from './sessions.js';

/** How long a reset link works */
export const RESET_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Creates a reset token for a user; earlier unused links for that user stop working
 * @returns The raw token (shown once) and its expiry
 */
export async function createPasswordReset(userId: string, createdBy: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await db.transaction(async (tx) => {
    await tx.delete(passwordResets).where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({ id: hashToken(token), userId, createdBy, expiresAt });
  });
  return { token, expiresAt };
}

/**
 * Sets a new password with a reset token and signs the user out everywhere
 * @throws HttpError 400 invalid_reset_token when the link is unknown, used or expired
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);

  const userId = await db.transaction(async (tx) => {
    // Marking the token used in the same statement that checks it makes a link single-use, even under races
    const [reset] = await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResets.id, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
      .returning();
    if (!reset) return null;

    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, reset.userId));
    return reset.userId;
  });

  if (!userId) throw new HttpError(400, 'This reset link is invalid or has expired. Ask the admin for a new one.', 'invalid_reset_token');
  await revokeUserSessions(userId);
}
