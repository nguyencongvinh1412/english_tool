/**
 * Admin Routes
 * Manage users (role, status, AI quota, model access), invite codes, and AI usage
 */
import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiUsage, inviteCodes, users } from '../db/schema.js';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { revokeUserSessions } from '../auth/sessions.js';
import { HttpError } from '../http/errors.js';
import { toPublicUser } from '../services/users.js';
import { getAllowedModels, getDailyLimit, quotaDay } from '../services/aiAccess.js';
import { isModelAllowed, listAllowedModels } from '../services/cliproxy.js';

/** Characters for invite codes: no 0/O/1/I to avoid misreading */
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_GROUP_LENGTH = 4;

/** Default and maximum range for the usage report */
const DEFAULT_USAGE_DAYS = 30;
const MAX_USAGE_DAYS = 365;

const updateUserSchema = z
  .object({
    role: z.enum(['admin', 'learner']),
    status: z.enum(['active', 'disabled']),
    /** null resets to the LEARNER_DAILY_AI_LIMIT default */
    dailyAiLimit: z.number().int().min(0).max(100_000).nullable(),
    /** null resets to the LEARNER_MODELS default */
    allowedModels: z
      .array(z.string().min(1).max(100))
      .max(100)
      .refine((models) => models.every(isModelAllowed), 'Contains a blocked model')
      .nullable(),
  })
  .partial()
  .strict();

const createInviteSchema = z.object({
  role: z.enum(['admin', 'learner']).default('learner'),
  maxUses: z.number().int().min(1).max(1000).default(1),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
  note: z.string().trim().max(200).nullable().default(null),
});

const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_USAGE_DAYS).default(DEFAULT_USAGE_DAYS),
});

/**
 * Generates a readable invite code, e.g. "ET-K7QX-M2PA"
 */
function generateInviteCode(): string {
  const bytes = randomBytes(INVITE_GROUP_LENGTH * 2);
  const chars = Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]);
  return `ET-${chars.slice(0, INVITE_GROUP_LENGTH).join('')}-${chars.slice(INVITE_GROUP_LENGTH).join('')}`;
}

/**
 * Creates the admin router
 * @returns Router mounted at /api/admin
 */
export function createAdminRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  /**
   * GET /users - All users with today's AI usage
   */
  router.get('/users', async (_req, res) => {
    const usageToday = db
      .select({
        userId: aiUsage.userId,
        used: sql<number>`sum(${aiUsage.requestCount})::int`.as('used'),
      })
      .from(aiUsage)
      .where(eq(aiUsage.day, quotaDay()))
      .groupBy(aiUsage.userId)
      .as('usage_today');

    const rows = await db
      .select({ user: users, usedToday: usageToday.used })
      .from(users)
      .leftJoin(usageToday, eq(usageToday.userId, users.id))
      .orderBy(desc(users.createdAt));

    res.json({
      users: rows.map(({ user, usedToday }) => ({
        ...toPublicUser(user),
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        dailyAiLimit: user.dailyAiLimit,
        effectiveDailyAiLimit: getDailyLimit(user),
        allowedModels: user.allowedModels,
        effectiveAllowedModels: getAllowedModels(user),
        aiUsedToday: usedToday ?? 0,
      })),
    });
  });

  /**
   * PATCH /users/:id - Change role, status, AI quota, or model access
   * @throws {400} Admin tries to demote or disable themselves
   * @throws {404} User not found
   */
  router.patch('/users/:id', async (req, res) => {
    const changes = updateUserSchema.parse(req.body);
    const admin = currentUser(req);
    const targetId = z.uuid().parse(req.params.id);

    // Prevent locking yourself out of the admin area
    if (targetId === admin.id && (changes.role === 'learner' || changes.status === 'disabled')) {
      throw new HttpError(400, 'You cannot demote or disable your own account.', 'self_lockout');
    }

    const [updated] = await db
      .update(users)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(users.id, targetId))
      .returning();

    if (!updated) {
      throw new HttpError(404, 'User not found.', 'not_found');
    }

    if (changes.status === 'disabled') {
      await revokeUserSessions(updated.id);
    }

    res.json({ user: { ...toPublicUser(updated), status: updated.status } });
  });

  /**
   * GET /models - Every model on the proxy that may be assigned to users
   */
  router.get('/models', async (_req, res) => {
    res.json({ models: await listAllowedModels() });
  });

  /**
   * GET /invites - All invite codes, newest first
   */
  router.get('/invites', async (_req, res) => {
    const invites = await db.select().from(inviteCodes).orderBy(desc(inviteCodes.createdAt));
    res.json({ invites });
  });

  /**
   * POST /invites - Create an invite code
   */
  router.post('/invites', async (req, res) => {
    const body = createInviteSchema.parse(req.body ?? {});
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const [invite] = await db
      .insert(inviteCodes)
      .values({
        code: generateInviteCode(),
        createdBy: currentUser(req).id,
        role: body.role,
        maxUses: body.maxUses,
        expiresAt,
        note: body.note,
      })
      .returning();

    res.status(201).json({ invite });
  });

  /**
   * DELETE /invites/:code - Revoke an invite code (kept for history)
   * @throws {404} Invite not found
   */
  router.delete('/invites/:code', async (req, res) => {
    const [revoked] = await db
      .update(inviteCodes)
      .set({ revokedAt: new Date() })
      .where(eq(inviteCodes.code, String(req.params.code).toUpperCase()))
      .returning();

    if (!revoked) {
      throw new HttpError(404, 'Invite code not found.', 'not_found');
    }

    res.json({ invite: revoked });
  });

  /**
   * GET /usage?days=30 - AI requests per day and user
   */
  router.get('/usage', async (req, res) => {
    const { days } = usageQuerySchema.parse(req.query);
    const since = quotaDay(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));

    const rows = await db
      .select({
        day: aiUsage.day,
        userId: aiUsage.userId,
        email: users.email,
        feature: aiUsage.feature,
        requests: aiUsage.requestCount,
      })
      .from(aiUsage)
      .innerJoin(users, eq(users.id, aiUsage.userId))
      .where(gte(aiUsage.day, since))
      .orderBy(desc(aiUsage.day), users.email);

    res.json({ since, usage: rows });
  });

  return router;
}
