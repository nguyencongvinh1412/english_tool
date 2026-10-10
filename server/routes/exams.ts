/**
 * Exam Routes
 * TOEIC and IELTS mock tests: catalog, start a session, autosave answers, submit and review.
 * Answers stay on the server until the session is submitted.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { examSessions, importJobs, type ExamSession } from '../db/schema.js';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { recordAttempt } from '../services/progress.js';
import { CEFR_LEVELS } from '../content/schemas.js';
import {
  DEADLINE_GRACE_SEC,
  PART_CONFIG,
  TOEIC_PARTS,
  MODE_MINUTES,
  QUESTIONS_PER_GROUP,
  assembleBlueprint,
  bankCounts,
  groupQuestions,
  officialBlueprint,
  officialTimeLimit,
  loadGroups,
  scoreSession,
  sessionView,
  timeLimitFor,
  type Blueprint,
  type ExamMode,
  type ToeicPart,
} from '../exams/toeic.js';
import { generateGroups } from '../exams/bank.js';
import {
  FULL_TEST_GROUPS,
  IELTS_PARTS,
  IELTS_SLOTS,
  assembleIelts,
  gradeIeltsSession,
  ieltsBankCounts,
  ieltsSessionView,
  ieltsTimeLimit,
  loadIeltsGroups,
  scoreIeltsObjective,
  type IeltsBlueprint,
  type IeltsMode,
  type IeltsPart,
  type IeltsResult,
  type IeltsSlot,
} from '../exams/ielts.js';
import { generateIeltsGroups } from '../exams/ieltsBank.js';

/** Missing groups a learner may generate on the spot when starting a test */
const ON_DEMAND_GROUP_LIMIT = 6;
const MAX_FILL_PER_REQUEST = 10;
const HISTORY_LIMIT = 30;

/** Model the learner picked in the sidebar, for generation and grading */
const modelSchema = z.string().max(100).optional();

const partSchema = z.coerce.number().pipe(z.union(TOEIC_PARTS.map((p) => z.literal(p)) as [z.ZodLiteral<2>, ...z.ZodLiteral<ToeicPart>[]]));

const startSchema = z
  .object({ mode: z.enum(['mini', 'part', 'full', 'official']), part: partSchema.optional(), importId: z.uuid().optional(), model: modelSchema })
  .refine((body) => body.mode !== 'part' || body.part !== undefined, { message: 'part is required', path: ['part'] })
  .refine((body) => body.mode !== 'official' || body.importId !== undefined, { message: 'importId is required', path: ['importId'] });

/** IELTS gap answers, essays and speaking transcripts are text */
const MAX_TEXT_ANSWER = 8000;
/** IELTS groups are long to generate, so only a couple are made on the spot */
const IELTS_ON_DEMAND_LIMIT = 2;

const saveSchema = z.object({
  answers: z.record(z.string().max(120), z.union([z.number().int().min(0).max(3), z.string().max(MAX_TEXT_ANSWER)]).nullable()).optional(),
  flags: z.array(z.string().max(120)).max(250).optional(),
});

const ieltsStartSchema = z
  .object({ mode: z.enum(['mini', 'part', 'full']), part: z.enum(IELTS_PARTS).optional(), model: modelSchema })
  .refine((body) => body.mode !== 'part' || body.part !== undefined, { message: 'part is required', path: ['part'] });

const ieltsFillSchema = z.object({
  slot: z.enum(IELTS_SLOTS),
  count: z.number().int().min(1).max(5),
  level: z.enum(CEFR_LEVELS).default('B2'),
  model: modelSchema,
});

const gradeSchema = z.object({ model: modelSchema }).default({});

const fillSchema = z.object({
  part: partSchema,
  count: z.number().int().min(1).max(MAX_FILL_PER_REQUEST),
  level: z.enum(CEFR_LEVELS).default('B1'),
  model: modelSchema,
});

/**
 * Title of an imported test, for attempt labels
 */
async function importTitle(importId: string | undefined): Promise<string> {
  if (!importId) return 'official test';
  const [row] = await db.select({ title: importJobs.title }).from(importJobs).where(eq(importJobs.id, importId)).limit(1);
  return row?.title ?? 'official test';
}

/**
 * Display title of a session: the imported test's title, or null for bank tests
 */
async function titleOf(blueprint: Blueprint): Promise<string | null> {
  return blueprint.importId ? importTitle(blueprint.importId) : null;
}

