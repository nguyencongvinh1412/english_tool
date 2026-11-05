/**
 * Roadmap planning, by rules only (no AI): the stages between a learner's level and their goal, the hours they
 * need, an estimated date as a range, and whether that fits their deadline.
 *
 * The hours per level are starting assumptions (roughly the guided hours quoted for each CEFR step, and similar
 * figures for JLPT); they are meant to be tuned with real data, which is why every number lives in PlanSettings.
 * Dates are always a range with an "expected" wording in the UI, never a promise (BR-12).
 */
import { CEFR_ORDER, JLPT_ORDER } from '../progress/levels.js';

export type Language = 'en' | 'ja';
export type GoalType = 'toeic' | 'ielts' | 'jlpt' | 'cefr';
export type Feasibility = 'ok' | 'tight' | 'hard';
export type SkillName = 'listening' | 'reading' | 'speaking' | 'writing';

export interface PlanSettings {
  /** Study hours to get up to a level from the one below it */
  hoursPerLevel: Record<string, number>;
  /** Share of a level's hours needed when the goal sits inside the learner's own level */
  withinLevelFactor: number;
  /** Hours of mock-test practice at the end when the goal is an exam */
  examPrepHours: number;
  /** A level that would take at least this many weeks is split into foundation and advanced stages */
  splitFromWeeks: number;
  /** Half-width of the estimate range when the level was measured, and when it is only the learner's own guess */
  uncertainty: { measured: number; self: number };
  /** Share of a level's words / grammar points to master before moving on */
  vocabShare: number;
  grammarShare: number;
  sessionsPerWeek: number;
  /** Extra hours, as a share of the goal level's hours, for each level a skill with a minimum is below it (BR-04) */
  skillGapShare: number;
  /** How much each kind of work counts toward a stage's progress, by goal (per cent; each goal sums to 100) */
  skillWeights: Record<SkillWeightGoal, Record<SkillWeightKey, number>>;
}

export const SKILL_WEIGHT_GOALS = ['toeic', 'ielts', 'jlpt', 'cefr'] as const;
export type SkillWeightGoal = (typeof SKILL_WEIGHT_GOALS)[number];
export const SKILL_WEIGHT_KEYS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary'] as const;
export type SkillWeightKey = (typeof SKILL_WEIGHT_KEYS)[number];

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  hoursPerLevel: { A1: 90, A2: 120, B1: 150, B2: 200, C1: 250, C2: 300, N5: 100, N4: 150, N3: 200, N2: 250, N1: 300 },
  withinLevelFactor: 0.4,
  examPrepHours: 20,
  splitFromWeeks: 8,
  uncertainty: { measured: 0.15, self: 0.25 },
  vocabShare: 0.7,
  grammarShare: 0.8,
  sessionsPerWeek: 2,
  skillGapShare: 0.15,
  skillWeights: {
    toeic: { listening: 35, reading: 35, writing: 0, speaking: 0, grammar: 20, vocabulary: 10 },
    ielts: { listening: 20, reading: 20, writing: 20, speaking: 20, grammar: 10, vocabulary: 10 },
    jlpt: { listening: 25, reading: 25, writing: 0, speaking: 0, grammar: 25, vocabulary: 25 },
    cefr: { listening: 20, reading: 20, writing: 15, speaking: 15, grammar: 15, vocabulary: 15 },
  },
};

/** How many words and grammar points exist per level, to turn shares into targets */
export interface Catalog {
  words: Record<string, number>;
  grammar: Record<string, number>;
}

export interface StageObjectives {
  vocabMastered: number;
  grammarGood: number;
  /** Practice sessions per skill during the stage */
  sessions: Partial<Record<SkillName, number>>;
  /** Exam-prep stages end with a full mock test */
  mockTests: number;
}

export interface Stage {
  index: number;
  kind: 'level' | 'exam-prep';
  /** Level worked on (the goal level for the exam-prep stage) */
  level: string;
  part: 'foundation' | 'advanced' | null;
  hours: number;
  weeks: number;
  /** Expected end of the stage (middle of the estimate), ISO date */
  endDate: string;
  objectives: StageObjectives;
}

export interface TimePlan {
  totalHours: number;
  /** Weeks needed at the chosen hours per week: low, expected, high */
  weeks: { low: number; mid: number; high: number };
  etaFrom: string;
  etaTo: string;
  /** Hours added because a skill is below the minimum the learner asked for */
  extraHours: number;
  /** Levels each such skill still has to climb */
  skillGaps: Partial<Record<SkillName, number>>;
  feasibility: Feasibility;
  /** Only when the goal does not fit: ways to make it fit */
  fixes: { laterDeadline: string; hoursPerWeek: number } | null;
}

