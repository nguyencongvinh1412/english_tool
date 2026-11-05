/**
 * Placement test routes (English): start or resume, answer, read the latest measured levels; plus the admin's
 * question bank: build it from existing content, see coverage, retire or approve a question.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { placementQuestions } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth, requireRole } from '../auth/middleware.js';
import { assessProductive, PRODUCTIVE_SKILLS } from '../placement/productive.js';
import { HttpError } from '../http/errors.js';
import { AI_SKILLS, approveDrafts, fillCell } from '../placement/ai.js';
import { buildBank, coverage } from '../placement/bank.js';
import { CEFR_ORDER } from '../progress/levels.js';
import { answer, currentSession, latestLevels, PlacementError, startSession } from '../placement/service.js';

const answerSchema = z.object({ questionId: z.string().min(1).max(200), choice: z.number().int().min(0).max(5) });
const statusSchema = z.object({ status: z.enum(['draft', 'approved', 'retired']) });
const cellSchema = z.object({ skill: z.enum(AI_SKILLS), level: z.enum(CEFR_ORDER), model: z.string().max(80).optional() });

export function createPlacementRouter(): Router {
  const router = Router();

  /**
   * GET /placement - The test in progress (if any) and the latest measured levels
   */
  router.get('/placement', requireAuth, async (req, res) => {
    const user = currentUser(req);
    res.json({ session: await currentSession(user.id), latest: await latestLevels(user.id) });
  });

  /**
   * POST /placement/productive - Place a short piece of Writing or Speaking on the CEFR scale (uses AI credits)
   */
  router.post('/placement/productive', requireAuth, limitAiRequests, async (req, res) => {
    const user = currentUser(req);
    if (user.studyLanguage !== 'en') throw new HttpError(400, 'The level test is only available for English so far.', 'not_available');
    const body = z.object({ skill: z.enum(PRODUCTIVE_SKILLS), text: z.string().max(4000), model: z.string().max(100).optional() }).parse(req.body);
    res.json(await assessProductive(user, body.skill, body.text, body.model));
  });

  /**
   * POST /placement/start - Start a test, or resume the one in progress (English only for now)
   */
  router.post('/placement/start', requireAuth, async (req, res) => {
    const user = currentUser(req);
    if (user.studyLanguage !== 'en') throw new HttpError(400, 'The level test is only available for English so far.', 'not_available');
    const session = await startSession(user);
    if (!session) throw new HttpError(503, 'The level test has no questions yet.', 'empty_bank');
    res.status(201).json({ session });
  });

  /**
   * POST /placement/:id/answer - Grade the answer; returns the next question or the result
   */
  router.post('/placement/:id/answer', requireAuth, async (req, res) => {
    const { questionId, choice } = answerSchema.parse(req.body);
    try {
      res.json({ session: await answer(currentUser(req).id, String(req.params.id), questionId, choice) });
    } catch (err) {
      if (err instanceof PlacementError) throw new HttpError(err.code === 'not_found' ? 404 : 400, 'That answer could not be recorded.', err.code);
      throw err;
    }
  });

  const admin = Router();
  admin.use(requireAuth, requireRole('admin'));

  /** POST /admin/placement/build - Add questions from the word list and practice content */
  admin.post('/build', async (_req, res) => {
    res.json(await buildBank());
  });

  /** POST /admin/placement/generate - Have the AI write one batch for a skill and level (stored as drafts) */
  admin.post('/generate', async (req, res) => {
    const { skill, level, model } = cellSchema.parse(req.body);
    res.json(await fillCell(currentUser(req), skill, level, model));
  });

  /** POST /admin/placement/approve - Approve the AI drafts of a skill and level */
  admin.post('/approve', async (req, res) => {
    const { skill, level } = cellSchema.parse(req.body);
    res.json({ approved: await approveDrafts(skill, level) });
  });

  /** GET /admin/placement/coverage - Approved and draft questions per skill and level */
  admin.get('/coverage', async (_req, res) => {
    res.json({ coverage: await coverage('approved'), drafts: await coverage('draft') });
  });

  /** GET /admin/placement/questions?skill=&level=&status= - A page of questions to review */
  admin.get('/questions', async (req, res) => {
    const q = z.object({ skill: z.string().optional(), level: z.string().optional(), status: z.string().optional(), limit: z.coerce.number().min(1).max(200).default(50) }).parse(req.query);
    const where = and(
      eq(placementQuestions.language, 'en'),
      q.skill ? eq(placementQuestions.skill, q.skill) : undefined,
      q.level ? eq(placementQuestions.level, q.level) : undefined,
      q.status ? eq(placementQuestions.status, q.status) : undefined
    );
    const rows = await db.select().from(placementQuestions).where(where).orderBy(desc(placementQuestions.createdAt), placementQuestions.id).limit(q.limit);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(placementQuestions).where(where);
    res.json({ total: n, questions: rows });
  });

  /** PATCH /admin/placement/questions/:id - Approve, retire or return a question to draft */
  admin.patch('/questions/:id', async (req, res) => {
    const { status } = statusSchema.parse(req.body);
    const rows = await db.update(placementQuestions).set({ status }).where(eq(placementQuestions.id, String(req.params.id))).returning({ id: placementQuestions.id });
    if (rows.length === 0) throw new HttpError(404, 'Question not found.', 'not_found');
    res.json({ ok: true });
  });

  router.use('/admin/placement', admin);
  return router;
}