/** Deadline including grace, in milliseconds */
const deadlineMs = (session: ExamSession) => session.startedAt.getTime() + (session.timeLimitSec + DEADLINE_GRACE_SEC) * 1000;

/**
 * Loads one of the caller's sessions
 * @throws HttpError 404 if missing or owned by someone else
 */
async function loadSession(id: string, userId: string): Promise<ExamSession> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new HttpError(404, 'Test not found.', 'not_found');

  const [session] = await db
    .select()
    .from(examSessions)
    .where(and(eq(examSessions.id, parsed.data), eq(examSessions.userId, userId)))
    .limit(1);

  if (!session) throw new HttpError(404, 'Test not found.', 'not_found');
  return session;
}

/**
 * Scores and closes a session of either exam
 */
function submitSession(session: ExamSession, model?: string): Promise<{ session: ExamSession; xpEarned: number }> {
  return session.exam === 'ielts' ? submitIelts(session, model) : submitToeic(session);
}

/**
 * Closes an IELTS session: listening and reading are scored now, writing and speaking are graded in the background
 */
async function submitIelts(session: ExamSession, model?: string): Promise<{ session: ExamSession; xpEarned: number }> {
  const blueprint = session.blueprint as IeltsBlueprint;
  const result = scoreIeltsObjective(blueprint, await loadIeltsGroups(blueprint), session.answers as Record<string, number | string>);

  const [closed] = await db
    .update(examSessions)
    .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date(), result })
    .where(and(eq(examSessions.id, session.id), eq(examSessions.status, 'in_progress')))
    .returning();

  if (!closed) {
    const [current] = await db.select().from(examSessions).where(eq(examSessions.id, session.id));
    return { session: current, xpEarned: 0 };
  }

  const durationSec = Math.round((Date.now() - session.startedAt.getTime()) / 1000);
  const label = session.mode === 'part' ? 'IELTS practice' : `IELTS ${session.mode} test`;
  let xpEarned = 0;
  for (const name of ['listening', 'reading'] as const) {
    const section = result[name];
    if (!section) continue;
    const recorded = await recordAttempt(session.userId, {
      activity: name === 'listening' ? 'ielts-listening' : 'ielts-reading',
      contentRef: session.id,
      title: `${label} · ${name === 'listening' ? 'Listening' : 'Reading'}`,
      score: section.correct,
      maxScore: section.total,
      durationSec,
      details: { mode: session.mode, band: section.band },
    });
    xpEarned += recorded.xpEarned;
  }

  if (result.writing || result.speaking) void gradeIeltsSession(session.id, model);
  return { session: closed, xpEarned };
}

/**
 * Session as the client sees it, for either exam
 */
async function viewOf(session: ExamSession) {
  if (session.exam === 'ielts') {
    return ieltsSessionView(session, await loadIeltsGroups(session.blueprint as IeltsBlueprint));
  }
  const blueprint = session.blueprint as Blueprint;
  return { ...sessionView(session, await loadGroups(blueprint)), title: await titleOf(blueprint) };
}

/**
 * Scores and closes a TOEIC session, recording one attempt per tested section
 */
async function submitToeic(session: ExamSession): Promise<{ session: ExamSession; xpEarned: number }> {
  const blueprint = session.blueprint as Blueprint;
  const groups = await loadGroups(blueprint);
  const result = scoreSession(blueprint, groups, session.answers as Record<string, number>);

  // Guard against a double submit racing: only the request that flips the status records attempts
  const [closed] = await db
    .update(examSessions)
    .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date(), result })
    .where(and(eq(examSessions.id, session.id), eq(examSessions.status, 'in_progress')))
    .returning();

  if (!closed) {
    const [current] = await db.select().from(examSessions).where(eq(examSessions.id, session.id));
    return { session: current, xpEarned: 0 };
  }

  const durationSec = Math.round((Date.now() - session.startedAt.getTime()) / 1000);
  const label =
    session.mode === 'part'
      ? `TOEIC Part ${blueprint.sections[0]?.part}`
      : session.mode === 'official'
        ? `TOEIC ${await importTitle(blueprint.importId)}`
        : `TOEIC ${session.mode} test`;
  let xpEarned = 0;

  for (const name of ['listening', 'reading'] as const) {
    const section = result.sections[name];
    if (!section) continue;
    const recorded = await recordAttempt(session.userId, {
      activity: name === 'listening' ? 'toeic-listening' : 'toeic-reading',
      contentRef: session.id,
      title: `${label} · ${name === 'listening' ? 'Listening' : 'Reading'}`,
      score: section.correct,
      maxScore: section.total,
      durationSec,
      details: { mode: session.mode, scaled: section.scaled },
    });
    xpEarned += recorded.xpEarned;
  }

  return { session: closed, xpEarned };
}

