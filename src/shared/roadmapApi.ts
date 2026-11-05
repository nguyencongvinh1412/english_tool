/**
 * Roadmap API client and types (mirrors server/roadmap and server/routes/roadmap.ts)
 */
import { getSelectedModel } from '@/services/api';
import { apiFetch } from './http';

export type GoalType = 'toeic' | 'ielts' | 'jlpt' | 'cefr';
export type Feasibility = 'ok' | 'tight' | 'hard';
export type SkillName = 'listening' | 'reading' | 'speaking' | 'writing';

export interface StageObjectives {
  vocabMastered: number;
  grammarGood: number;
  sessions: Partial<Record<SkillName, number>>;
  mockTests: number;
}

export interface Stage {
  index: number;
  kind: 'level' | 'exam-prep';
  level: string;
  part: 'foundation' | 'advanced' | null;
  hours: number;
  weeks: number;
  endDate: string;
  objectives: StageObjectives;
}

export interface TimePlan {
  totalHours: number;
  weeks: { low: number; mid: number; high: number };
  etaFrom: string;
  etaTo: string;
  feasibility: Feasibility;
  fixes: { laterDeadline: string; hoursPerWeek: number } | null;
}

export interface RoadmapGoal {
  language: 'en' | 'ja';
  goalType: GoalType;
  targetScore?: number | null;
  targetLevel?: string | null;
  fromLevel?: string | null;
  levelSource?: 'self' | 'derived' | 'measured';
  hoursPerWeek: number;
  deadline?: string | null;
  restDays?: number[];
  /** Lowest result accepted per skill, e.g. { listening: "6.0" } for IELTS or "300" for TOEIC */
  minSkillLevels?: Record<string, string>;
}

export interface Roadmap {
  id: string;
  language: 'en' | 'ja';
  goalType: GoalType;
  targetScore: number | null;
  targetLevel: string;
  fromLevel: string;
  levelSource: 'self' | 'derived' | 'measured';
  deadline: string | null;
  hoursPerWeek: number;
  startDate: string;
  minSkillLevels: Record<string, string>;
  stages: Stage[];
  plan: TimePlan;
}

export interface StageProgress {
  index: number;
  passed: boolean | null;
  progress: number;
  vocab: { have: number; goal: number };
  grammar: { have: number; goal: number };
  sessions: { skill: string; have: number; goal: number }[];
  mockTests: { have: number; goal: number };
}

export interface CheckpointState {
  stageIndex: number;
  unlocked: boolean;
  inProgressId: string | null;
  lastAttempt: { id: string; passed: boolean; overall: number; finishedAt: string | null } | null;
  passed: boolean;
}

export type SkillKey = 'vocabulary' | 'grammar' | 'reading' | 'listening';

export interface CheckpointQuestion {
  id: string;
  skill: SkillKey;
  prompt: string;
  context: string | null;
  options: string[];
}

export interface CheckpointResult {
  skills: Partial<Record<SkillKey, { correct: number; total: number; score: number; verdict: 'pass' | 'near' | 'low' }>>;
  overall: number;
  passed: boolean;
  weak: SkillKey[];
}

export interface CheckpointAttempt {
  id: string;
  stageIndex: number;
  status?: 'in_progress' | 'finished';
  questions: CheckpointQuestion[];
  result?: CheckpointResult | null;
  passed?: boolean | null;
}

export interface RoadmapView {
  roadmap: Roadmap;
  checkpoint: CheckpointState | null;
  progress: { stages: StageProgress[]; current: number; overall: number; completed: boolean; timeShare: number; pace: 'on' | 'behind' };
}

export interface RoadmapPreview {
  fromLevel: string;
  targetLevel: string;
  stages: Stage[];
  plan: TimePlan;
}

export const roadmapApi = {
  get: () => apiFetch<RoadmapView | { roadmap: null }>('/api/roadmap'),
  preview: (goal: RoadmapGoal) => apiFetch<RoadmapPreview>('/api/roadmap/preview', { method: 'POST', json: goal }),
  create: (goal: RoadmapGoal) => apiFetch<RoadmapView>('/api/roadmap', { method: 'POST', json: goal }),
  derivedLevel: () => apiFetch<{ level: string | null; source?: 'measured' | 'derived' }>('/api/roadmap/derived-level'),
  startCheckpoint: (stageIndex: number, early = false, full = false) => apiFetch<CheckpointAttempt>('/api/roadmap/checkpoint/start', { method: 'POST', json: { stageIndex, early, full } }),
  checkpoint: (id: string) => apiFetch<CheckpointAttempt>(`/api/roadmap/checkpoint/${id}`),
  submitCheckpoint: (id: string, answers: Record<string, number>) => apiFetch<CheckpointAttempt>(`/api/roadmap/checkpoint/${id}/submit`, { method: 'POST', json: { answers } }),
  startRemedial: (id: string) => apiFetch<{ tasks: number }>(`/api/roadmap/checkpoint/${id}/remedial`, { method: 'POST' }),
  remove: () => apiFetch<void>('/api/roadmap', { method: 'DELETE' }),
};

export const hasRoadmap = (data: RoadmapView | { roadmap: null }): data is RoadmapView => data.roadmap !== null;

/** "4–9/03" when both ends share a month, "28/02 – 5/03" otherwise */
export function formatRange(from: string, to: string): string {
  const [, m1, d1] = from.split('-').map(Number);
  const [, m2, d2] = to.split('-').map(Number);
  const mm = (m: number) => String(m).padStart(2, '0');
  return m1 === m2 ? `${d1}–${d2}/${mm(m2)}` : `${d1}/${mm(m1)} – ${d2}/${mm(m2)}`;
}

/** "10/03" */
export function formatDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${String(m).padStart(2, '0')}`;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  studyDays: number;
  plannedDays: number;
  minutes: number | null;
  plannedMinutes: number;
  targets: { kind: 'words' | 'grammar' | 'sessions'; skill?: SkillName; have: number; goal: number }[];
  percent: number;
  best: SkillName | null;
  weak: SkillName | null;
  suggestion: { skill: SkillName; minutes: number; days: number } | null;
}

export const weeklyApi = {
  get: () => apiFetch<{ review: WeeklyReview | null }>('/api/roadmap/weekly'),
  /** A short note from the AI about the week (Plus) */
  note: () => apiFetch<{ text: string }>('/api/roadmap/weekly/ai', { method: 'POST', json: { model: getSelectedModel() ?? undefined } }).then((r) => r.text),
  apply: (skill: SkillName) => apiFetch<{ added: number }>('/api/roadmap/weekly/apply', { method: 'POST', json: { skill } }),
};
