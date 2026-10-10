/**
 * Profile Routes
 * The signed-in user updates their own profile and password
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { revokeUserSessions } from '../auth/sessions.js';
import { HttpError } from '../http/errors.js';
import { toCurrentUser } from '../services/users.js';
import { PASSWORD_MIN_LENGTH } from './auth.js';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50),
    uiLocale: z.enum(['en', 'vi']),
    targetExam: z.enum(['none', 'toeic', 'ielts']),
    targetScore: z.number().min(0).max(990).nullable(),
    cefrLevel: z.enum(CEFR_LEVELS).nullable(),
    /** true marks onboarding as finished */
    onboarded: z.literal(true),
  })
  .partial()
  .strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().max(200),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(200),
});

/**
 * Creates the profile router
 * @returns Router mounted at /api/me
 */
export function createMeRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  /**
   * PATCH / - Update own profile fields
   */
  router.patch('/', async (req, res) => {
    const { onboarded, ...changes } = updateProfileSchema.parse(req.body);
    const user = currentUser(req);

    const [updated] = await db
      .update(users)
      .set({
        ...changes,
        ...(onboarded && !user.onboardedAt && { onboardedAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    res.json({ user: await toCurrentUser(updated) });
  });

  /**
   * POST /password - Change own password; signs out other devices
   * @throws {400} Current password is wrong
   */
  router.post('/password', async (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    const user = currentUser(req);

    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'Your current password is incorrect.', 'invalid_password');
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await revokeUserSessions(user.id, req);

    res.status(204).end();
  });

  return router;
}
