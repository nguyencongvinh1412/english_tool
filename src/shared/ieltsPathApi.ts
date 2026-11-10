/**
 * IELTS Path API client and types (mirrors server/ieltsPath and server/routes/ieltsPath.ts)
 */
import { apiFetch } from './http';

export const PATH_SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;
export type PathSkill = (typeof PATH_SKILLS)[number];
export type Bands = Record<PathSkill, number>;
export type MeasuredBands = { listening: number; reading: number; writing: number | null; speaking: number | null };
export type Feasibility = 'ok' | 'tight' | 'hard';

export const DAILY_MINUTE_CHOICES = [120, 180, 240] as const;
export const MIN_DAILY_MINUTES = 60;
export const MAX_DAILY_MINUTES = 300;
export const OVERALL_CHOICES = [5, 5.5, 6, 6.5, 7] as const;
export const BAND_CHOICES = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9] as const;

export type SkillStatus = 'todo' | 'in_progress' | 'grading' | 'failed' | 'done' | 'skipped';

export interface GateSkill {
  skill: PathSkill;
  optional: boolean;
  minutes: number;
  status: SkillStatus;
  sessionId: string | null;
  band: number | null;
  correct: number | null;
  total: number | null;
}

export interface GateView {
  gate: number;
  attemptId: string | null;
  status: 'not_started' | 'in_progress' | 'finished';
  skills: GateSkill[];
  bands: MeasuredBands | null;
  finishedAt: string | null;
}

export interface PathPlan {
  phases: number[];
  syllabusWeeks: number;
  minutes: number;
  weeks: { low: number; mid: number; high: number };
  etaFrom: string;
  etaTo: string;
  phaseEnds: { phase: number; gateDate: string }[];
  feasibility: Feasibility | null;
  fixes: { laterDate: string; dailyMinutes: number } | null;
}

export interface PathView {
  id: string;
  bandTargets: Bands;
  overallTarget: number;
  examDate: string | null;
  dailyMinutes: number;
  restDays: number[];
  startPhase: number | null;
  endPhase: number;
  startDate: string | null;
  gate0: GateView;
  plan: PathPlan | null;
}

export interface PathInput {
  bandTargets: Bands;
  examDate: string | null;
  dailyMinutes: number;
  restDays: number[];
}

/** Gate targets per phase (the gate that closes it): listening/reading and writing/speaking */
export const GATE_TARGETS: Record<number, { lr: number; ws: number }> = {
  1: { lr: 4.5, ws: 4 },
  2: { lr: 5, ws: 4.5 },
  3: { lr: 5.5, ws: 5 },
  4: { lr: 6, ws: 5.5 },
  5: { lr: 6.5, ws: 6 },
  6: { lr: 7, ws: 6.5 },
};

/** Default per-skill targets for an overall band (same rule as the server) */
export function profileFor(overall: number): Bands {
  const clamp = (b: number) => Math.max(0, Math.min(9, Math.round(b * 2) / 2));
  const lr = clamp(overall + 0.5);
  const ws = clamp(overall - 0.5);
  return { listening: lr, reading: lr, writing: ws, speaking: ws };
}

/** IELTS overall: mean of the four, .25 and .75 round up */
export function overallOf(bands: Bands): number {
  const mean = PATH_SKILLS.reduce((n, s) => n + bands[s], 0) / 4;
  return Math.floor(mean * 2 + 0.5) / 2;
}

/** "6.5", "7.0": bands are always shown with one decimal */
export const formatBand = (band: number): string => band.toFixed(1);

export const ieltsPathApi = {
  get: () => apiFetch<{ path: PathView | null }>('/api/ielts-path'),
  create: (input: PathInput) => apiFetch<{ path: PathView }>('/api/ielts-path', { method: 'POST', json: input }),
  update: (change: Partial<Omit<PathInput, 'bandTargets'>>) => apiFetch<{ path: PathView }>('/api/ielts-path', { method: 'PATCH', json: change }),
  remove: () => apiFetch<void>('/api/ielts-path', { method: 'DELETE' }),
  gate: (gate: number) => apiFetch<{ gate: GateView }>(`/api/ielts-path/gates/${gate}`),
  startSkill: (gate: number, skill: PathSkill) => apiFetch<{ sessionId: string }>(`/api/ielts-path/gates/${gate}/skills/${skill}/start`, { method: 'POST', json: {} }),
  skipSkill: (gate: number, skill: PathSkill, skipped: boolean) => apiFetch<{ gate: GateView }>(`/api/ielts-path/gates/${gate}/skills/${skill}/skip`, { method: 'POST', json: { skipped } }),
};
