/**
 * Exam API client and types (mirrors server/exams/toeic.ts)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT } from '@/services/api';
import type { McqQuestion, Speaker } from './contentApi';

export type ExamMode = 'mini' | 'part' | 'full';
export type ToeicPart = 2 | 3 | 4 | 5 | 6 | 7;
export type ExamSection = 'listening' | 'reading';

/** Printed question; answers and explanations only exist after submit */
export type ExamQuestion = Omit<McqQuestion, 'answerIndex' | 'explanation'> & Partial<Pick<McqQuestion, 'answerIndex' | 'explanation'>>;

export interface P2Item {
  question: string;
  options: string[];
  answerIndex?: number;
  explanation?: string;
}

export interface ScriptLine {
  speaker: 'A' | 'B' | 'C';
  text: string;
}

export interface GroupPayload {
  /** Part 2 */
  items?: P2Item[];
  /** Parts 3-7 */
  questions?: ExamQuestion[];
  /** Parts 3-4 */
  speakers?: { A: Speaker; B?: Speaker; C?: Speaker };
  script?: ScriptLine[];
  talkType?: string;
  /** Part 6 */
  title?: string;
  passage?: string;
  /** Part 7 */
  passages?: { kind: string; title: string; text: string }[];
}

export interface ExamGroup {
  id: string;
  payload: GroupPayload;
}

export interface ExamResult {
  parts: { part: ToeicPart; section: ExamSection; correct: number; total: number }[];
  sections: Record<ExamSection, { correct: number; total: number; scaled: number } | null>;
  totalScaled: number | null;
}

export interface ExamSession {
  id: string;
  exam: 'toeic';
  mode: ExamMode;
  status: 'in_progress' | 'submitted';
  timeLimitSec: number;
  startedAt: string;
  submittedAt: string | null;
  deadline: string;
  answers: Record<string, number>;
  flags: string[];
  result: ExamResult | null;
  sections: { part: ToeicPart; section: ExamSection; groups: ExamGroup[] }[];
}

export interface SessionSummary {
  id: string;
  mode: ExamMode;
  parts: ToeicPart[];
  status: 'in_progress' | 'submitted';
  startedAt: string;
  submittedAt: string | null;
  deadline: string;
  result: ExamResult | null;
}

export interface Catalog {
  modes: { mini: { minutes: number; parts: number }; full: { minutes: number; questions: number } };
  parts: { part: ToeicPart; section: ExamSection; questions: number; minutes: number; bankGroups: number }[];
}

export const examApi = {
  catalog: () => apiFetch<Catalog>('/api/exams/toeic/catalog'),
  start: (mode: ExamMode, part?: ToeicPart) =>
    apiFetch<{ session: ExamSession }>('/api/exams/toeic/sessions', { method: 'POST', json: { mode, part } }).then((r) => {
      // Starting may generate missing groups with AI
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
  list: () => apiFetch<{ sessions: SessionSummary[] }>('/api/exams/sessions'),
  get: (id: string) => apiFetch<{ session: ExamSession }>(`/api/exams/sessions/${id}`),
  save: (id: string, answers: Record<string, number | null>, flags?: string[]) =>
    apiFetch<{ saved: number }>(`/api/exams/sessions/${id}`, { method: 'PATCH', json: { answers, flags } }),
  submit: (id: string) => apiFetch<{ session: ExamSession; xpEarned: number }>(`/api/exams/sessions/${id}/submit`, { method: 'POST' }),
  bank: () => apiFetch<{ parts: { part: ToeicPart; groups: number; fullTestGroups: number }[] }>('/api/admin/exam-bank'),
  fill: (part: ToeicPart, count: number, level: string) =>
    apiFetch<{ created: number; failed: number }>('/api/admin/exam-bank/fill', { method: 'POST', json: { part, count, level } }),
};

/** Questions of a group with their answer ids, in display order */
export function groupQuestionIds(part: ToeicPart, group: ExamGroup): string[] {
  const count = part === 2 ? (group.payload.items?.length ?? 0) : (group.payload.questions?.length ?? 0);
  return Array.from({ length: count }, (_, i) => `${group.id}:${i}`);
}
