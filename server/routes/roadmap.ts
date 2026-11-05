/**
 * Roadmap routes: preview a plan, create it, read it with live progress, archive it
 */
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { DEFAULT_PLAN_SETTINGS } from '../roadmap/plan.js';
import { DEFAULT_THRESHOLDS } from '../roadmap/checkpoint.js';
import { getSetting, putSetting } from '../services/settings.js';
import { checkpointThresholds } from '../roadmap/checkpoints.js';
import { planSettings, sampleImpact } from '../roadmap/service.js';
import { HttpError } from '../http/errors.js';
import { assertFeature, quotaDay } from '../services/aiAccess.js';
import { weeklyCoachNote } from '../roadmap/weeklyAi.js';
import { limitAiRequests } from '../auth/middleware.js';
import { CheckpointError, getAttempt, startCheckpoint, startRemedialWeek, submitCheckpoint } from '../roadmap/checkpoints.js';
import { applySuggestion, buildWeekly } from '../roadmap/weekly.js';
import { activeRoadmap, archiveRoadmap, createRoadmap, deriveLevel, measuredLevel, previewPlan, roadmapView, type RoadmapGoalInput } from '../roadmap/service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-03-10');

const startSchema = z.object({ stageIndex: z.number().int().min(0).max(30), early: z.boolean().optional(), full: z.boolean().optional(), model: z.string().max(100).optional() });
const submitSchema = z.object({ answers: z.record(z.string(), z.number().int().min(0).max(5)) });

const goalSchema = z
  .object({
    language: z.enum(['en', 'ja']),
    goalType: z.enum(['toeic', 'ielts', 'jlpt', 'cefr']),
    targetScore: z.number().positive().max(990).nullish(),
    targetLevel: z.string().max(4).nullish(),
    fromLevel: z.string().max(4).nullish(),
    levelSource: z.enum(['self', 'derived', 'measured']).optional(),
    hoursPerWeek: z.number().min(1).max(40),
    deadline: isoDate.nullish(),
    restDays: z.array(z.number().int().min(0).max(6)).max(6).optional(),
    minSkillLevels: z.record(z.string(), z.string().max(4)).optional(),
  })
  .refine((goal) => (goal.language === 'ja') === (goal.goalType === 'jlpt') || goal.goalType === 'cefr', { message: 'This goal does not match the language', path: ['goalType'] })
  .refine((goal) => !goal.deadline || goal.deadline > quotaDay(), { message: 'The deadline must be after today', path: ['deadline'] });

/** One goal's weights: whole per cents that add up to 100 */
const weight = z.number().int().min(0).max(100);
const weightsOf = () =>
  z
    .object({ listening: weight, reading: weight, writing: weight, speaking: weight, grammar: weight, vocabulary: weight })
    .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) === 100, { message: 'The weights must add up to 100' });
const hours = z.number().min(10).max(2000);
const share = z.number().min(0).max(1);
const settingsSchema = z.object({
  plan: z.object({
    hoursPerLevel: z.object({ A1: hours, A2: hours, B1: hours, B2: hours, C1: hours, C2: hours, N5: hours, N4: hours, N3: hours, N2: hours, N1: hours }),
    withinLevelFactor: z.number().min(0.1).max(1),
    examPrepHours: z.number().min(0).max(200),
    splitFromWeeks: z.number().int().min(2).max(52),
    uncertainty: z.object({ measured: z.number().min(0).max(0.5), self: z.number().min(0).max(0.5) }),
    vocabShare: share.min(0.2),
    grammarShare: share.min(0.2),
    sessionsPerWeek: z.number().int().min(1).max(7),
    skillGapShare: z.number().min(0).max(0.5),
    skillWeights: z.object({ toeic: weightsOf(), ielts: weightsOf(), jlpt: weightsOf(), cefr: weightsOf() }),
  }),
  checkpoint: z
    .object({ unlock: z.number().min(0.3).max(1), passOverall: z.number().min(0.4).max(1), passMinSkill: z.number().min(0.2).max(1) })
    .refine((c) => c.passMinSkill <= c.passOverall, { message: 'The minimum for a skill cannot be above the overall pass mark', path: ['passMinSkill'] }),
});

