/**
 * Curriculum Routes
 * The fixed lesson path of a skill, one lesson (learn, model, drills, task), its scored task, and admin review
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { skillLevels, skillUnitProgress, skillUnits } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { runAIJson, SCORING_MAX_TOKENS, SCORING_TIMEOUT_MS } from '../services/ai.js';
import { recordAttempt } from '../services/progress.js';
import { writingFeedback } from '../content/schemas.js';
import { recordWritingMistakes, sanitizeCorrections } from '../grammar/mistakes.js';
import {
  CURRICULUM_SKILLS,
  UNIT_LEVELS,
  UNITS,
  checklistResult,
  unitContent,
  unitDraftPrompt,
  unitMeta,
  unitScoringPrompt,
  unitsOf,
  type UnitContent,
  type UnitLevel,
  type UnitMeta,
} from '../curriculum/units.js';

const unitFeedback = writingFeedback.extend(checklistResult.shape);
const drillsSchema = z.object({ correct: z.number().int().min(0).max(20), total: z.number().int().min(1).max(20) });
const writeSchema = z.object({
  response: z.string().trim().min(1).max(6000),
  durationSec: z.number().int().min(0).max(4 * 60 * 60).optional(),
  model: z.string().max(100).optional(),
});
const saveSchema = z.object({ content: unitContent, status: z.enum(['draft', 'reviewed']) });
const draftSchema = z.object({ model: z.string().max(100).optional() });

type ProgressRow = typeof skillUnitProgress.$inferSelect;

const metaOf = (id: string): UnitMeta => {
  const meta = unitMeta(id);
  if (!meta) throw new HttpError(404, 'Lesson not found.', 'not_found');
  return meta;
};

const levelIndex = (level: string | null | undefined) => (level ? UNIT_LEVELS.indexOf(level as UnitLevel) : -1);

/**
 * Which lessons are open on a fixed path: a lesson opens once every earlier lesson is done, below the learner's
 * measured level, or not written yet (so a missing lesson never blocks the path)
 */
export function openFlags(units: UnitMeta[], done: Set<string>, ready: Set<string>, learnerLevel: string | null): boolean[] {
  const learner = levelIndex(learnerLevel);
  let open = true;
  return units.map((unit) => {
    const flag = open;
    const passable = done.has(unit.id) || !ready.has(unit.id) || levelIndex(unit.level) < learner;
    open = open && passable;
    return flag;
  });
}

const progressView = (row: ProgressRow | undefined) =>
  row ? { drillScore: row.drillScore, bestBand: row.bestBand, attempts: row.attempts, completedAt: row.completedAt } : null;

/**
 * The learner's state on one skill's path
 */
async function pathState(userId: string, skill: (typeof CURRICULUM_SKILLS)[number]) {
  const units = unitsOf(skill);
  const [contentRows, progressRows, [level]] = await Promise.all([
    db.select({ id: skillUnits.id, status: skillUnits.status }).from(skillUnits),
    db.select().from(skillUnitProgress).where(eq(skillUnitProgress.userId, userId)),
    db
      .select({ level: skillLevels.level })
      .from(skillLevels)
      .where(and(eq(skillLevels.userId, userId), eq(skillLevels.language, 'en'), eq(skillLevels.skill, skill))),
  ]);
  const ready = new Set(contentRows.map((r) => r.id));
  const progress = new Map(progressRows.map((r) => [r.unitId, r]));
  const done = new Set(progressRows.filter((r) => r.completedAt).map((r) => r.unitId));
  const learnerLevel = level?.level ?? null;
  const open = openFlags(units, done, ready, learnerLevel);
  return { units, ready, progress, open, learnerLevel };
}

async function loadContent(id: string): Promise<UnitContent> {
  const [row] = await db.select({ content: skillUnits.content }).from(skillUnits).where(eq(skillUnits.id, id));
  if (!row) throw new HttpError(404, 'This lesson has not been written yet.', 'not_ready');
  return row.content as UnitContent;
}

/** Practice (drills, task) is only for lessons that are open on the learner's path */
async function assertOpen(userId: string, meta: UnitMeta): Promise<void> {
  const state = await pathState(userId, meta.skill);
  if (!state.open[state.units.findIndex((u) => u.id === meta.id)]) {
    throw new HttpError(403, 'Finish the earlier lessons first.', 'locked');
  }
}

/**
 * Creates the curriculum router
 * @returns Router mounted at /api
 */
