/**
 * Roadmap service: build a plan for a learner, store it, and read it back with live progress.
 * Progress is never stored: it is counted from what the learner has actually done since the roadmap started.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts, examSessions, roadmaps, skillLevels, type Roadmap, type User } from '../db/schema.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { overallLevel as placementOverall, type PlacementSkill, type SkillResult } from '../placement/engine.js';
import { grammarState, vocabByLevel } from '../progress/journey.js';
import { cefrOfIelts, cefrOfToeic, CEFR_ORDER, JLPT_ORDER } from '../progress/levels.js';
import { quotaDay } from '../services/aiAccess.js';
import { getSetting } from '../services/settings.js';
import { checkpointState, passedStages as loadPassedStages } from './checkpoints.js';
import { addDays, buildPlan, DEFAULT_PLAN_SETTINGS, type SkillWeightGoal, levelOrder, type SkillName, type Catalog, type GoalType, type Language, type PlanInput, type PlanSettings, type Stage, type TimePlan } from './plan.js';

export interface RoadmapGoalInput {
  language: Language;
  goalType: GoalType;
  targetScore?: number | null;
  targetLevel?: string | null;
  fromLevel?: string | null;
  /** self (picked by the learner) or derived (offered from their study data and kept) */
  levelSource?: 'self' | 'derived' | 'measured';
  hoursPerWeek: number;
  deadline?: string | null;
  restDays?: number[];
  minSkillLevels?: Record<string, string>;
}

/** Admin-tunable settings over the defaults (saved under "roadmap.settings") */
export async function planSettings(): Promise<PlanSettings> {
  const saved = await getSetting<Partial<PlanSettings>>('roadmap.settings');
  return {
    ...DEFAULT_PLAN_SETTINGS,
    ...saved,
    hoursPerLevel: { ...DEFAULT_PLAN_SETTINGS.hoursPerLevel, ...saved?.hoursPerLevel },
    skillWeights: { ...DEFAULT_PLAN_SETTINGS.skillWeights, ...saved?.skillWeights },
  };
}

/** Words and grammar points available per level */
export async function catalogFor(language: Language): Promise<Catalog> {
  const words: Record<string, number> = {};
  for (const row of await vocabByLevel('00000000-0000-0000-0000-000000000000', language)) words[row.level] = (words[row.level] ?? 0) + row.total;
  const grammar: Record<string, number> = {};
  if (language === 'en') for (const point of GRAMMAR_POINTS) grammar[point.cefr] = (grammar[point.cefr] ?? 0) + 1;
  return { words, grammar };
}

/** The level the goal corresponds to: a score maps to a CEFR level, the others name their level */
export function resolveTargetLevel(goal: RoadmapGoalInput): string | null {
  if (goal.goalType === 'toeic' && goal.targetScore) return cefrOfToeic(goal.targetScore);
  if (goal.goalType === 'ielts' && goal.targetScore) return cefrOfIelts(goal.targetScore);
  const level = goal.targetLevel ?? null;
  return level && levelOrder(goal.language).includes(level) ? level : null;
}

/** The learner's starting level: what they chose, else what their profile says, else a beginner ('') */
export function resolveFromLevel(user: User, goal: RoadmapGoalInput): string {
  if (goal.fromLevel !== undefined && goal.fromLevel !== null) return goal.fromLevel;
  if (goal.language === 'en') return user.cefrLevel ?? '';
  return '';
}

/**
 * Levels each skill with a minimum still has to climb, from the measured skill levels. A skill that was not measured
 * (Writing and Speaking, until they can be scored) adds nothing: there is no honest number to base it on.
 */
export async function skillGapsFor(userId: string, goal: RoadmapGoalInput): Promise<Partial<Record<SkillName, number>>> {
  if (goal.language !== 'en' || !goal.minSkillLevels || (goal.goalType !== 'ielts' && goal.goalType !== 'toeic')) return {};
  const rows = await db.select().from(skillLevels).where(and(eq(skillLevels.userId, userId), eq(skillLevels.language, 'en'), eq(skillLevels.source, 'placement')));
  const measured = new Map(rows.map((r) => [r.skill, r.level]));
  const gaps: Partial<Record<SkillName, number>> = {};
  for (const [skill, value] of Object.entries(goal.minSkillLevels)) {
    const have = measured.get(skill);
    const wanted = goal.goalType === 'ielts' ? cefrOfIelts(Number(value)) : cefrOfToeic(Number(value) * 2);
    if (!have || !Number.isFinite(Number(value))) continue;
    gaps[skill as SkillName] = Math.max(0, CEFR_ORDER.indexOf(wanted) - CEFR_ORDER.indexOf(have as (typeof CEFR_ORDER)[number]));
  }
  return gaps;
}

