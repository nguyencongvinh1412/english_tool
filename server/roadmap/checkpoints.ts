/**
 * Running a checkpoint: start (or resume) an attempt, serve its questions without the answers, grade the
 * submitted answers, and, when it was not passed, set up a remedial week aimed at the weak skills.
 */
import { randomInt } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { checkpointAttempts, grammarProgress, placementQuestions, roadmapTasks, type Roadmap } from '../db/schema.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { masteryOf } from '../grammar/practice.js';
import { PLACEMENT_SKILLS, type PlacementSkill } from '../placement/engine.js';
import { quotaDay } from '../services/aiAccess.js';
import type { TodayTask } from '../progress/today.js';
import { DEFAULT_THRESHOLDS, grade, MIN_BANK, PER_SKILL, type CheckpointResult, type CheckpointThresholds } from './checkpoint.js';
import { getSetting } from '../services/settings.js';

/** Thresholds with the admin's changes over the defaults */
export async function checkpointThresholds(): Promise<CheckpointThresholds> {
  return { ...DEFAULT_THRESHOLDS, ...(await getSetting<Partial<CheckpointThresholds>>('roadmap.checkpoint')) };
}
import { addDays, type Stage } from './plan.js';

export class CheckpointError extends Error {
  constructor(public code: 'not_found' | 'locked' | 'not_a_level_stage' | 'empty_bank' | 'unavailable' | 'already_finished' | 'not_failed') {
    super(code);
  }
}

interface Asked {
  id: string;
  skill: PlacementSkill;
}

export interface PublicCheckpointQuestion {
  id: string;
  skill: PlacementSkill;
  prompt: string;
  context: string | null;
  options: string[];
}

/** The latest state of the checkpoint for a stage, for the roadmap screens */
export async function checkpointState(roadmapId: string, stageIndex: number, progress: number) {
  const attempts = await db
    .select()
    .from(checkpointAttempts)
    .where(and(eq(checkpointAttempts.roadmapId, roadmapId), eq(checkpointAttempts.stageIndex, stageIndex)))
    .orderBy(desc(checkpointAttempts.startedAt));
  const open = attempts.find((a) => a.status === 'in_progress');
  const last = attempts.find((a) => a.status === 'finished');
  return {
    stageIndex,
    unlocked: progress >= (await checkpointThresholds()).unlock,
    inProgressId: open?.id ?? null,
    lastAttempt: last ? { id: last.id, passed: Boolean(last.passed), overall: (last.result as CheckpointResult).overall, finishedAt: last.finishedAt } : null,
    passed: attempts.some((a) => a.passed === true),
  };
}

/** Stages whose checkpoint was passed */
export async function passedStages(roadmapId: string): Promise<Set<number>> {
  const rows = await db.select({ stage: checkpointAttempts.stageIndex }).from(checkpointAttempts).where(and(eq(checkpointAttempts.roadmapId, roadmapId), eq(checkpointAttempts.passed, true)));
  return new Set(rows.map((r) => r.stage));
}

/** Picks the questions for a stage's level: a few per skill, at random */
async function pickQuestions(level: string, full = false): Promise<Asked[]> {
  const picked: Asked[] = [];
  for (const skill of PLACEMENT_SKILLS) {
    const rows = await db
      .select({ id: placementQuestions.id })
      .from(placementQuestions)
      .where(and(eq(placementQuestions.language, 'en'), eq(placementQuestions.skill, skill), eq(placementQuestions.level, level), eq(placementQuestions.status, 'approved')));
    if (rows.length < MIN_BANK) continue;
    const pool = rows.map((r) => r.id);
    const count = Math.min(PER_SKILL[skill] * (full ? FULL_FACTOR : 1), pool.length);
    for (let i = 0; i < count; i++) picked.push({ id: pool.splice(randomInt(pool.length), 1)[0], skill });
  }
  return picked;
}

async function questionsOf(asked: Asked[]): Promise<PublicCheckpointQuestion[]> {
  const rows = asked.length ? await db.select().from(placementQuestions).where(inArray(placementQuestions.id, asked.map((a) => a.id))) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return asked.flatMap((a) => {
    const r = byId.get(a.id);
    return r ? [{ id: r.id, skill: a.skill, prompt: r.prompt, context: r.context, options: r.options as string[] }] : [];
  });
}

/** The full checkpoint (Plus) asks this many times as many questions per skill as the short one */
export const FULL_FACTOR = 2;

export async function startCheckpoint(userId: string, roadmap: Roadmap, stageIndex: number, progress: number, early: boolean, full = false) {
  if (roadmap.language !== 'en') throw new CheckpointError('unavailable');
  const stage = (roadmap.stages as Stage[])[stageIndex];
  if (!stage) throw new CheckpointError('not_found');
  if (stage.kind !== 'level') throw new CheckpointError('not_a_level_stage');
  if (progress < (await checkpointThresholds()).unlock && !early) throw new CheckpointError('locked');

  const [open] = await db
    .select()
    .from(checkpointAttempts)
    .where(and(eq(checkpointAttempts.roadmapId, roadmap.id), eq(checkpointAttempts.stageIndex, stageIndex), eq(checkpointAttempts.status, 'in_progress')))
    .limit(1);
  if (open) return { id: open.id, stageIndex, questions: await questionsOf(open.questions as Asked[]) };

  const asked = await pickQuestions(stage.level, full);
  if (asked.length === 0) throw new CheckpointError('empty_bank');
  const [row] = await db.insert(checkpointAttempts).values({ roadmapId: roadmap.id, userId, stageIndex, questions: asked }).returning();
  return { id: row.id, stageIndex, questions: await questionsOf(asked) };
}

