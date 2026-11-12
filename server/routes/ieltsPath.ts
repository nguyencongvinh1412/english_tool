/**
 * IELTS Path routes: create and read the learner's path, and run its gates
 */
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { quotaDay } from '../services/aiAccess.js';
import { MAX_DAILY_MINUTES, MAX_OVERALL_TARGET, MIN_DAILY_MINUTES, MIN_OVERALL_TARGET, overallOf, PATH_SKILLS, type PathSkill } from '../ieltsPath/bands.js';
import { activePath, archivePath, createPath, pathView, updatePath } from '../ieltsPath/service.js';
import { applyDecision, gateView, replan, setManualBand, setSkillSkipped, startGateSkill, startRetest } from '../ieltsPath/gates.js';
import { buildErrorBook } from '../ieltsPath/errors.js';
import { buildReport } from '../ieltsPath/report.js';
import { getSpeakingModel, listSpeakingModels } from '../ieltsPath/speakingModels.js';
import { completeLesson, learnAhead, lessonOf, pathToday, startPractice, stepOf } from '../ieltsPath/today.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-05-10');
const band = z.number().min(3).max(9).refine((b) => Number.isInteger(b * 2), 'Bands go in steps of 0.5');
const futureDate = isoDate.refine((d) => d > quotaDay(), 'The exam date must be after today');
const settings = {
  examDate: futureDate.nullable(),
  dailyMinutes: z.number().int().min(MIN_DAILY_MINUTES).max(MAX_DAILY_MINUTES),
  restDays: z.array(z.number().int().min(0).max(6)).max(3),
};

const createSchema = z
  .object({ bandTargets: z.object({ listening: band, reading: band, writing: band, speaking: band }), ...settings })
  .refine((body) => overallOf(body.bandTargets) <= MAX_OVERALL_TARGET && overallOf(body.bandTargets) >= MIN_OVERALL_TARGET, {
    message: `The overall target must be between ${MIN_OVERALL_TARGET} and ${MAX_OVERALL_TARGET}`,
    path: ['bandTargets'],
  });
const updateSchema = z.object(settings).partial();
const gateParam = z.coerce.number().int().min(0).max(6);
const skillParam = z.enum(PATH_SKILLS);

/**
 * Creates the IELTS Path router
 * @returns Router mounted at /api
 */