export function createRoadmapRouter(): Router {
  const router = Router();

  /**
   * GET /admin/roadmap/settings - The Roadmap parameters in force, and the defaults
   */
  router.get('/admin/roadmap/settings', requireAuth, requireRole('admin'), async (_req, res) => {
    res.json({
      plan: await planSettings(),
      checkpoint: await checkpointThresholds(),
      defaults: { plan: DEFAULT_PLAN_SETTINGS, checkpoint: DEFAULT_THRESHOLDS },
      customised: [await getSetting<object>('roadmap.settings'), await getSetting<object>('roadmap.checkpoint')].some((saved) => saved !== undefined && Object.keys(saved).length > 0),
    });
  });

  /**
   * POST /admin/roadmap/settings/preview - What the proposed plan parameters would do to a typical plan, before saving
   */
  router.post('/admin/roadmap/settings/preview', requireAuth, requireRole('admin'), async (req, res) => {
    const { plan } = settingsSchema.pick({ plan: true }).parse(req.body);
    res.json(await sampleImpact(plan));
  });

  /**
   * PUT /admin/roadmap/settings - Save the parameters; they apply to plans made from now on (existing roadmaps keep theirs)
   * Send { reset: true } to go back to the defaults
   */
  router.put('/admin/roadmap/settings', requireAuth, requireRole('admin'), async (req, res) => {
    if (req.body?.reset === true) {
      await putSetting('roadmap.settings', {});
      await putSetting('roadmap.checkpoint', {});
    } else {
      const body = settingsSchema.parse(req.body);
      await putSetting('roadmap.settings', body.plan);
      await putSetting('roadmap.checkpoint', body.checkpoint);
    }
    res.json({ plan: await planSettings(), checkpoint: await checkpointThresholds() });
  });

  /**
   * GET /roadmap - The active roadmap with live progress, or { roadmap: null }
   */
  router.get('/roadmap', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const language = req.query.language === 'ja' ? 'ja' : req.query.language === 'en' ? 'en' : user.studyLanguage;
    const roadmap = await activeRoadmap(user.id, language);
    res.json(roadmap ? await roadmapView(user, roadmap) : { roadmap: null });
  });

  /**
   * GET /roadmap/derived-level - The level worked out from the learner's study data, or null
   */
  router.get('/roadmap/derived-level', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const language = req.query.language === 'ja' ? 'ja' : req.query.language === 'en' ? 'en' : user.studyLanguage;
    // A placement result is better than a guess from study data
    const measured = await measuredLevel(user.id, language);
    if (measured !== null) {
      res.json({ level: measured, source: 'measured' });
      return;
    }
    res.json({ level: await deriveLevel(user.id, language), source: 'derived' });
  });

  /**
   * POST /roadmap/preview - Stages, estimated dates and feasibility for a goal, without saving anything
   */
  router.post('/roadmap/preview', requireAuth, async (req, res) => {
    const goal = goalSchema.parse(req.body) as RoadmapGoalInput;
    const preview = await previewPlan(currentUser(req), goal);
    if (!preview) throw new HttpError(400, 'Choose a goal level or score first.', 'invalid_goal');
    res.json({ fromLevel: preview.input.fromLevel, targetLevel: preview.input.targetLevel, stages: preview.stages, plan: preview.plan });
  });

  /**
   * POST /roadmap - Create a roadmap; the learner's previous one for that language is archived
   */
  router.post('/roadmap', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const goal = goalSchema.parse(req.body) as RoadmapGoalInput;
    const roadmap = await createRoadmap(user, goal);
    if (!roadmap) throw new HttpError(400, 'Choose a goal level or score first.', 'invalid_goal');
    res.status(201).json(await roadmapView(user, roadmap));
  });

  /**
   * DELETE /roadmap - Archive the active roadmap
   */
  router.delete('/roadmap', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const language = req.query.language === 'ja' ? 'ja' : req.query.language === 'en' ? 'en' : user.studyLanguage;
    await archiveRoadmap(user.id, language);
    res.status(204).end();
  });

  /**
   * GET /roadmap/weekly - Review of the last full week, or { review: null } when there is nothing to review yet
   */
  router.get('/roadmap/weekly', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const roadmap = await activeRoadmap(user.id, user.studyLanguage);
    if (!roadmap) {
      res.json({ review: null });
      return;
    }
    const view = await roadmapView(user, roadmap);
    res.json({ review: await buildWeekly(user.id, roadmap, view.progress.current) });
  });

  /**
   * POST /roadmap/weekly/ai - A short note from the AI about last week (Plus; uses AI credits)
   */
  router.post('/roadmap/weekly/ai', requireAuth, limitAiRequests, async (req, res) => {
    const user = currentUser(req);
    await assertFeature(user, 'fullTests');
    const roadmap = await activeRoadmap(user.id, user.studyLanguage);
    const view = roadmap ? await roadmapView(user, roadmap) : null;
    const review = roadmap && view ? await buildWeekly(user.id, roadmap, view.progress.current) : null;
    if (!review) throw new HttpError(404, 'There is no week to review yet.', 'no_review');
    const { model } = z.object({ model: z.string().max(100).optional() }).parse(req.body ?? {});
    res.json({ text: await weeklyCoachNote(user, review, model) });
  });

  /** POST /roadmap/weekly/apply - Add focus tasks for the skill that fell behind */
  router.post('/roadmap/weekly/apply', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const { skill } = z.object({ skill: z.enum(['listening', 'reading', 'speaking', 'writing']) }).parse(req.body);
    const roadmap = await activeRoadmap(user.id, user.studyLanguage);
    if (!roadmap) throw new HttpError(404, 'You have no roadmap yet.', 'no_roadmap');
    res.json({ added: await applySuggestion(user.id, roadmap, skill) });
  });

  /** Checkpoint errors as HTTP errors */
  const checkpointErrors = (err: unknown): never => {
    if (!(err instanceof CheckpointError)) throw err;
    const status = err.code === 'not_found' ? 404 : err.code === 'empty_bank' || err.code === 'unavailable' ? 503 : 400;
    throw new HttpError(status, 'That checkpoint step is not available.', err.code);
  };

  /**
   * POST /roadmap/checkpoint/start - Start (or resume) the checkpoint of a level stage; it opens at 80% of the stage's
   * targets, or earlier with early: true
   */
  router.post('/roadmap/checkpoint/start', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const { stageIndex, early, full } = startSchema.parse(req.body);
    // The full checkpoint is part of Plus; the short one is free
    if (full) await assertFeature(user, 'fullTests');
    const roadmap = await activeRoadmap(user.id, user.studyLanguage);
    if (!roadmap) throw new HttpError(404, 'You have no roadmap yet.', 'no_roadmap');
    const view = await roadmapView(user, roadmap);
    try {
      res.status(201).json(await startCheckpoint(user.id, roadmap, stageIndex, view.progress.stages[stageIndex]?.progress ?? 0, early ?? false, full ?? false));
    } catch (err) {
      checkpointErrors(err);
    }
  });

  /** GET /roadmap/checkpoint/:id - Questions while in progress, the result once finished */
  router.get('/roadmap/checkpoint/:id', requireAuth, async (req, res) => {
    try {
      res.json(await getAttempt(currentUser(req).id, String(req.params.id)));
    } catch (err) {
      checkpointErrors(err);
    }
  });

  /** POST /roadmap/checkpoint/:id/submit - Grade the answers */
  router.post('/roadmap/checkpoint/:id/submit', requireAuth, async (req, res) => {
    const { answers } = submitSchema.parse(req.body);
    try {
      res.json(await submitCheckpoint(currentUser(req).id, String(req.params.id), answers));
    } catch (err) {
      checkpointErrors(err);
    }
  });

  /** POST /roadmap/checkpoint/:id/remedial - After a failed checkpoint: set up a week aimed at the weak skills */
  router.post('/roadmap/checkpoint/:id/remedial', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const roadmap = await activeRoadmap(user.id, user.studyLanguage);
    if (!roadmap) throw new HttpError(404, 'You have no roadmap yet.', 'no_roadmap');
    try {
      res.json({ tasks: await startRemedialWeek(user.id, roadmap, String(req.params.id)) });
    } catch (err) {
      checkpointErrors(err);
    }
  });

  return router;
}
