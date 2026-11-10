/**
 * The rules of Gates 1-6, pure (docs/plans/ielts-path.md, section 4.2). A gate compares the four bands with the
 * targets of its phase:
 *   pass         every skill reaches its target
 *   conditional  exactly one skill is half a band short: the next phase opens with extra practice for that skill,
 *                and a retest of it (version B) follows
 *   fail         two or more skills short, or one a full band or more short: a buffer week of review, then the
 *                whole gate again (version B)
 * Failing the same gate twice stops the path for a new plan. Gates 3 and 4 also decide the exam date and target.
 */
import { addDays, gateTarget, overallOf, PATH_SKILLS, type Bands, type PathSkill } from './bands.js';

export type Outcome = 'pass' | 'conditional' | 'fail';

export interface SkillResult {
  skill: PathSkill;
  band: number;
  target: number;
  /** Bands short of the target (0 when reached) */
  short: number;
}

export interface Evaluation {
  outcome: Outcome;
  skills: SkillResult[];
  /** Skills below their target, the furthest short first */
  weak: PathSkill[];
}

/** Bands of a gate, each skill compared with its target */
export function evaluate(gate: number, bands: Bands): Evaluation {
  const skills = PATH_SKILLS.map((skill) => {
    const target = gateTarget(gate, skill);
    return { skill, band: bands[skill], target, short: Math.max(0, target - bands[skill]) };
  });
  const short = skills.filter((s) => s.short > 0);
  const weak = [...short].sort((a, b) => b.short - a.short).map((s) => s.skill);
  let outcome: Outcome = 'pass';
  if (short.length >= 2 || short.some((s) => s.short >= 1)) outcome = 'fail';
  else if (short.length === 1) outcome = 'conditional';
  return { outcome, skills, weak };
}

/** Bands after a retest: the retested skill takes its new band, the others stay */
export function withRetest(bands: Bands, skill: PathSkill, band: number): Bands {
  return { ...bands, [skill]: Math.max(bands[skill], band) };
}

/** The version of the next try at a gate: the first is A, every later one B */
export const versionFor = (previousTries: number): 'A' | 'B' => (previousTries === 0 ? 'A' : 'B');

/** After this many failed tries of one gate in a row, the path stops for a new plan */
export const STOP_AFTER_FAILS = 2;

/** Days after a conditional pass before the retest opens: the first week of the next phase */
export const RETEST_AFTER_DAYS = 7;

export type Decision =
  | { kind: 'move-exam'; from: string | null; earliest: string; latest: string }
  | { kind: 'lower-target'; overall: number }
  | null;

/** Weeks of the syllabus from the start to the later exam window after Gate 3 (weeks 32-36) */
export const LATE_EXAM_WEEKS = { from: 32, to: 36 };

/**
 * The decision a learner faces after a gate (after any retest):
 *  Gate 3: listening or reading under 5.5, or writing or speaking under 5.0 -> move the exam to weeks 32-36
 *  Gate 4: writing or speaking under 5.5 -> aim for overall 6.5 this time (7.0 on the next exam)
 */
export function decisionAfter(gate: number, bands: Bands, startDate: string | null, examDate: string | null): Decision {
  if (gate === 3) {
    const short = bands.listening < 5.5 || bands.reading < 5.5 || bands.writing < 5 || bands.speaking < 5;
    if (!short) return null;
    const base = startDate ?? new Date().toISOString().slice(0, 10);
    return { kind: 'move-exam', from: examDate, earliest: addDays(base, LATE_EXAM_WEEKS.from * 7), latest: addDays(base, LATE_EXAM_WEEKS.to * 7) };
  }
  if (gate === 4) {
    return bands.writing < 5.5 || bands.speaking < 5.5 ? { kind: 'lower-target', overall: 6.5 } : null;
  }
  return null;
}

/** Targets after the learner accepts "aim for overall 6.5": the default profile for it, never higher than before */
export function loweredTargets(current: Bands, overall: number): Bands {
  const lr = Math.min(current.listening, overall + 0.5);
  const lrReading = Math.min(current.reading, overall + 0.5);
  const ws = overall - 0.5;
  return { listening: lr, reading: lrReading, writing: Math.min(current.writing, ws), speaking: Math.min(current.speaking, ws) };
}

/** Overall band of gate bands, for display */
export const overallOfBands = (bands: Bands): number => overallOf(bands);