/**
 * Submits sessions whose time ran out while the learner was away
 */
async function expireIfOverdue(session: ExamSession): Promise<ExamSession> {
  if (session.status === 'in_progress' && Date.now() > deadlineMs(session)) {
    return (await submitSession(session)).session;
  }
  return session;
}

/**
 * Published imported tests with their question counts
 */
async function officialTests() {
  const imports = await db
    .select({ id: importJobs.id, title: importJobs.title, publishedAt: importJobs.publishedAt })
    .from(importJobs)
    .where(and(eq(importJobs.status, 'published'), eq(importJobs.exam, 'toeic')))
    .orderBy(desc(importJobs.publishedAt));

  return Promise.all(
    imports.map(async (imp) => {
      const blueprint = await officialBlueprint(imp.id);
      const groups = blueprint ? await loadGroups(blueprint) : new Map();
      const questions =
        blueprint?.sections.reduce(
          (sum, section) => sum + section.groupIds.reduce((n, id) => n + (groups.has(id) ? groupQuestions(section.part, groups.get(id)).length : 0), 0),
          0
        ) ?? 0;
      return {
        id: imp.id,
        title: imp.title,
        parts: blueprint?.sections.map((s) => s.part) ?? [],
        questions,
        minutes: blueprint ? officialTimeLimit(blueprint, groups) / 60 : 0,
      };
    })
  );
}

/**
 * Creates the exam router
 * @returns Router mounted at /api
 */
