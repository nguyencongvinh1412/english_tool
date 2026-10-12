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
  | 'writing-task'
  | 'toeic-listening'
  | 'toeic-reading'
  | 'ielts-listening'
  | 'ielts-reading'
  | 'ielts-writing'
  | 'ielts-speaking'
  | 'kana';
export type StudyLanguage = 'en' | 'ja';
export type SkillName = 'listening' | 'reading' | 'speaking' | 'writing';

export interface AttemptInput {
  activity: Activity;
  /** Defaults to the learner's current study language */
  language?: StudyLanguage;
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
  /** Language the skills and recent activity are for; XP and streak cover every language */
  language: StudyLanguage;
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
  summary: (language: StudyLanguage) => apiFetch<ProgressSummary>(`/api/progress/summary?language=${language}`),
  record: (input: AttemptInput) =>
    apiFetch<{ attempt: Attempt; xpEarned: number }>('/api/attempts', { method: 'POST', json: input }),
  best: (activity: Activity) => apiFetch<{ best: Record<string, number> }>(`/api/attempts/best?activity=${activity}`),
  history: (before?: string) =>
    apiFetch<{ attempts: Attempt[]; nextBefore: string | null }>(
      `/api/attempts?limit=20${before ? `&before=${encodeURIComponent(before)}` : ''}`
    ),
};
