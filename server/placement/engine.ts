/**
 * The placement test as a staircase, per skill: start near the learner's own level, move up a level after a right
 * answer and down after a wrong one, and read the level from where the last few questions settled. No AI, no
 * hidden scoring: the same answers always give the same level.
 */
import { CEFR_ORDER } from '../progress/levels.js';

export const PLACEMENT_SKILLS = ['vocabulary', 'grammar', 'reading', 'listening'] as const;
export type PlacementSkill = (typeof PLACEMENT_SKILLS)[number];
export type Confidence = 'low' | 'medium' | 'high';

/** Questions per skill (about 19 in all, a little over twenty minutes) */
export const QUESTIONS_PER_SKILL: Record<PlacementSkill, number> = { vocabulary: 6, grammar: 5, reading: 4, listening: 4 };
/** A skill with fewer answers than this is left unmeasured rather than guessed */
export const MIN_ANSWERS = 3;
/** The level is read from this many of the latest questions */
const SETTLE = 3;

export interface Asked {
  id: string;
  level: string;
  correct: boolean;
}

export interface SkillState {
  asked: Asked[];
  /** No more questions for this skill (enough asked, or none available) */
  done: boolean;
}

export interface TestState {
  startLevel: string;
  skills: Record<PlacementSkill, SkillState>;
  /** The question being shown right now */
  pending: { id: string; skill: PlacementSkill; level: string } | null;
}

export const initialState = (startLevel: string): TestState => ({
  startLevel,
  skills: Object.fromEntries(PLACEMENT_SKILLS.map((s) => [s, { asked: [], done: false }])) as unknown as Record<PlacementSkill, SkillState>,
  pending: null,
});

const index = (level: string) => Math.max(0, CEFR_ORDER.indexOf(level as (typeof CEFR_ORDER)[number]));
const clampIndex = (i: number) => Math.max(0, Math.min(CEFR_ORDER.length - 1, i));

/** The level to ask next in a skill: one step up or down from the previous question */
export function targetLevel(startLevel: string, asked: Asked[]): string {
  const last = asked[asked.length - 1];
  if (!last) return CEFR_ORDER[clampIndex(index(startLevel))];
  return CEFR_ORDER[clampIndex(index(last.level) + (last.correct ? 1 : -1))];
}

/**
 * The closest level to the target that has a question left, searching outward (target, one below, one above, ...)
 */
export function nearestLevel(target: string, available: (level: string) => boolean): string | null {
  const t = index(target);
  for (let d = 0; d < CEFR_ORDER.length; d++) {
    for (const i of d === 0 ? [t] : [t - d, t + d]) if (i >= 0 && i < CEFR_ORDER.length && available(CEFR_ORDER[i])) return CEFR_ORDER[i];
  }
  return null;
}

/** The skill to ask about now: the first one, in order, that is not done */
export const currentSkill = (state: TestState): PlacementSkill | null => PLACEMENT_SKILLS.find((s) => !state.skills[s].done) ?? null;

/**
 * Records the answer to the pending question and decides whether the skill is finished
 */
export function recordAnswer(state: TestState, correct: boolean): TestState {
  const pending = state.pending;
  if (!pending) return state;
  const skill = state.skills[pending.skill];
  const asked = [...skill.asked, { id: pending.id, level: pending.level, correct }];
  return {
    ...state,
    pending: null,
    skills: { ...state.skills, [pending.skill]: { asked, done: asked.length >= QUESTIONS_PER_SKILL[pending.skill] } },
  };
}

export interface SkillResult {
  level: string;
  confidence: Confidence;
}

/**
 * Level and confidence for a skill, from where its last questions settled. Null when too few were answered.
 */
export function estimate(asked: Asked[]): SkillResult | null {
  if (asked.length < MIN_ANSWERS) return null;
  const recent = asked.slice(-SETTLE).map((a) => index(a.level));
  const level = CEFR_ORDER[clampIndex(Math.round(recent.reduce((a, b) => a + b, 0) / recent.length))];
  const spread = Math.max(...recent) - Math.min(...recent);
  const confidence: Confidence = spread <= 1 && asked.length >= QUESTIONS_PER_SKILL.listening ? 'high' : spread <= 2 ? 'medium' : 'low';
  return { level, confidence };
}

/** One level for the whole learner: the mean of the measured skills, rounded down (a safe place to start) */
export function overallLevel(results: Partial<Record<PlacementSkill, SkillResult | null>>): string | null {
  const measured = Object.values(results).filter((r): r is SkillResult => Boolean(r));
  if (measured.length === 0) return null;
  return CEFR_ORDER[clampIndex(Math.floor(measured.reduce((n, r) => n + index(r.level), 0) / measured.length))];
}
