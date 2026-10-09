/**
 * Progress Routes
 * Record finished activities, read history, best scores and the progress summary
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts } from '../db/schema.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { quotaDay } from '../services/aiAccess.js';
import { ACTIVITY_SKILLS, computeXp, getProgressSummary, toPublicAttempt, type Activity } from '../services/progress.js';

const ACTIVITIES = Object.keys(ACTIVITY_SKILLS) as [Activity, ...Activity[]];

/** Longest session we accept as a real duration (3 hours) */
const MAX_DURATION_SEC = 3 * 60 * 60;
/** Serialized size limit for free-form attempt details */
const MAX_DETAILS_BYTES = 8 * 1024;

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;

const createAttemptSchema = z
  .object({
    activity: z.enum(ACTIVITIES),
    contentRef: z.string().trim().max(120).nullish(),
    title: z.string().trim().max(200).nullish(),
    score: z.number().min(0).max(10_000).nullish(),
    maxScore: z.number().positive().max(10_000).nullish(),
    durationSec: z.number().int().min(0).max(MAX_DURATION_SEC).nullish(),
    details: z
      .record(z.string(), z.unknown())
      .nullish()
      .refine((value) => !value || JSON.stringify(value).length <= MAX_DETAILS_BYTES, 'Details are too large'),
    /** Scores carried over from the pre-account localStorage; recorded without XP */
    imported: z.boolean().optional(),
  })
  .refine((body) => body.score == null || body.maxScore != null, { message: 'maxScore is required with score', path: ['maxScore'] })
  .refine((body) => body.score == null || body.maxScore == null || body.score <= body.maxScore, {
    message: 'score cannot exceed maxScore',
    path: ['score'],
  });

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_HISTORY_LIMIT).default(DEFAULT_HISTORY_LIMIT),
  /** ISO timestamp: return attempts completed before this (pagination cursor) */
  before: z.iso.datetime({ offset: true }).optional(),
  activity: z.enum(ACTIVITIES).optional(),
});

const bestQuerySchema = z.object({ activity: z.enum(ACTIVITIES) });

/**
 * Creates the progress router
 * @returns Router mounted at /api
 */
export function createProgressRouter(): Router {
  const router = Router();

  /**
   * POST /attempts - Record a finished activity and award XP
   * @returns {Object} { attempt, xpEarned }
   */
  router.post('/attempts', requireAuth, async (req, res) => {
    const body = createAttemptSchema.parse(req.body);
    const user = currentUser(req);
    const xp = body.imported ? 0 : computeXp(body.score, body.maxScore);

    const [attempt] = await db
      .insert(attempts)
      .values({
        userId: user.id,
        activity: body.activity,
        skill: ACTIVITY_SKILLS[body.activity],
        contentRef: body.contentRef ?? null,
        title: body.title ?? null,
        score: body.score ?? null,
        maxScore: body.maxScore ?? null,
        durationSec: body.durationSec ?? null,
        details: body.imported ? { ...(body.details ?? {}), imported: true } : (body.details ?? null),
        xp,
        day: quotaDay(),
      })
      .returning();

    res.status(201).json({ attempt: toPublicAttempt(attempt), xpEarned: xp });
  });

  /**
   * GET /attempts?limit=&before=&activity= - Practice history, newest first
   * @returns {Object} { attempts, nextBefore } nextBefore is null on the last page
   */
  router.get('/attempts', requireAuth, async (req, res) => {
    const query = historyQuerySchema.parse(req.query);
    const user = currentUser(req);

    const rows = await db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, user.id),
          query.activity ? eq(attempts.activity, query.activity) : undefined,
          query.before ? lt(attempts.completedAt, new Date(query.before)) : undefined
        )
      )
      .orderBy(desc(attempts.completedAt))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    res.json({
      attempts: page.map(toPublicAttempt),
      nextBefore: rows.length > query.limit ? page[page.length - 1].completedAt.toISOString() : null,
    });
  });

  /**
   * GET /attempts/best?activity= - Best percentage per content item
   * @returns {Object} { best: Record<contentRef, percent> }
   */
  router.get('/attempts/best', requireAuth, async (req, res) => {
    const { activity } = bestQuerySchema.parse(req.query);
    const user = currentUser(req);

    const rows = await db
      .select({
        contentRef: attempts.contentRef,
        best: sql<number>`round(max(${attempts.score} / ${attempts.maxScore} * 100))::int`,
      })
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, user.id),
          eq(attempts.activity, activity),
          sql`${attempts.contentRef} is not null and ${attempts.maxScore} > 0`
        )
      )
      .groupBy(attempts.contentRef);

    res.json({ best: Object.fromEntries(rows.map((row) => [row.contentRef, row.best])) });
  });

  /**
   * GET /progress/summary - XP, streak, weekly chart, heatmap, per-skill stats, recent attempts
   */
  router.get('/progress/summary', requireAuth, async (req, res) => {
    res.json(await getProgressSummary(currentUser(req).id));
  });

  return router;
}