export async function previewPlan(user: User, goal: RoadmapGoalInput, today = quotaDay()) {
  const targetLevel = resolveTargetLevel(goal);
  if (!targetLevel) return null;
  const fromLevel = resolveFromLevel(user, goal);
  const input: PlanInput = { language: goal.language, goalType: goal.goalType, fromLevel, targetLevel, hoursPerWeek: goal.hoursPerWeek, startDate: today, deadline: goal.deadline ?? null, skillGaps: await skillGapsFor(user.id, goal), measured: goal.levelSource === 'derived' || goal.levelSource === 'measured' };
  const [catalog, settings] = await Promise.all([catalogFor(goal.language), planSettings()]);
  return { input, ...buildPlan(input, catalog, settings) };
}

/**
 * What a settings change would do to a typical plan (TOEIC 600 from B1, 5 hours a week, about 12 weeks): the plan with
 * the settings in force and with the proposed ones, side by side
 */
export async function sampleImpact(proposed: PlanSettings, today = quotaDay()) {
  const goal = { goalType: 'toeic' as const, targetScore: 600 };
  const targetLevel = resolveTargetLevel({ language: 'en', hoursPerWeek: 5, ...goal }) ?? 'B2';
  const input: PlanInput = { language: 'en', goalType: 'toeic', fromLevel: 'B1', targetLevel, hoursPerWeek: 5, startDate: today, deadline: addDays(today, 84), measured: false };
  const catalog = await catalogFor('en');
  const summarize = (settings: PlanSettings) => {
    const { stages, plan } = buildPlan(input, catalog, settings);
    return { totalHours: plan.totalHours, etaFrom: plan.etaFrom, etaTo: plan.etaTo, feasibility: plan.feasibility, stages: stages.length };
  };
  return { sample: { targetScore: 600, fromLevel: 'B1', targetLevel, hoursPerWeek: 5, deadline: input.deadline }, current: summarize(await planSettings()), proposed: summarize(proposed) };
}

/** Stores a new roadmap and archives the learner's previous active one for that language */
export async function createRoadmap(user: User, goal: RoadmapGoalInput): Promise<Roadmap | null> {
  const preview = await previewPlan(user, goal);
  if (!preview) return null;
  const { input, stages, plan } = preview;
  return db.transaction(async (tx) => {
    await tx
      .update(roadmaps)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(roadmaps.userId, user.id), eq(roadmaps.language, goal.language), eq(roadmaps.status, 'active')));
    const [row] = await tx
      .insert(roadmaps)
      .values({
        userId: user.id,
        language: goal.language,
        goalType: goal.goalType,
        targetScore: goal.targetScore ?? null,
        targetLevel: input.targetLevel,
        minSkillLevels: goal.minSkillLevels ?? {},
        deadline: goal.deadline ?? null,
        hoursPerWeek: goal.hoursPerWeek,
        restDays: goal.restDays ?? [],
        startDate: input.startDate,
        fromLevel: input.fromLevel,
        levelSource: goal.levelSource ?? 'self',
        stages,
        plan,
      })
      .returning();
    return row;
  });
}

export async function activeRoadmap(userId: string, language: Language): Promise<Roadmap | null> {
  const [row] = await db.select().from(roadmaps).where(and(eq(roadmaps.userId, userId), eq(roadmaps.language, language), eq(roadmaps.status, 'active'))).limit(1);
  return row ?? null;
}

export async function archiveRoadmap(userId: string, language: Language): Promise<void> {
  await db.update(roadmaps).set({ status: 'archived', updatedAt: new Date() }).where(and(eq(roadmaps.userId, userId), eq(roadmaps.language, language), eq(roadmaps.status, 'active')));
}

