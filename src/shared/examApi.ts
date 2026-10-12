/**
 * Exam API client and types (mirrors server/exams/toeic.ts)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
import type { JlptLevel, McqQuestion, Speaker } from './contentApi';
import type { JlptResult, JlptSection } from './jlptApi';

export type ExamMode = 'mini' | 'part' | 'full' | 'official';
export type ToeicPart = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ExamSection = 'listening' | 'reading';

/** Printed question; answers and explanations only exist after submit */
export type ExamQuestion = Omit<McqQuestion, 'answerIndex' | 'explanation'> & Partial<Pick<McqQuestion, 'answerIndex' | 'explanation'>>;

export interface P2Item {
  question: string;
  options: string[];
  answerIndex?: number;
  explanation?: string;
}

/** Part 1 (imported tests): photo plus four spoken statements */
export interface P1Item {
  imageAssetId: string;
  statements: string[];
  answerIndex?: number;
  explanation?: string;
}

/** Slice of an uploaded recording, in seconds */
export interface AudioSegment {
  assetId: string;
  start?: number;
  end?: number;
}

export interface ScriptLine {
  speaker: 'A' | 'B' | 'C';
  text: string;
}

export interface GroupPayload {
  /** Imported tests: the book's number for the first question */
  startNumber?: number;
  /** Parts 1-2 */
  items?: (P1Item | P2Item)[];
  /** Real recording from an imported test (otherwise the script is read by the voice service) */
  audio?: AudioSegment;
  /** Parts 3-7 */
  questions?: ExamQuestion[];
  /** Parts 3-4 */
  speakers?: { A: Speaker; B?: Speaker; C?: Speaker };
  script?: ScriptLine[];
  talkType?: string;
  /** Parts 3-4: printed chart or schedule, as text */
  graphic?: string;
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
  /** Imported test title (official mode) */
  title: string | null;
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
  exam: 'toeic' | 'ielts' | 'jlpt';
  /** JLPT sessions: level and the sections tested */
  level: JlptLevel | null;
  jlptSections: JlptSection[];
  title: string | null;
  /** IELTS sessions: components tested */
  components: string[];
  mode: ExamMode;
  parts: ToeicPart[];
  status: 'in_progress' | 'submitted';
  startedAt: string;
  submittedAt: string | null;
  deadline: string;
  /** TOEIC result, or the IELTS result for IELTS sessions */
  result: (ExamResult & { overall?: undefined }) | IeltsSummaryResult | JlptResult | null;
}

/** Fields of an IELTS result shown in the history */
export interface IeltsSummaryResult {
  listening: { band: number } | null;
  reading: { band: number } | null;
  writing: { band: number | null } | null;
  speaking: { band: number | null } | null;
  overall: number | null;
}

export interface Catalog {
  modes: { mini: { minutes: number; parts: number }; full: { minutes: number; questions: number } };
  parts: { part: ToeicPart; section: ExamSection; questions: number; minutes: number; bankGroups: number }[];
  officialTests: OfficialTest[];
}

export interface OfficialTest {
  id: string;
  title: string;
  parts: ToeicPart[];
  questions: number;
  minutes: number;
}

export const examApi = {
  catalog: () => apiFetch<Catalog>('/api/exams/toeic/catalog'),
  start: (mode: ExamMode, options: { part?: ToeicPart; importId?: string } = {}) =>
    apiFetch<{ session: ExamSession }>('/api/exams/toeic/sessions', { method: 'POST', json: { mode, ...options, model: getSelectedModel() ?? undefined } }).then((r) => {
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
    apiFetch<{ created: number; failed: number }>('/api/admin/exam-bank/fill', { method: 'POST', json: { part, count, level, model: getSelectedModel() ?? undefined } }),
};

/** Streaming URL of an uploaded file */
export const mediaUrl = (assetId: string) => `/api/media/${assetId}`;

/** Questions of a group with their answer ids, in display order */
export function groupQuestionIds(part: ToeicPart, group: ExamGroup): string[] {
  const count = part <= 2 ? (group.payload.items?.length ?? 0) : (group.payload.questions?.length ?? 0);
  return Array.from({ length: count }, (_, i) => `${group.id}:${i}`);
}
