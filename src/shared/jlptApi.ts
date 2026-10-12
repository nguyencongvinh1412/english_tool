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
export type JlptMode = 'mini' | 'part' | 'full' | 'official';
export type ScoreSection = 'language' | 'reading' | 'listening' | 'language-reading';

export const MONDAI_SECTION: Record<Mondai, JlptSection> = {
  'kanji-reading': 'vocab',
  orthography: 'vocab',
  'word-formation': 'vocab',
  context: 'vocab',
  paraphrase: 'vocab',
  usage: 'vocab',
  'grammar-form': 'grammar',
  'sentence-order': 'grammar',
  'text-grammar': 'grammar',
  'reading-short': 'reading',
  'reading-mid': 'reading',
  'reading-long': 'reading',
  'reading-integrated': 'reading',
  'reading-thematic': 'reading',
  'info-search': 'reading',
  'listen-task': 'listening',
  'listen-point': 'listening',
  'listen-summary': 'listening',
  'listen-expression': 'listening',
  'listen-response': 'listening',
  'listen-integrated': 'listening',
};

/** Spoken choices are not printed in the test book */
export const SPOKEN_OPTIONS: Mondai[] = ['listen-summary', 'listen-expression', 'listen-response'];

export interface JlptQuestion {
  /** Furigana markup; [[...]] is underlined, （ ） a blank, ★ the asked blank */
  prompt: string;
  options: string[];
  answerIndex?: number;
  explanation?: { vi: string; en: string };
  /** Imported tests: a printed picture or table */
  imageAssetId?: string;
}

export interface JlptListeningItem {
  situation?: string;
  script: { speaker: 'A' | 'B'; text: string }[];
  question?: string;
  options: string[];
  answerIndex?: number;
  explanation?: { vi: string; en: string };
  /** Imported tests: the picture for this question */
  imageAssetId?: string;
}

export interface JlptPayload {
  passages?: { label?: string; title?: string; text: string; imageAssetId?: string }[];
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
  /** Imported test title (official mode) */
  title: string | null;
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

export interface JlptOfficialTest {
  id: string;
  title: string;
  level: JlptLevel;
  sections: JlptSection[];
  questions: number;
  minutes: number;
}

export interface JlptCatalog {
  officialTests: JlptOfficialTest[];
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
  start: (level: JlptLevel, mode: JlptMode, options: { section?: JlptSection; importId?: string } = {}) =>
    apiFetch<{ session: JlptSession }>('/api/exams/jlpt/sessions', {
      method: 'POST',
      json: { level, mode, ...options, model: getSelectedModel() ?? undefined },
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
