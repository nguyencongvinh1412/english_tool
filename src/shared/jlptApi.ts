/**
 * JLPT mock-test API client and types (mirrors server/exams/jlpt.ts)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
import type { JlptLevel } from './contentApi';
import type { AudioSegment } from './examApi';

export const MONDAI = [
  'kanji-reading',
  'orthography',
  'word-formation',
  'context',
  'paraphrase',
  'usage',
  'grammar-form',
  'sentence-order',
  'text-grammar',
  'reading-short',
  'reading-mid',
  'reading-long',
  'reading-integrated',
  'reading-thematic',
  'info-search',
  'listen-task',
  'listen-point',
  'listen-summary',
  'listen-expression',
  'listen-response',
  'listen-integrated',
] as const;
export type Mondai = (typeof MONDAI)[number];
export type JlptSection = 'vocab' | 'grammar' | 'reading' | 'listening';
export type JlptMode = 'mini' | 'part' | 'full';
export type ScoreSection = 'language' | 'reading' | 'listening' | 'language-reading';

/** Spoken choices are not printed in the test book */
export const SPOKEN_OPTIONS: Mondai[] = ['listen-summary', 'listen-expression', 'listen-response'];

export interface JlptQuestion {
  /** Furigana markup; [[...]] is underlined, （ ） a blank, ★ the asked blank */
  prompt: string;
  options: string[];
  answerIndex?: number;
  explanation?: { vi: string; en: string };
}

export interface JlptListeningItem {
  situation?: string;
  script: { speaker: 'A' | 'B'; text: string }[];
  question?: string;
  options: string[];
  answerIndex?: number;
  explanation?: { vi: string; en: string };
}

export interface JlptPayload {
  passages?: { label?: string; title?: string; text: string }[];
  questions?: JlptQuestion[];
  speakers?: { A: { name: string; gender: 'female' | 'male' }; B?: { name: string; gender: 'female' | 'male' } };
  items?: JlptListeningItem[];
  /** Imported tests: the real recording */
  audio?: AudioSegment;
}

export interface JlptGroup {
  id: string;
  payload: JlptPayload;
}

export interface JlptResult {
  level: JlptLevel;
  mondai: { mondai: Mondai; section: JlptSection; correct: number; total: number }[];
  sections: { id: ScoreSection; correct: number; total: number; scaled: number; max: number; minimum: number; passedMinimum: boolean }[];
  total: number | null;
  passMark: number;
  passed: boolean | null;
}

export interface JlptSession {
  id: string;
  exam: 'jlpt';
  level: JlptLevel;
  mode: JlptMode;
  status: 'in_progress' | 'submitted';
  timeLimitSec: number;
  startedAt: string;
  submittedAt: string | null;
  deadline: string;
  answers: Record<string, number>;
  flags: string[];
  result: JlptResult | null;
  sections: { mondai: Mondai; section: JlptSection; groups: JlptGroup[] }[];
}

export interface JlptCatalog {
  levels: {
    level: JlptLevel;
    mini: { minutes: number; questions: number };
    full: { minutes: number; questions: number };
    sections: { section: JlptSection; minutes: number; questions: number }[];
  }[];
}

export interface JlptBank {
  levels: { level: JlptLevel; mondai: { mondai: Mondai; section: JlptSection; groups: number; fullTestGroups: number }[] }[];
}

const aiUsed = <T>(r: T) => {
  window.dispatchEvent(new Event(AI_USED_EVENT));
  return r;
};

export const jlptApi = {
  catalog: () => apiFetch<JlptCatalog>('/api/exams/jlpt/catalog'),
  start: (level: JlptLevel, mode: JlptMode, section?: JlptSection) =>
    apiFetch<{ session: JlptSession }>('/api/exams/jlpt/sessions', {
      method: 'POST',
      json: { level, mode, section, model: getSelectedModel() ?? undefined },
    }).then(aiUsed),
  bank: () => apiFetch<JlptBank>('/api/admin/jlpt-bank'),
  fill: (level: JlptLevel, request: { mondai: Mondai; count: number } | { missing: true }) =>
    apiFetch<{ created: number; failed: number }>('/api/admin/jlpt-bank/fill', {
      method: 'POST',
      json: { level, ...request, model: getSelectedModel() ?? undefined },
    }).then(aiUsed),
};

/**
 * Questions of a group (listening items count as questions)
 */
export const jlptQuestionCount = (group: JlptGroup) => (group.payload.questions ?? group.payload.items ?? []).length;