export interface StageProgress {
  index: number;
  /** Checkpoint passed (null for stages that have none) */
  passed: boolean | null;
  /** 0 to 1 */
  progress: number;
  vocab: { have: number; goal: number };
  grammar: { have: number; goal: number };
  sessions: { skill: string; have: number; goal: number }[];
  mockTests: { have: number; goal: number };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Pure part of progress: how far each stage is, given counts of what the learner has done
 */
export function computeProgress(
  stages: Stage[],
  counts: { masteredWords: Record<string, number>; goodGrammar: Record<string, number>; sessionsBySkill: Record<string, number>; mockTests: number },
  /** Stages whose checkpoint was passed. When given, a level stage is done only after its checkpoint is passed */
  passedStages?: ReadonlySet<number>,
  /** How much each kind of work counts (FR-RM-23); without it every part counts the same */
  weights?: Partial<Record<string, number>>
): { stages: StageProgress[]; current: number; overall: number; allPassed: boolean } {
  const used: Record<string, number> = {};
  const out: StageProgress[] = stages.map((stage) => {
    const o = stage.objectives;
    const have = {
      vocab: counts.masteredWords[stage.level] ?? 0,
      grammar: counts.goodGrammar[stage.level] ?? 0,
    };
    // Sessions are cumulative across stages: what earlier stages asked for is used up first
    const sessions = Object.entries(o.sessions).map(([skill, goal]) => {
      const before = used[skill] ?? 0;
      used[skill] = before + (goal ?? 0);
      return { skill, goal: goal ?? 0, have: Math.max(0, Math.min(goal ?? 0, (counts.sessionsBySkill[skill] ?? 0) - before)) };
    });
    const mock = { have: Math.min(o.mockTests, counts.mockTests), goal: o.mockTests };
    const parts: { weight: number; done: number }[] = [
      ...(o.vocabMastered > 0 ? [{ weight: weights?.vocabulary ?? 0, done: clamp01(have.vocab / o.vocabMastered) }] : []),
      ...(o.grammarGood > 0 ? [{ weight: weights?.grammar ?? 0, done: clamp01(have.grammar / o.grammarGood) }] : []),
      ...sessions.filter((s) => s.goal > 0).map((s) => ({ weight: weights?.[s.skill] ?? 0, done: clamp01(s.have / s.goal) })),
      ...(mock.goal > 0 ? [{ weight: 0, done: clamp01(mock.have / mock.goal) }] : []),
    ];
    // A part the table gives no weight (or no table at all) counts as much as the average of the others
    const given = parts.filter((p) => p.weight > 0).map((p) => p.weight);
    const fallback = given.length ? given.reduce((a, b) => a + b, 0) / given.length : 1;
    const weighted = parts.map((p) => ({ ...p, weight: p.weight > 0 ? p.weight : fallback }));
    const totalWeight = weighted.reduce((n, p) => n + p.weight, 0);
    const progress = totalWeight ? weighted.reduce((n, p) => n + p.weight * p.done, 0) / totalWeight : 0;
    return {
      index: stage.index,
      passed: stage.kind === 'level' && passedStages ? passedStages.has(stage.index) : null,
      progress,
      vocab: { have: Math.min(have.vocab, o.vocabMastered), goal: o.vocabMastered },
      grammar: { have: Math.min(have.grammar, o.grammarGood), goal: o.grammarGood },
      sessions,
      mockTests: mock,
    };
  });
  const totalHours = stages.reduce((n, s) => n + s.hours, 0) || 1;
  const overall = out.reduce((n, p, i) => n + p.progress * stages[i].hours, 0) / totalHours;
  const finished = (p: StageProgress) => p.progress >= 1 && p.passed !== false;
  const open = out.find((p) => !finished(p));
  return { stages: out, current: open ? open.index : Math.max(0, out.length - 1), overall, allPassed: out.every(finished) };
}

export async function roadmapView(user: User, roadmap: Roadmap) {
  const language = roadmap.language as Language;
  const stages = roadmap.stages as Stage[];
  const plan = roadmap.plan as TimePlan;

  const passed = await loadPassedStages(roadmap.id);
  const [vocab, grammar, bySkill, mocks] = await Promise.all([
    vocabByLevel(user.id, language),
    language === 'en' ? grammarState(user.id) : Promise.resolve(null),
    db
      .select({ skill: attempts.skill, n: sql<number>`count(*)::int` })
      .from(attempts)
      .where(and(eq(attempts.userId, user.id), eq(attempts.language, language), gte(attempts.day, roadmap.startDate)))
      .groupBy(attempts.skill),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(examSessions)
      .where(and(eq(examSessions.userId, user.id), eq(examSessions.status, 'submitted'), gte(examSessions.submittedAt, new Date(`${roadmap.startDate}T00:00:00Z`)))),
  ]);

  const masteredWords: Record<string, number> = {};
  for (const row of vocab) masteredWords[row.level] = (masteredWords[row.level] ?? 0) + row.mastered;
  const goodGrammar: Record<string, number> = {};
  if (grammar) for (const point of GRAMMAR_POINTS) if (['good', 'mastered'].includes(grammar.rows.get(point.id)?.mastery ?? '')) goodGrammar[point.cefr] = (goodGrammar[point.cefr] ?? 0) + 1;

  const progress = computeProgress(stages, { masteredWords, goodGrammar, sessionsBySkill: Object.fromEntries(bySkill.map((r) => [r.skill, r.n])), mockTests: mocks[0].n }, passed, (await planSettings()).skillWeights[roadmap.goalType as SkillWeightGoal]);

  // Time against progress: how much of the expected duration has passed, and how much of the work is done
  const elapsedDays = Math.max(0, (Date.parse(`${quotaDay()}T00:00:00Z`) - Date.parse(`${roadmap.startDate}T00:00:00Z`)) / 86_400_000);
  const timeShare = clamp01(elapsedDays / Math.max(1, plan.weeks.mid * 7));
  return {
    roadmap: {
      id: roadmap.id,
      language,
      goalType: roadmap.goalType,
      targetScore: roadmap.targetScore,
      targetLevel: roadmap.targetLevel,
      fromLevel: roadmap.fromLevel,
      levelSource: roadmap.levelSource,
      minSkillLevels: roadmap.minSkillLevels,
      deadline: roadmap.deadline,
      hoursPerWeek: roadmap.hoursPerWeek,
      restDays: roadmap.restDays,
      startDate: roadmap.startDate,
      createdAt: roadmap.createdAt,
      stages,
      plan,
    },
    // The level stage being worked on has a checkpoint: where it stands, and whether it can be taken yet
    checkpoint: stages[progress.current]?.kind === 'level' ? await checkpointState(roadmap.id, progress.current, progress.stages[progress.current].progress) : null,
    progress: { ...progress, completed: progress.overall >= 1 && progress.allPassed, timeShare, pace: progress.overall >= timeShare * 0.9 ? ('on' as const) : ('behind' as const) },
  };
}

export const LEVELS = { en: CEFR_ORDER, ja: JLPT_ORDER };

/** A level counts as reached when this share of its words is mastered */
const REACHED_SHARE = 0.5;

/**
 * The learner's level worked out from what they have studied: the highest level where at least half of the words are
 * mastered. Null when there is no study data to go on (or for Japanese, where levels are not inferred).
 */
export async function measuredLevel(userId: string, language: Language): Promise<string | null> {
  const rows = await db.select().from(skillLevels).where(and(eq(skillLevels.userId, userId), eq(skillLevels.language, language), eq(skillLevels.source, 'placement')));
  return placementOverall(Object.fromEntries(rows.map((r) => [r.skill, { level: r.level, confidence: r.confidence } as SkillResult])) as Partial<Record<PlacementSkill, SkillResult>>);
}

export async function deriveLevel(userId: string, language: Language): Promise<string | null> {
  if (language !== 'en') return null;
  const rows = await vocabByLevel(userId, language);
  const totals = new Map<string, { total: number; mastered: number; seen: number }>();
  for (const r of rows) {
    const t = totals.get(r.level) ?? { total: 0, mastered: 0, seen: 0 };
    totals.set(r.level, { total: t.total + r.total, mastered: t.mastered + r.mastered, seen: t.seen + r.seen });
  }
  if ([...totals.values()].every((t) => t.seen === 0)) return null;
  let reached: string | null = null;
  for (const level of CEFR_ORDER) {
    const t = totals.get(level);
    if (t && t.total > 0 && t.mastered / t.total >= REACHED_SHARE) reached = level;
  }
  return reached ?? '';
}
