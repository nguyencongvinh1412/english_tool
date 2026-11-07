/**
 * Deep Word API client and types (mirrors server/routes/deepWord.ts)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
import type { EnWord } from './enVocabApi';

export type Cell = 0 | 1 | 2;
export type Aspect = 'form' | 'meaning' | 'use';
export type Level = 'r' | 'p';

export interface Cells {
  formR: Cell;
  formP: Cell;
  meaningR: Cell;
  meaningP: Cell;
  useR: Cell;
  useP: Cell;
}

export const EMPTY_CELLS: Cells = { formR: 0, formP: 0, meaningR: 0, meaningP: 0, useR: 0, useP: 0 };
export const ASPECTS: Aspect[] = ['form', 'meaning', 'use'];
export const cellOf = (cells: Cells, aspect: Aspect, level: Level): Cell => cells[`${aspect}${level === 'r' ? 'R' : 'P'}` as keyof Cells];

/** The 5 overall stages of a word, 1 to 5 */
export type DeepStage = 1 | 2 | 3 | 4 | 5;

export interface DeepProgress {
  cells: Cells;
  stage: DeepStage;
  sessionStage: number;
  sessionData: Record<string, unknown>;
  completed: boolean;
  deferredCount: number;
  deferralsLeft: number;
  note: string | null;
  nextReviewAt: string | null;
  reviewStep: number;
  startedAt: string;
}

export interface DeepContent {
  simpleDefinition: string;
  coreUse: string;
  synonyms: string[];
  antonyms: string[];
  contrast: { word: string; difference: string; differenceVi: string }[];
  wordFamily: string[];
  collocations: { phrase: string; example: string }[];
  register: string;
  examples: { text: string; vi: string }[];
  status: 'ai' | 'approved';
}

export interface Profile {
  work?: string;
  interests?: string[];
  situations?: string[];
}

export interface DeepPrefs {
  enabled: boolean;
  perDay: 1 | 2;
  profile: Profile;
  profileSkipped: boolean;
}

export type QueuedWord = EnWord & { source: string };

export interface DeepOverview {
  prefs: DeepPrefs;
  today: { state: 'off' | 'ready' | 'resume' | 'done' | 'empty'; word: EnWord | null; sessionStage?: number };
  doneToday: number;
  queue: QueuedWord[];
  /** Words at each of the 5 stages */
  stages: number[];
  beginner: boolean;
}

export interface SessionStart {
  word: EnWord;
  content: DeepContent;
  progress: DeepProgress;
  beginner: boolean;
  profile: Profile;
  choices: { lang: 'vi' | 'en'; answer: string; wrong: string[] };
}

export interface SentenceCheck {
  meaningOk: boolean;
  formOk: boolean;
  naturalOk: boolean;
  feedback: string;
  improved: string;
  issues: { text: string; note: string }[];
}

export type Verdict = 'good' | 'almost' | 'fix';

export interface WordPageData {
  word: EnWord;
  content: DeepContent | null;
  progress: DeepProgress | null;
  sentences: { id: string; text: string | null; result: 'pass' | 'partial' | 'fail'; improved: string | null; at: string }[];
  links: EnWord[];
  queued: boolean;
}

const aiUsed = <T,>(r: T) => {
  window.dispatchEvent(new Event(AI_USED_EVENT));
  return r;
};
const model = () => getSelectedModel() ?? undefined;

export const deepWordApi = {
  overview: () => apiFetch<DeepOverview>('/api/deep/overview'),
  setPrefs: (prefs: Partial<DeepPrefs>) => apiFetch<{ prefs: DeepPrefs }>('/api/deep/prefs', { method: 'PUT', json: prefs }),
  queueAdd: (itemId: string) => apiFetch<{ queued: boolean }>('/api/deep/queue', { method: 'POST', json: { itemId } }),
  queueRemove: (itemId: string) => apiFetch<void>(`/api/deep/queue/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
  start: (itemId?: string) => apiFetch<SessionStart>('/api/deep/session/start', { method: 'POST', json: { itemId, model: model() } }).then(aiUsed),
  save: (itemId: string, stage: number, data?: Record<string, unknown>) => apiFetch<void>('/api/deep/session/save', { method: 'POST', json: { itemId, stage, data } }),
  attempt: (body: { itemId: string; kind: 'guess' | 'recall' | 'listen'; aspect: Aspect; level?: Level; result: 'pass' | 'partial' | 'fail'; assisted?: boolean }) =>
    apiFetch<{ progress: DeepProgress }>('/api/deep/attempt', { method: 'POST', json: body }),
  produce: (itemId: string, text: string) =>
    apiFetch<{ check: SentenceCheck; verdict: Verdict; progress: DeepProgress }>('/api/deep/produce', { method: 'POST', json: { itemId, text, model: model() } }).then(aiUsed),
  selfCheck: (itemId: string, ticked: number, total: number) => apiFetch<{ progress: DeepProgress }>('/api/deep/self-check', { method: 'POST', json: { itemId, ticked, total } }),
  defer: (itemId: string) => apiFetch<{ progress: DeepProgress }>('/api/deep/defer', { method: 'POST', json: { itemId } }),
  related: (itemId: string) => apiFetch<{ words: EnWord[] }>(`/api/deep/related/${encodeURIComponent(itemId)}`),
  complete: (itemId: string, link: string[]) =>
    apiFetch<{ progress: DeepProgress; startCells: Cells | null; schedule: string[]; deferred: boolean }>('/api/deep/session/complete', { method: 'POST', json: { itemId, link } }),
  word: (itemId: string) => apiFetch<WordPageData>(`/api/deep/word/${encodeURIComponent(itemId)}`),
  notebook: (stage?: number, q?: string) =>
    apiFetch<{ words: (EnWord & { progress: DeepProgress })[] }>(`/api/deep/notebook?${new URLSearchParams({ ...(stage ? { stage: String(stage) } : {}), ...(q ? { q } : {}) })}`),
};

/** The stage labels use these keys in the messages (t.deepWord.stages) */
export const STAGE_KEYS = ['met', 'recognised', 'understood', 'assisted', 'spontaneous'] as const;

/**
 * Splits a sentence into plain parts and parts the AI flagged, in order. A flagged text that is not in the sentence is skipped.
 */
export function markIssues(text: string, issues: { text: string; note: string }[]): { text: string; issue?: number }[] {
  const found = issues
    .map((issue, index) => ({ at: text.indexOf(issue.text), length: issue.text.length, index }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at);
  const parts: { text: string; issue?: number }[] = [];
  let cursor = 0;
  for (const hit of found) {
    if (hit.at < cursor) continue;
    if (hit.at > cursor) parts.push({ text: text.slice(cursor, hit.at) });
    parts.push({ text: text.slice(hit.at, hit.at + hit.length), issue: hit.index + 1 });
    cursor = hit.at + hit.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
