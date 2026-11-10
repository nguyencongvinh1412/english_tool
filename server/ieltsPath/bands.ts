/**
 * IELTS Path rules, kept pure: band targets per skill, the gate targets, which phase a learner starts in and ends
 * in, and how long the syllabus takes at the learner's daily time. Numbers follow the 6-month syllabus
 * (docs/plans/ielts-path.md, section 4): six 4-week phases, each closed by a gate, then two weeks before the exam.
 */
import { overallBand } from '../exams/ielts.js';

export const PATH_SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;
export type PathSkill = (typeof PATH_SKILLS)[number];
export type Bands = Record<PathSkill, number>;
/** Measured bands; writing and speaking may be unmeasured (skipped at Gate 0) */
export type MeasuredBands = { listening: number; reading: number; writing: number | null; speaking: number | null };

export const PHASES = 6;
export const WEEKS_PER_PHASE = 4;
/** Weeks after the last gate: fix errors, final mock, the exam */
export const FINAL_WEEKS = 2;
/** A syllabus week at the standard pace: six 240-minute days and a 180-minute review day */
export const SYLLABUS_WEEK_MINUTES = 6 * 240 + 180;
/** Highest overall band the syllabus leads to (Gate 6) */
export const MAX_OVERALL_TARGET = 7;
export const MIN_OVERALL_TARGET = 4.5;
export const DAILY_MINUTE_CHOICES = [120, 180, 240] as const;
export const MIN_DAILY_MINUTES = 60;
export const MAX_DAILY_MINUTES = 300;

/** Band each gate asks for: listening and reading, writing and speaking */
export const GATE_TARGETS: Record<number, { lr: number; ws: number }> = {
  1: { lr: 4.5, ws: 4 },
  2: { lr: 5, ws: 4.5 },
  3: { lr: 5.5, ws: 5 },
  4: { lr: 6, ws: 5.5 },
  5: { lr: 6.5, ws: 6 },
  6: { lr: 7, ws: 6.5 },
};

const isLr = (skill: PathSkill) => skill === 'listening' || skill === 'reading';
const clampBand = (band: number) => Math.max(0, Math.min(9, Math.round(band * 2) / 2));

/** Gate target of one skill */
export const gateTarget = (gate: number, skill: PathSkill): number => (isLr(skill) ? GATE_TARGETS[gate].lr : GATE_TARGETS[gate].ws);

/**
 * Default per-skill targets for an overall band: listening and reading half a band above, writing and speaking half
 * a band below (they grow slowest). 7.0 gives 7.5 / 7.5 / 6.5 / 6.5, the profile of the syllabus.
 */
export function profileFor(overall: number): Bands {
  const lr = clampBand(overall + 0.5);
  const ws = clampBand(overall - 0.5);
  return { listening: lr, reading: lr, writing: ws, speaking: ws };
}

/** Overall band of a set of per-skill bands (IELTS rounding) */
export const overallOf = (bands: Bands): number => overallBand(PATH_SKILLS.map((s) => bands[s]));

/** Whether measured bands meet a gate. Unmeasured writing/speaking are ignored here (the caller decides) */
export function meetsGate(bands: MeasuredBands, gate: number): boolean {
  return PATH_SKILLS.every((skill) => {
    const band = bands[skill];
    return band === null || band >= gateTarget(gate, skill);
  });
}

/**
 * Phase to start in after Gate 0: one after the highest gate already met. When writing and speaking were not
 * measured the start is one phase earlier (the safe choice). 7 means every gate is already met.
 */
export function startPhaseFor(bands: MeasuredBands): number {
  let met = 0;
  for (let gate = 1; gate <= PHASES && meetsGate(bands, gate); gate++) met = gate;
  const measuredAll = bands.writing !== null && bands.speaking !== null;
  return measuredAll ? met + 1 : Math.max(1, met);
}

/** Last phase the targets need: the first gate whose targets reach every skill's target (at most the last gate) */
export function endPhaseFor(targets: Bands): number {
  for (let gate = 1; gate <= PHASES; gate++) {
    if (PATH_SKILLS.every((skill) => targets[skill] <= gateTarget(gate, skill))) return gate;
  }
  return PHASES;
}

export type Feasibility = 'ok' | 'tight' | 'hard';

export interface PathPlan {
  /** Phases to study (start..end); empty when the learner already meets the last gate the target needs */
  phases: number[];
  syllabusWeeks: number;
  /** Total study minutes at the standard pace */
  minutes: number;
  /** Calendar weeks at the learner's pace: low, expected, high */
  weeks: { low: number; mid: number; high: number };
  etaFrom: string;
  etaTo: string;
  /** Expected end of each phase (its gate), ISO date */
  phaseEnds: { phase: number; gateDate: string }[];
  feasibility: Feasibility | null;
  /** When the exam date does not fit: a later date, or the minutes a day that would fit */
  fixes: { laterDate: string; dailyMinutes: number } | null;
}

export interface PathPlanInput {
  startPhase: number;
  endPhase: number;
  dailyMinutes: number;
  restDays: number[];
  startDate: string;
  examDate: string | null;
  /** Writing and speaking were measured (narrower estimate) */
  measuredAll: boolean;
}

const DAY_MS = 86_400_000;
export const addDays = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** Half-width of the estimate range */
export const UNCERTAINTY = { measured: 0.15, partial: 0.25 };

/**
 * Time plan: the syllabus weeks between the start and end phase, stretched to the learner's minutes a week, as a
 * range, compared with the exam date (ok: the whole range fits, tight: the date falls inside it, hard: it does not).
 */
export function buildPathPlan(input: PathPlanInput): PathPlan {
  const phases = input.startPhase <= input.endPhase ? Array.from({ length: input.endPhase - input.startPhase + 1 }, (_, i) => input.startPhase + i) : [];
  const syllabusWeeks = phases.length * WEEKS_PER_PHASE + FINAL_WEEKS;
  const minutes = syllabusWeeks * SYLLABUS_WEEK_MINUTES;
  const studyDays = Math.max(1, 7 - new Set(input.restDays).size);
  const perWeek = input.dailyMinutes * studyDays;
  const stretch = SYLLABUS_WEEK_MINUTES / perWeek;
  const mid = syllabusWeeks * stretch;
  const u = input.measuredAll ? UNCERTAINTY.measured : UNCERTAINTY.partial;
  const weeks = { low: mid * (1 - u), mid, high: mid * (1 + u) };
  const etaFrom = addDays(input.startDate, Math.ceil(weeks.low * 7));
  const etaTo = addDays(input.startDate, Math.ceil(weeks.high * 7));
  const phaseEnds = phases.map((phase, i) => ({ phase, gateDate: addDays(input.startDate, Math.ceil((i + 1) * WEEKS_PER_PHASE * stretch * 7)) }));

  let feasibility: Feasibility | null = null;
  let fixes: PathPlan['fixes'] = null;
  if (input.examDate) {
    feasibility = etaTo <= input.examDate ? 'ok' : etaFrom <= input.examDate ? 'tight' : 'hard';
    if (feasibility !== 'ok') {
      const weeksToExam = Math.max(1, daysBetween(input.startDate, input.examDate) / 7);
      fixes = { laterDate: etaTo, dailyMinutes: Math.ceil((minutes * (1 + u)) / weeksToExam / studyDays / 10) * 10 };
    }
  }
  return { phases, syllabusWeeks, minutes, weeks, etaFrom, etaTo, phaseEnds, feasibility, fixes };
}
