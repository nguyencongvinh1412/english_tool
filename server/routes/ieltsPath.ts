/**
 * IELTS Path routes: create and read the learner's path, and run its gates
 */
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { quotaDay } from '../services/aiAccess.js';
import { MAX_DAILY_MINUTES, MAX_OVERALL_TARGET, MIN_DAILY_MINUTES, MIN_OVERALL_TARGET, overallOf, PATH_SKILLS, type PathSkill } from '../ieltsPath/bands.js';
import { activePath, archivePath, createPath, gateView, pathView, setSkillSkipped, startGateSkill, updatePath } from '../ieltsPath/service.js';

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

  return router;
}
