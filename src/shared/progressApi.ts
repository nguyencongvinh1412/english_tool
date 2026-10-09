/**
 * Progress API client and types
 */
import { apiFetch } from './http';

export type Activity =
  | 'dictation'
  | 'listening-quiz'
  | 'reading-quiz'
  | 'pronunciation'
  | 'conversation'
  | 'scenario'
  | 'speaking-ielts'
  | 'writing-task';
export type SkillName = 'listening' | 'reading' | 'speaking' | 'writing';

export interface AttemptInput {
  activity: Activity;
  contentRef?: string;
  title?: string;
  score?: number;
  maxScore?: number;
  durationSec?: number;
  details?: Record<string, unknown>;
  imported?: boolean;
}

export interface Attempt {
  id: string;
  activity: Activity;
  skill: SkillName;
  contentRef: string | null;
  title: string | null;
  score: number | null;
  maxScore: number | null;
  durationSec: number | null;
  xp: number;
  completedAt: string;
}

export interface DayStat {
  day: string;
  xp: number;
  count: number;
}

export interface ProgressSummary {
  today: string;
  xpTotal: number;
  xpToday: number;
  attemptsTotal: number;
  streak: { current: number; best: number; activeToday: boolean };
  week: DayStat[];
  heatmap: DayStat[];
  skills: Record<SkillName, { attempts: number; xp: number; avgPercent: number | null; lastAt: string | null }>;
  recent: Attempt[];
}

export const progressApi = {
  summary: () => apiFetch<ProgressSummary>('/api/progress/summary'),
  record: (input: AttemptInput) =>
    apiFetch<{ attempt: Attempt; xpEarned: number }>('/api/attempts', { method: 'POST', json: input }),
  best: (activity: Activity) => apiFetch<{ best: Record<string, number> }>(`/api/attempts/best?activity=${activity}`),
  history: (before?: string) =>
    apiFetch<{ attempts: Attempt[]; nextBefore: string | null }>(
      `/api/attempts?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`
    ),
};
