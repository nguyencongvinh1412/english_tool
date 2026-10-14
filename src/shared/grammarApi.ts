/**
 * Grammar map API client and types (mirrors server/routes/grammar.ts and server/grammar/*)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';

export type Bilingual = { en: string; vi: string };
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export interface GrammarCluster {
  id: string;
  title: Bilingual;
}

export interface TimelineMark {
  kind: 'point' | 'span' | 'repeat' | 'link';
  from: number;
  to?: number;
  label?: Bilingual;
}

export interface Timeline {
  marks: TimelineMark[];
  reference?: { at: number; label: Bilingual };
}

export interface GrammarMapPoint {
  id: string;
  cluster: string;
  title: Bilingual;
  cefr: Cefr;
  hasTimeline: boolean;
  /** The explanation has been drafted */
  ready: boolean;
  status: 'draft' | 'reviewed' | null;
  summary: Bilingual | null;
  signals: string[];
}

export type EdgeKind = 'builds' | 'contrast' | 'related';

export interface GrammarMap {
  clusters: GrammarCluster[];
  points: GrammarMapPoint[];
  edges: { from: string; to: string; kind: EdgeKind }[];
}

export interface GrammarContent {
  summary: Bilingual;
  forms: { label: Bilingual; pattern: string; example: { en: string; vi: string } }[];
  uses: { title: Bilingual; explanation: Bilingual; examples: { en: string; vi: string }[] }[];
  signals: string[];
  mistakes: { wrong: string; right: string; why: Bilingual }[];
  contrastNotes: { with: string; note: Bilingual }[];
  tip?: Bilingual;
}

export interface GrammarLink {
  id: string;
  title: Bilingual;
  cefr: Cefr;
  cluster: string;
}

export interface GrammarPoint {
  id: string;
  cluster: string;
  title: Bilingual;
  cefr: Cefr;
  timeline?: Timeline;
  content: GrammarContent | null;
  status: 'draft' | 'reviewed' | null;
  builds: GrammarLink[];
  leadsTo: GrammarLink[];
  contrasts: GrammarLink[];
  related: GrammarLink[];
}

export interface GrammarAdminRow {
  id: string;
  cluster: string;
  title: Bilingual;
  cefr: Cefr;
  status: 'draft' | 'reviewed' | null;
  edited: boolean;
  updatedAt: string | null;
}

export type PracticeItem =
  | { type: 'choice'; prompt: string; options: string[]; answerIndex: number; explanation: Bilingual }
  | { type: 'gap'; prompt: string; answers: string[]; hint?: string; explanation: Bilingual };

export type Mastery = 'none' | 'learning' | 'good' | 'mastered';

export interface PointProgress {
  pointId: string;
  mastery: Mastery;
  due: boolean;
  dueAt: string;
  lastScore: number | null;
}

export interface GrammarMistake {
  pointId: string;
  count: number;
  lastAt: string;
  /** Several recent mistakes and no practice since */
  urgent: boolean;
  examples: { wrong: string | null; right: string | null }[];
}

export interface GrammarAnswer {
  onTopic: boolean;
  answer: string;
  points: GrammarLink[];
}

export const grammarApi = {
  map: () => apiFetch<GrammarMap>('/api/grammar'),
  point: (id: string) => apiFetch<{ point: GrammarPoint }>(`/api/grammar/${encodeURIComponent(id)}`),
  mistakes: () => apiFetch<{ mistakes: GrammarMistake[] }>('/api/grammar/mistakes'),
  tagMistakes: (mistakes: { prompt: string; correct: string; chosen?: string }[]) =>
    apiFetch<{ points: (string | null)[] }>('/api/grammar/tag-mistakes', {
      method: 'POST',
      json: { mistakes, model: getSelectedModel() ?? undefined },
    }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
  ask: (question: string) =>
    apiFetch<GrammarAnswer>('/api/grammar/ask', { method: 'POST', json: { question, model: getSelectedModel() ?? undefined } }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
  progress: () => apiFetch<{ points: PointProgress[] }>('/api/grammar/progress'),
  practice: (id: string) =>
    apiFetch<{ set: { id: string; items: PracticeItem[] } }>(`/api/grammar/${encodeURIComponent(id)}/practice`, {
      method: 'POST',
      json: { model: getSelectedModel() ?? undefined },
    }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
  result: (id: string, setId: string, correct: number, total: number, durationSec: number) =>
    apiFetch<{ progress: Omit<PointProgress, 'due'>; xpEarned: number }>(`/api/grammar/${encodeURIComponent(id)}/practice/${setId}/result`, {
      method: 'POST',
      json: { correct, total, durationSec },
    }),
  adminList: () => apiFetch<{ points: GrammarAdminRow[] }>('/api/admin/grammar'),
  save: (id: string, content: GrammarContent, status: 'draft' | 'reviewed') =>
    apiFetch<{ ok: true }>(`/api/admin/grammar/${encodeURIComponent(id)}`, { method: 'PUT', json: { content, status } }),
  draft: (id: string) =>
    apiFetch<{ content: GrammarContent }>(`/api/admin/grammar/${encodeURIComponent(id)}/draft`, {
      method: 'POST',
      json: { model: getSelectedModel() ?? undefined },
    }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
};

/** Grammar point page */
export const grammarPath = (id: string) => `/grammar/${id}`;

/** Comparison page of two easily confused points */
export const comparePath = (a: string, b: string) => `/grammar/compare/${a}/${b}`;
/** Decision tree page */
export const decidePath = (tree: string) => `/grammar/decide/${tree}`;

/**
 * Typed answer check: case, extra spaces, curly apostrophes and a final full stop do not matter
 */
export const normalizeAnswer = (value: string) =>
  value.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/[.!?]$/, '');
