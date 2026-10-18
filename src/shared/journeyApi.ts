/**
 * Progress journey API client and types (mirrors server/progress/journey.ts)
 */
import { apiFetch } from './http';
import type { Bilingual } from './grammarApi';

export interface LevelProgress {
  level: string;
  /** Japanese levels are listed per kind: kanji and word */
  kind?: string;
  total: number;
  seen: number;
  mastered: number;
}

export interface Coverage {
  total: number;
  seen: number;
  mastered: number;
}

export type PathStep =
  | { type: 'review-words'; count: number }
  | { type: 'review-grammar'; count: number }
  | { type: 'fix-mistakes'; pointId: string; count: number }
  | { type: 'learn-words'; level: string; remaining: number }
  | { type: 'learn-grammar'; pointId: string; level: string };

export interface JourneyGoal {
  kind: 'toeic' | 'ielts' | 'cefr' | 'jlpt' | 'none';
  targetScore: number | null;
  targetLevel: string | null;
  currentLevel: string | null;
}

export interface GrammarCluster {
  id: string;
  title: Bilingual;
  total: number;
  practised: number;
  good: number;
  mastered: number;
}

export interface JourneyExam {
  id: string;
  exam: 'toeic' | 'ielts' | 'jlpt';
  mode: string;
  at: string;
  score: number;
  max: number;
  passed: boolean | null;
}

export interface HistoryPoint {
  day: string;
  vocabSeen: number;
  vocabMastered: number;
  grammarSeen: number;
  grammarGood: number;
  grammarMastered: number;
}

export interface Journey {
  language: 'en' | 'ja';
  goal: JourneyGoal;
  covered: string[];
  vocab: { levels: LevelProgress[]; totals: Coverage; goal: Coverage };
  grammar: {
    total: number;
    counts: { none: number; learning: number; good: number; mastered: number };
    clusters: GrammarCluster[];
    due: number;
    goal: Coverage & { good: number };
    weak: { pointId: string; count: number; urgent: boolean }[];
  } | null;
  exams: JourneyExam[];
  week: { newWords: number; grammarPractised: number; studyDays: number };
  steps: PathStep[];
  history: HistoryPoint[];
}

export const journeyApi = {
  get: () => apiFetch<Journey>('/api/progress/journey'),
};