export async function getAttempt(userId: string, id: string) {
  const [row] = await db.select().from(checkpointAttempts).where(and(eq(checkpointAttempts.id, id), eq(checkpointAttempts.userId, userId))).limit(1);
  if (!row) throw new CheckpointError('not_found');
  return {
    id: row.id,
    stageIndex: row.stageIndex,
    status: row.status,
    questions: row.status === 'in_progress' ? await questionsOf(row.questions as Asked[]) : [],
    result: row.result as CheckpointResult | null,
    passed: row.passed,
  };
}

/** Grades the answers (question id to the chosen option); unanswered questions count as wrong */
export async function submitCheckpoint(userId: string, id: string, answers: Record<string, number>) {
  const [row] = await db.select().from(checkpointAttempts).where(and(eq(checkpointAttempts.id, id), eq(checkpointAttempts.userId, userId))).limit(1);
  if (!row) throw new CheckpointError('not_found');
  if (row.status === 'finished') throw new CheckpointError('already_finished');
  const asked = row.questions as Asked[];
  const rows = await db.select({ id: placementQuestions.id, answerIndex: placementQuestions.answerIndex }).from(placementQuestions).where(inArray(placementQuestions.id, asked.map((a) => a.id)));
  const key = new Map(rows.map((r) => [r.id, r.answerIndex]));
  const result = grade(asked.map((a) => ({ skill: a.skill, correct: answers[a.id] === key.get(a.id) })), await checkpointThresholds());
  await db.update(checkpointAttempts).set({ status: 'finished', result, passed: result.passed, finishedAt: new Date() }).where(eq(checkpointAttempts.id, id));
  return { id, stageIndex: row.stageIndex, status: 'finished' as const, questions: [], result, passed: result.passed };
}

/** The first grammar point of a level the learner has not got to "good" yet (or just the first of the level) */
async function grammarFocus(userId: string, level: string): Promise<{ id: string; cefr: string } | null> {
  const at = GRAMMAR_POINTS.filter((p) => p.cefr === level);
  if (at.length === 0) return null;
  const progress = await db.select().from(grammarProgress).where(eq(grammarProgress.userId, userId));
  const mastery = new Map(progress.map((p) => [p.pointId, masteryOf(p.intervalDays)]));
  return at.find((p) => !['good', 'mastered'].includes(mastery.get(p.id) ?? '')) ?? at[0];
}

export const REMEDIAL_DAYS = 5;

/**
 * A remedial week after a failed checkpoint: one task a day for the next days, rotating through the weak skills.
 * The tasks are stored as the day's focus tasks, so Today shows them next to the usual ones.
 * @returns how many tasks were set up
 */
export async function startRemedialWeek(userId: string, roadmap: Roadmap, attemptId: string): Promise<number> {
  const [row] = await db.select().from(checkpointAttempts).where(and(eq(checkpointAttempts.id, attemptId), eq(checkpointAttempts.userId, userId))).limit(1);
  if (!row) throw new CheckpointError('not_found');
  if (row.status !== 'finished' || row.passed) throw new CheckpointError('not_failed');
  const weak = (row.result as CheckpointResult).weak.slice(0, 3);
  if (weak.length === 0) return 0;
  const stage = (roadmap.stages as Stage[])[row.stageIndex];
  const point = weak.includes('grammar') ? await grammarFocus(userId, stage.level) : null;

  const taskFor = (skill: PlacementSkill): TodayTask | null => {
    const base = { id: `focus-${skill}`, done: false };
    switch (skill) {
      case 'reading':
      case 'listening':
        return { ...base, type: 'practice-skill', skill, minutes: 15 };
      case 'vocabulary':
        return { ...base, type: 'learn-words', level: stage.level, remaining: 0, minutes: 8 };
      case 'grammar':
        return point ? { ...base, type: 'learn-grammar', pointId: point.id, level: stage.level, minutes: 12 } : null;
    }
  };

  const today = quotaDay();
  let created = 0;
  for (let i = 0; i < REMEDIAL_DAYS; i++) {
    const task = taskFor(weak[i % weak.length]);
    if (!task) continue;
    const day = addDays(today, i + 1);
    const inserted = await db.insert(roadmapTasks).values({ roadmapId: roadmap.id, userId, day, taskKey: `focus-${(task as { id: string }).id.slice(6)}`, task }).onConflictDoNothing().returning({ id: roadmapTasks.id });
    created += inserted.length;
  }
  return created;
}