export function createIeltsPathRouter(): Router {
  const router = Router();

  const requirePath = async (userId: string) => {
    const path = await activePath(userId);
    if (!path) throw new HttpError(404, 'You have no IELTS path yet.', 'no_path');
    return path;
  };

  /** GET /ielts-path - The active path with Gate 0 and the time plan, or null */
  router.get('/ielts-path', requireAuth, async (req, res) => {
    const path = await activePath(currentUser(req).id);
    res.json({ path: path ? await pathView(path) : null });
  });

  /** POST /ielts-path - Start a new path (the previous one is archived) */
  router.post('/ielts-path', requireAuth, async (req, res) => {
    const body = createSchema.parse(req.body);
    const path = await createPath(currentUser(req).id, body);
    res.status(201).json({ path: await pathView(path) });
  });

  /** PATCH /ielts-path - Change the exam date, minutes a day or rest days */
  router.patch('/ielts-path', requireAuth, async (req, res) => {
    const body = updateSchema.parse(req.body);
    const path = await updatePath(await requirePath(currentUser(req).id), body);
    res.json({ path: await pathView(path) });
  });

  /** DELETE /ielts-path - Stop the active path */
  router.delete('/ielts-path', requireAuth, async (req, res) => {
    await archivePath(await requirePath(currentUser(req).id));
    res.status(204).end();
  });

  /** GET /ielts-path/gates/:gate - Skills of a gate with their status and bands */
  router.get('/ielts-path/gates/:gate', requireAuth, async (req, res) => {
    const path = await requirePath(currentUser(req).id);
    res.json({ gate: await gateView(path, gateParam.parse(req.params.gate)) });
  });

  /** POST /ielts-path/gates/:gate/skills/:skill/start - Open (or resume) the test of one skill */
  router.post('/ielts-path/gates/:gate/skills/:skill/start', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const path = await requirePath(user.id);
    const sessionId = await startGateSkill(user, path, gateParam.parse(req.params.gate), skillParam.parse(req.params.skill) as PathSkill);
    res.status(201).json({ sessionId });
  });

  /** POST /ielts-path/gates/:gate/skills/:skill/skip - Skip an optional skill ({ skipped: false } takes it back) */
  router.post('/ielts-path/gates/:gate/skills/:skill/skip', requireAuth, async (req, res) => {
    const { skipped } = z.object({ skipped: z.boolean().default(true) }).parse(req.body ?? {});
    const path = await requirePath(currentUser(req).id);
    const gate = gateParam.parse(req.params.gate);
    await setSkillSkipped(path, gate, skillParam.parse(req.params.skill) as PathSkill, skipped);
    res.json({ gate: await gateView(path, gate) });
  });

  /** POST /ielts-path/gates/:gate/retest - Open the retest (version B) of the one skill that was half a band short */
  router.post('/ielts-path/gates/:gate/retest', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const path = await requirePath(user.id);
    res.status(201).json({ sessionId: await startRetest(user, path, gateParam.parse(req.params.gate)) });
  });

  /** POST /ielts-path/gates/:gate/manual - A teacher's band for writing or speaking ({ band: null } takes it back) */
  router.post('/ielts-path/gates/:gate/manual', requireAuth, async (req, res) => {
    const body = z.object({ skill: z.enum(['writing', 'speaking']), band: band.nullable() }).parse(req.body);
    const path = await requirePath(currentUser(req).id);
    const gate = gateParam.parse(req.params.gate);
    await setManualBand(path, gate, body.skill, body.band);
    res.json({ gate: await gateView(path, gate) });
  });

  /** POST /ielts-path/gates/:gate/decision - What to do after Gate 3 or 4 (move the exam, lower the target) */
  router.post('/ielts-path/gates/:gate/decision', requireAuth, async (req, res) => {
    const { choice } = z.object({ choice: z.enum(['accept', 'decline']) }).parse(req.body);
    const path = await requirePath(currentUser(req).id);
    const gate = gateParam.parse(req.params.gate);
    await applyDecision(path, gate, choice);
    res.json({ path: await pathView((await activePath(path.userId)) ?? path) });
  });

  /** POST /ielts-path/replan - A new plan after failing a gate twice: earlier fails stop counting */
  router.post('/ielts-path/replan', requireAuth, async (req, res) => {
    const body = z.object(settings).partial().parse(req.body ?? {});
    const path = await requirePath(currentUser(req).id);
    await replan(path);
    const updated = Object.keys(body).length > 0 ? await updatePath(path, body) : ((await activePath(path.userId)) ?? path);
    res.json({ path: await pathView(updated) });
  });

  /** GET /ielts-path/errors - The learner's error book: listening mistakes by kind, reading by question type, writing and speaking by criterion */
  router.get('/ielts-path/errors', requireAuth, async (req, res) => {
    res.json({ book: await buildErrorBook(currentUser(req).id) });
  });

  /** GET /ielts-path/report - Progress against the targets, the gates, what to work on, and the AI against a teacher */
  router.get('/ielts-path/report', requireAuth, async (req, res) => {
    res.json({ report: await buildReport(await requirePath(currentUser(req).id)) });
  });

  /** GET /ielts-path/speaking-models - The topics of the model speaking answers (grouped by the page) */
  router.get('/ielts-path/speaking-models', requireAuth, async (_req, res) => {
    res.json({ topics: await listSpeakingModels() });
  });

  /** GET /ielts-path/speaking-models/:id - One topic: its questions of Parts 1 to 3 with the model answer, and the vocabulary */
  router.get('/ielts-path/speaking-models/:id', requireAuth, async (req, res) => {
    res.json({ topic: await getSpeakingModel(String(req.params.id)) });
  });

  /** GET /ielts-path/today - The steps to do today, how far behind or ahead the learner is, and the expected end */
  router.get('/ielts-path/today', requireAuth, async (req, res) => {
    const path = await activePath(currentUser(req).id);
    res.json({ today: path ? await pathToday(path) : null });
  });

  /** POST /ielts-path/ahead - Learn ahead: one more day's minutes for today */
  router.post('/ielts-path/ahead', requireAuth, async (req, res) => {
    const path = await requirePath(currentUser(req).id);
    await learnAhead(path);
    res.json({ today: await pathToday((await activePath(path.userId)) ?? path) });
  });

  /** GET /ielts-path/steps/:id - A lesson step with its teaching content */
  router.get('/ielts-path/steps/:id', requireAuth, async (req, res) => {
    const step = await stepOf(currentUser(req).id, String(req.params.id));
    const lesson = await lessonOf(step);
    res.json({ step: { id: step.id, phase: step.phase, week: step.week, day: step.studyDay, block: step.block, minutes: step.minutes, done: step.status === 'done' }, ...lesson });
  });

  /** POST /ielts-path/steps/:id/complete - Finish a lesson, with its drill result */
  router.post('/ielts-path/steps/:id/complete', requireAuth, async (req, res) => {
    const body = z.object({ correct: z.number().int().min(0).max(20), total: z.number().int().min(1).max(20) }).nullable().default(null).parse(req.body?.drills ?? null);
    const step = await stepOf(currentUser(req).id, String(req.params.id));
    await completeLesson(step, body);
    res.json({ ok: true });
  });

  /** POST /ielts-path/steps/:id/practice - Open the exercise of a practice step as a test session */
  router.post('/ielts-path/steps/:id/practice', requireAuth, limitAiRequests, async (req, res) => {
    const { model } = z.object({ model: z.string().max(100).optional() }).parse(req.body ?? {});
    const user = currentUser(req);
    const step = await stepOf(user.id, String(req.params.id));
    res.status(201).json({ sessionId: await startPractice(user, step, model) });
  });

  return router;
}
