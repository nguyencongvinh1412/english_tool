/**
 * Stage checkpoints: the grading rules, kept pure. A checkpoint is a short set of questions at the stage's level
 * (no AI, no cost). It is passed when the overall score reaches 70% and no skill is below 50% (BR-09); a skill that
 * is below the pass mark but not far below is "near", so the advice can be about exactly that part.
 */
import type { PlacementSkill } from '../placement/engine.js';

export const UNLOCK_PROGRESS = 0.8;
export const PASS_OVERALL = 0.7;
export const PASS_MIN_SKILL = 0.5;
/** Questions asked per skill; a skill with fewer than MIN_BANK approved questions at the level is left out */
export const PER_SKILL: Record<PlacementSkill, number> = { vocabulary: 5, grammar: 5, reading: 4, listening: 4 };
export const MIN_BANK = 3;

/** The three thresholds, tunable by the admin (saved under "roadmap.checkpoint") */
export interface CheckpointThresholds {
  unlock: number;
  passOverall: number;
  passMinSkill: number;
}
export const DEFAULT_THRESHOLDS: CheckpointThresholds = { unlock: UNLOCK_PROGRESS, passOverall: PASS_OVERALL, passMinSkill: PASS_MIN_SKILL };

export type SkillVerdict = 'pass' | 'near' | 'low';

export interface SkillScore {
  correct: number;
  total: number;
  /** 0 to 1 */
  score: number;
  verdict: SkillVerdict;
}

export interface CheckpointResult {
  skills: Partial<Record<PlacementSkill, SkillScore>>;
  overall: number;
  passed: boolean;
  /** Skills below the pass mark, weakest first */
  weak: PlacementSkill[];
}

export function grade(answers: { skill: PlacementSkill; correct: boolean }[], limits: CheckpointThresholds = DEFAULT_THRESHOLDS): CheckpointResult {
  const { passOverall, passMinSkill } = limits;
  const skills: Partial<Record<PlacementSkill, SkillScore>> = {};
  for (const a of answers) {
    const s = skills[a.skill] ?? { correct: 0, total: 0, score: 0, verdict: 'low' as SkillVerdict };
    s.total += 1;
    s.correct += a.correct ? 1 : 0;
    skills[a.skill] = s;
  }
  for (const s of Object.values(skills)) {
    s.score = s.total ? s.correct / s.total : 0;
    s.verdict = s.score >= passOverall ? 'pass' : s.score >= passMinSkill ? 'near' : 'low';
  }
  const overall = answers.length ? answers.filter((a) => a.correct).length / answers.length : 0;
  const entries = Object.entries(skills) as [PlacementSkill, SkillScore][];
  const passed = answers.length > 0 && overall >= passOverall && entries.every(([, s]) => s.score >= passMinSkill);
  const weak = entries.filter(([, s]) => s.score < passOverall).sort((a, b) => a[1].score - b[1].score).map(([skill]) => skill);
  return { skills, overall, passed, weak };
}