export interface PlanInput {
  language: Language;
  goalType: GoalType;
  fromLevel: string;
  targetLevel: string;
  hoursPerWeek: number;
  startDate: string;
  deadline: string | null;
  /** For each skill with a minimum: how many levels the measured level is below it */
  skillGaps?: Partial<Record<SkillName, number>>;
  /** Whether the starting level was measured (placement test or study data) or only chosen by the learner */
  measured: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const addDays = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export const levelOrder = (language: Language): readonly string[] => (language === 'ja' ? JLPT_ORDER : CEFR_ORDER);

/** Skills practised for a goal: TOEIC and JLPT test listening and reading; IELTS and general goals use all four */
export function skillsFor(goalType: GoalType): SkillName[] {
  return goalType === 'toeic' || goalType === 'jlpt' ? ['listening', 'reading'] : ['listening', 'reading', 'writing', 'speaking'];
}

/**
 * Stages between the starting level and the goal. A goal above the learner's level covers each level in between;
 * a goal inside the learner's own level (a TOEIC score within B1, say) is consolidation of that level.
 */
export function buildStages(input: PlanInput, catalog: Catalog, settings: PlanSettings = DEFAULT_PLAN_SETTINGS): Stage[] {
  const order = levelOrder(input.language);
  const from = order.indexOf(input.fromLevel);
  const target = order.indexOf(input.targetLevel);
  if (target < 0) throw new Error(`Unknown target level ${input.targetLevel}`);
  // An empty starting level means a beginner: every level up to the goal; an unknown one or a goal at or below the level is consolidation
  const within = input.fromLevel === '' ? false : from < 0 || target <= from;
  const levels = within ? [order[target]] : order.slice(from + 1, target + 1);
  const skills = skillsFor(input.goalType);
  const sessionsFor = (weeks: number) => Object.fromEntries(skills.map((s) => [s, Math.max(1, Math.ceil(weeks * settings.sessionsPerWeek))])) as Partial<Record<SkillName, number>>;

  type Draft = Omit<Stage, 'index' | 'endDate'>;
  const drafts: Draft[] = [];
  for (const level of levels) {
    const hours = (settings.hoursPerLevel[level] ?? 150) * (within ? settings.withinLevelFactor : 1);
    const weeks = hours / input.hoursPerWeek;
    const split = weeks >= settings.splitFromWeeks;
    const parts: ('foundation' | 'advanced' | null)[] = split ? ['foundation', 'advanced'] : [null];
    for (const part of parts) {
      // Targets are cumulative for the level: the foundation stage ends halfway to the full target
      const fraction = part === 'foundation' ? 0.5 : 1;
      const stageHours = split ? hours / 2 : hours;
      const stageWeeks = Math.max(1, Math.round(stageHours / input.hoursPerWeek));
      drafts.push({
        kind: 'level',
        level,
        part,
        hours: Math.round(stageHours),
        weeks: stageWeeks,
        objectives: {
          vocabMastered: Math.round((catalog.words[level] ?? 0) * settings.vocabShare * fraction),
          grammarGood: Math.round((catalog.grammar[level] ?? 0) * settings.grammarShare * fraction),
          sessions: sessionsFor(stageWeeks),
          mockTests: 0,
        },
      });
    }
  }
  if (input.goalType !== 'cefr') {
    const weeks = Math.max(1, Math.round(settings.examPrepHours / input.hoursPerWeek));
    drafts.push({ kind: 'exam-prep', level: input.targetLevel, part: null, hours: settings.examPrepHours, weeks, objectives: { vocabMastered: 0, grammarGood: 0, sessions: sessionsFor(weeks), mockTests: 1 } });
  }

  let elapsed = 0;
  return drafts.map((draft, index) => {
    elapsed += draft.weeks;
    return { ...draft, index, endDate: addDays(input.startDate, elapsed * 7) };
  });
}

/**
 * Time needed, an estimate range, and how it compares with the deadline:
 *  ok    the end of the range is on or before the deadline
 *  tight the deadline falls inside the range
 *  hard  even the start of the range is after the deadline
 */
export function buildTimePlan(input: PlanInput, stages: Stage[], settings: PlanSettings = DEFAULT_PLAN_SETTINGS): TimePlan {
  const skillGaps = Object.fromEntries(Object.entries(input.skillGaps ?? {}).filter(([, steps]) => (steps ?? 0) > 0)) as Partial<Record<SkillName, number>>;
  const gapSteps = Object.values(skillGaps).reduce((n, steps) => n + (steps ?? 0), 0);
  const extraHours = Math.round(gapSteps * (settings.hoursPerLevel[input.targetLevel] ?? 150) * settings.skillGapShare);
  const totalHours = stages.reduce((n, s) => n + s.hours, 0) + extraHours;
  const mid = totalHours / input.hoursPerWeek;
  const u = input.measured ? settings.uncertainty.measured : settings.uncertainty.self;
  const weeks = { low: mid * (1 - u), mid, high: mid * (1 + u) };
  const etaFrom = addDays(input.startDate, Math.ceil(weeks.low * 7));
  const etaTo = addDays(input.startDate, Math.ceil(weeks.high * 7));

  let feasibility: Feasibility = 'ok';
  let fixes: TimePlan['fixes'] = null;
  if (input.deadline) {
    feasibility = etaTo <= input.deadline ? 'ok' : etaFrom <= input.deadline ? 'tight' : 'hard';
    if (feasibility !== 'ok') {
      const weeksToDeadline = Math.max(1, daysBetween(input.startDate, input.deadline) / 7);
      fixes = { laterDeadline: etaTo, hoursPerWeek: Math.ceil((totalHours * (1 + u)) / weeksToDeadline) };
    }
  }
  return { totalHours, extraHours, skillGaps, weeks, etaFrom, etaTo, feasibility, fixes };
}

export function buildPlan(input: PlanInput, catalog: Catalog, settings: PlanSettings = DEFAULT_PLAN_SETTINGS): { stages: Stage[]; plan: TimePlan } {
  const stages = buildStages(input, catalog, settings);
  return { stages, plan: buildTimePlan(input, stages, settings) };
}