export function createExamRouter(): Router {
  const router = Router();

  /**
   * GET /exams/toeic/catalog - Modes, parts, and how many groups the bank holds
   */
  router.get('/exams/toeic/catalog', requireAuth, async (_req, res) => {
    const bank = await bankCounts();
    res.json({
      modes: {
        mini: { minutes: MODE_MINUTES.mini, parts: TOEIC_PARTS.length },
        full: { minutes: MODE_MINUTES.full, questions: TOEIC_PARTS.reduce((sum, p) => sum + PART_CONFIG[p].officialQuestions, 0) },
      },
      parts: TOEIC_PARTS.map((part) => ({
        part,
        section: PART_CONFIG[part].section,
        questions: PART_CONFIG[part].officialQuestions,
        minutes: PART_CONFIG[part].partMinutes,
        bankGroups: bank[part],
      })),
      officialTests: await officialTests(),
    });
  });

  /**
   * POST /exams/toeic/sessions - Start a mini, part or full test
   * Generates a few missing groups on the spot; larger gaps need the admin to fill the bank
   * @throws {409} bank_insufficient with the missing group counts
   */
  router.post('/exams/toeic/sessions', requireAuth, async (req, res) => {
    const body = startSchema.parse(req.body);
    const user = currentUser(req);
    const mode = body.mode as ExamMode;
    const part = body.part as ToeicPart | undefined;

    if (mode === 'official') {
      const [imp] = await db
        .select({ status: importJobs.status })
        .from(importJobs)
        .where(eq(importJobs.id, body.importId!))
        .limit(1);
      const blueprint = imp?.status === 'published' ? await officialBlueprint(body.importId!) : null;
      if (!blueprint) throw new HttpError(404, 'Test not found.', 'not_found');

      const groups = await loadGroups(blueprint);
      const [session] = await db
        .insert(examSessions)
        .values({ userId: user.id, exam: 'toeic', mode, blueprint, timeLimitSec: officialTimeLimit(blueprint, groups) })
        .returning();
      res.status(201).json({ session: { ...sessionView(session, groups), title: await titleOf(blueprint) } });
      return;
    }

    let assembled = await assembleBlueprint(user.id, mode, part);

    if ('missing' in assembled) {
      const missingTotal = Object.values(assembled.missing).reduce((sum, n) => sum + (n ?? 0), 0);
      if (missingTotal > ON_DEMAND_GROUP_LIMIT) {
        res.status(409).json({
          error: 'There are not enough questions in the test bank yet. Ask the admin to add more.',
          statusCode: 409,
          code: 'bank_insufficient',
          missing: assembled.missing,
        });
        return;
      }

      const requests = Object.entries(assembled.missing).map(([p, count]) => ({ part: Number(p) as ToeicPart, count: count ?? 0 }));
      const { failed } = await generateGroups(user, requests, 'B1', 'exam-generate', body.model);
      if (failed > 0) {
        throw new HttpError(502, 'Could not prepare all questions. Please try again.', 'ai_invalid_output');
      }
      assembled = await assembleBlueprint(user.id, mode, part);
      if ('missing' in assembled) {
        throw new HttpError(502, 'Could not prepare all questions. Please try again.', 'ai_invalid_output');
      }
    }

    const [session] = await db
      .insert(examSessions)
      .values({ userId: user.id, exam: 'toeic', mode, blueprint: assembled.blueprint, timeLimitSec: timeLimitFor(mode, part) })
      .returning();

    res.status(201).json({ session: await viewOf(session) });
  });

  /**
   * GET /exams/sessions - The caller's tests, newest first
   */
  router.get('/exams/sessions', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const rows = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.userId, user.id))
      .orderBy(desc(examSessions.startedAt))
      .limit(HISTORY_LIMIT);

    const sessions = await Promise.all(rows.map(expireIfOverdue));
    res.json({
      sessions: await Promise.all(sessions.map(async (s) => ({
        id: s.id,
        exam: s.exam,
        mode: s.mode,
        parts: s.exam === 'toeic' ? (s.blueprint as Blueprint).sections.map((sec) => sec.part) : [],
        components: s.exam === 'ielts' ? (s.blueprint as IeltsBlueprint).sections.map((sec) => sec.component) : [],
        importId: s.exam === 'toeic' ? ((s.blueprint as Blueprint).importId ?? null) : null,
        title: s.exam === 'toeic' ? await titleOf(s.blueprint as Blueprint) : null,
        status: s.status,
        startedAt: s.startedAt,
        submittedAt: s.submittedAt,
        deadline: new Date(s.startedAt.getTime() + s.timeLimitSec * 1000),
        result: s.result,
      }))),
    });
  });

  /**
   * GET /exams/sessions/:id - Questions (answers hidden) or the full review after submit
   */
  router.get('/exams/sessions/:id', requireAuth, async (req, res) => {
    const session = await expireIfOverdue(await loadSession(String(req.params.id), currentUser(req).id));
    res.json({ session: await viewOf(session) });
  });

  /**
   * PATCH /exams/sessions/:id - Autosave answers and flags (merged)
   * @throws {409} time_up after the deadline, already_submitted after submit
   */
  router.patch('/exams/sessions/:id', requireAuth, async (req, res) => {
    const body = saveSchema.parse(req.body);
    const session = await loadSession(String(req.params.id), currentUser(req).id);

    if (session.status !== 'in_progress') throw new HttpError(409, 'This test has already been submitted.', 'already_submitted');
    if (Date.now() > deadlineMs(session)) throw new HttpError(409, 'Time is up for this test.', 'time_up');

    const answers = { ...(session.answers as Record<string, number | string>) };
    for (const [questionId, choice] of Object.entries(body.answers ?? {})) {
      if (choice === null) delete answers[questionId];
      else answers[questionId] = choice;
    }

    await db
      .update(examSessions)
      .set({ answers, ...(body.flags && { flags: body.flags }), updatedAt: new Date() })
      .where(eq(examSessions.id, session.id));

    res.json({ saved: Object.keys(answers).length });
  });

  /**
   * POST /exams/sessions/:id/submit - Score the test and reveal the review
   */
  router.post('/exams/sessions/:id/submit', requireAuth, async (req, res) => {
    const { model } = gradeSchema.parse(req.body ?? {});
    const session = await loadSession(String(req.params.id), currentUser(req).id);
    const { session: closed, xpEarned } = await submitSession(session, model);
    res.json({ session: await viewOf(closed), xpEarned });
  });

  /**
   * POST /exams/sessions/:id/grade - Retry AI grading of IELTS writing and speaking after a failure
   */
  router.post('/exams/sessions/:id/grade', requireAuth, async (req, res) => {
    const { model } = gradeSchema.parse(req.body ?? {});
    const session = await loadSession(String(req.params.id), currentUser(req).id);
    const result = session.result as IeltsResult | null;
    if (session.exam !== 'ielts' || session.status !== 'submitted' || !result) throw new HttpError(409, 'Nothing to grade.', 'nothing_to_grade');

    const retry = <T extends { status: string; error?: string }>(part: T | null): T | null =>
      part && part.status === 'failed' ? { ...part, status: 'pending', error: undefined } : part;
    const next = { ...result, writing: retry(result.writing), speaking: retry(result.speaking) };
    const [updated] = await db.update(examSessions).set({ result: next, updatedAt: new Date() }).where(eq(examSessions.id, session.id)).returning();
    void gradeIeltsSession(session.id, model);
    res.json({ session: await viewOf(updated) });
  });

  /**
   * GET /exams/ielts/catalog - Modes, parts and bank sizes
   */
  router.get('/exams/ielts/catalog', requireAuth, async (_req, res) => {
    const bank = await ieltsBankCounts();
    res.json({
      modes: { mini: { minutes: ieltsTimeLimit('mini') / 60 }, full: { minutes: ieltsTimeLimit('full') / 60 } },
      parts: IELTS_PARTS.map((part) => ({ part, minutes: ieltsTimeLimit('part', part) / 60 })),
      bank,
    });
  });

  /**
   * POST /exams/ielts/sessions - Start a mini, part or full IELTS test
   * @throws {409} bank_insufficient when more groups are missing than can be generated on the spot
   */
  router.post('/exams/ielts/sessions', requireAuth, async (req, res) => {
    const body = ieltsStartSchema.parse(req.body);
    const user = currentUser(req);
    const mode = body.mode as IeltsMode;
    const part = body.part as IeltsPart | undefined;

    let assembled = await assembleIelts(user.id, mode, part);
    if ('missing' in assembled) {
      const requests = Object.entries(assembled.missing).map(([slot, count]) => ({ slot: slot as IeltsSlot, count: count ?? 0 }));
      if (requests.reduce((sum, r) => sum + r.count, 0) > IELTS_ON_DEMAND_LIMIT) {
        res.status(409).json({
          error: 'There are not enough questions in the test bank yet. Ask the admin to add more.',
          statusCode: 409,
          code: 'bank_insufficient',
          missing: assembled.missing,
        });
        return;
      }
      const { failed } = await generateIeltsGroups(user, requests, 'B2', 'exam-generate', body.model);
      if (failed > 0) throw new HttpError(502, 'Could not prepare all questions. Please try again.', 'ai_invalid_output');
      assembled = await assembleIelts(user.id, mode, part);
      if ('missing' in assembled) throw new HttpError(502, 'Could not prepare all questions. Please try again.', 'ai_invalid_output');
    }

    const [session] = await db
      .insert(examSessions)
      .values({ userId: user.id, exam: 'ielts', mode, blueprint: assembled.blueprint, timeLimitSec: ieltsTimeLimit(mode, part) })
      .returning();
    res.status(201).json({ session: await viewOf(session) });
  });

  /**
   * GET /admin/ielts-bank - Groups per IELTS slot and what a full test needs
   */
  router.get('/admin/ielts-bank', requireAuth, requireRole('admin'), async (_req, res) => {
    const bank = await ieltsBankCounts();
    res.json({ slots: IELTS_SLOTS.map((slot) => ({ slot, groups: bank[slot], fullTestGroups: FULL_TEST_GROUPS[slot] })) });
  });

  /**
   * POST /admin/ielts-bank/fill - Generate more groups for one slot
   */
  router.post('/admin/ielts-bank/fill', requireAuth, requireRole('admin'), async (req, res) => {
    const body = ieltsFillSchema.parse(req.body);
    const { created, failed } = await generateIeltsGroups(currentUser(req), [{ slot: body.slot, count: body.count }], body.level, 'exam-bank', body.model);
    res.status(created.length > 0 ? 201 : 502).json({ created: created.length, failed });
  });

  /**
   * GET /admin/exam-bank - Groups per part and what a full test needs
   */
  router.get('/admin/exam-bank', requireAuth, requireRole('admin'), async (_req, res) => {
    const bank = await bankCounts();
    res.json({
      parts: TOEIC_PARTS.map((part) => ({
        part,
        groups: bank[part],
        fullTestGroups: Math.ceil(PART_CONFIG[part].officialQuestions / QUESTIONS_PER_GROUP[part]),
      })),
    });
  });

  /**
   * POST /admin/exam-bank/fill - Generate more groups for one part
   */
  router.post('/admin/exam-bank/fill', requireAuth, requireRole('admin'), async (req, res) => {
    const body = fillSchema.parse(req.body);
    const user = currentUser(req);
    const { created, failed } = await generateGroups(user, [{ part: body.part as ToeicPart, count: body.count }], body.level, 'exam-bank', body.model);
    res.status(created.length > 0 ? 201 : 502).json({ created: created.length, failed });
  });

  return router;
}