export function createCurriculumRouter(): Router {
  const router = Router();

  /**
   * GET /learn/units/:id - One lesson with the learner's progress and the next lesson
   */
  router.get('/learn/units/:id', requireAuth, async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const state = await pathState(currentUser(req).id, meta.skill);
    const index = state.units.findIndex((u) => u.id === meta.id);
    const content = await loadContent(meta.id);
    const next = state.units[index + 1];
    res.json({
      unit: { id: meta.id, skill: meta.skill, track: meta.track, level: meta.level, title: meta.title, order: index + 1, total: state.units.length },
      content,
      open: state.open[index],
      progress: progressView(state.progress.get(meta.id)),
      next: next ? { id: next.id, title: next.title, level: next.level } : null,
    });
  });

  /**
   * POST /learn/units/:id/drills - Saves the mini-drill result
   */
  router.post('/learn/units/:id/drills', requireAuth, async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const body = drillsSchema.parse(req.body);
    const user = currentUser(req);
    await loadContent(meta.id);
    await assertOpen(user.id, meta);
    const drillScore = Math.round((Math.min(body.correct, body.total) / body.total) * 100);
    const [row] = await db
      .insert(skillUnitProgress)
      .values({ userId: user.id, unitId: meta.id, drillScore })
      .onConflictDoUpdate({ target: [skillUnitProgress.userId, skillUnitProgress.unitId], set: { drillScore, updatedAt: new Date() } })
      .returning();
    res.json({ progress: progressView(row) });
  });

  /**
   * POST /learn/units/:id/write - Scores the lesson task (band + the lesson checklist), records the attempt and
   * completes the lesson
   */
  router.post('/learn/units/:id/write', requireAuth, limitAiRequests, async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const body = writeSchema.parse(req.body);
    const user = currentUser(req);
    const content = await loadContent(meta.id);
    await assertOpen(user.id, meta);

    const prompt = unitScoringPrompt(content, body.response, user.uiLocale);
    const feedback = await runAIJson(
      user,
      {
        feature: 'score-writing',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        model: body.model,
        timeoutMs: SCORING_TIMEOUT_MS,
        maxTokens: SCORING_MAX_TOKENS,
      },
      unitFeedback
    );
    // Keep checklist entries the lesson asked for, in its order
    feedback.checklist = content.checklist.flatMap((item) => feedback.checklist.filter((c) => c.id === item.id).slice(0, 1));
    sanitizeCorrections(feedback);
    await recordWritingMistakes(user.id, feedback);

    const words = body.response.split(/\s+/).filter(Boolean).length;
    const result = await recordAttempt(user.id, {
      activity: 'writing-task',
      contentRef: `unit:${meta.id}`,
      title: meta.title.en,
      score: feedback.overallBand,
      maxScore: 9,
      durationSec: body.durationSec,
      details: { taskType: 'email', unitId: meta.id, words, response: body.response, feedback },
    });

    const now = new Date();
    const [row] = await db
      .insert(skillUnitProgress)
      .values({ userId: user.id, unitId: meta.id, bestBand: feedback.overallBand, attempts: 1, completedAt: now })
      .onConflictDoUpdate({
        target: [skillUnitProgress.userId, skillUnitProgress.unitId],
        set: {
          bestBand: sql`greatest(coalesce(${skillUnitProgress.bestBand}, 0), ${feedback.overallBand})`,
          attempts: sql`${skillUnitProgress.attempts} + 1`,
          completedAt: sql`coalesce(${skillUnitProgress.completedAt}, ${now.toISOString()}::timestamptz)`,
          updatedAt: now,
        },
      })
      .returning();

    res.json({ feedback, progress: progressView(row), ...result });
  });

  /**
   * GET /learn/:skill - The skill's lesson path with the learner's progress
   */
  router.get('/learn/:skill', requireAuth, async (req, res) => {
    const skill = z.enum(CURRICULUM_SKILLS).safeParse(req.params.skill);
    if (!skill.success) throw new HttpError(404, 'This skill has no course yet.', 'not_found');
    const state = await pathState(currentUser(req).id, skill.data);
    res.json({
      skill: skill.data,
      learnerLevel: state.learnerLevel,
      units: state.units.map((u, index) => ({
        id: u.id,
        track: u.track,
        level: u.level,
        title: u.title,
        ready: state.ready.has(u.id),
        open: state.open[index],
        progress: progressView(state.progress.get(u.id)),
      })),
    });
  });

  /**
   * GET /admin/units - Review status of every lesson
   */
  router.get('/admin/units', requireAuth, requireRole('admin'), async (_req, res) => {
    const rows = await db.select().from(skillUnits);
    const byId = new Map(rows.map((r) => [r.id, r]));
    res.json({
      units: UNITS.map((u) => {
        const row = byId.get(u.id);
        return { id: u.id, skill: u.skill, level: u.level, title: u.title, status: row?.status ?? null, edited: row?.edited ?? false, updatedAt: row?.updatedAt ?? null };
      }),
    });
  });

  /**
   * GET /admin/units/:id - The stored lesson for editing
   */
  router.get('/admin/units/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const [row] = await db.select({ content: skillUnits.content }).from(skillUnits).where(eq(skillUnits.id, meta.id));
    res.json({ content: row?.content ?? null });
  });

  /**
   * PUT /admin/units/:id - Saves an edited lesson and its review status
   */
  router.put('/admin/units/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const body = saveSchema.parse(req.body);
    const user = currentUser(req);
    const values = { content: body.content, status: body.status, edited: true, reviewedBy: body.status === 'reviewed' ? user.id : null, updatedAt: new Date() };
    await db
      .insert(skillUnits)
      .values({ id: meta.id, ...values })
      .onConflictDoUpdate({ target: skillUnits.id, set: values });
    res.json({ ok: true });
  });

  /**
   * POST /admin/units/:id/draft - A fresh AI draft for the admin to look at (not saved)
   */
  router.post('/admin/units/:id/draft', requireAuth, requireRole('admin'), limitAiRequests, async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const { model } = draftSchema.parse(req.body ?? {});
    const prompt = unitDraftPrompt(meta);
    const content = await runAIJson(
      currentUser(req),
      { feature: 'unit-draft', model, timeoutMs: 240_000, maxTokens: SCORING_MAX_TOKENS, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] },
      unitContent
    );
    res.json({ content });
  });

  return router;
}
