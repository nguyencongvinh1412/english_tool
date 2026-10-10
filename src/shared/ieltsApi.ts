/**
 * IELTS exam API client and types (mirrors server/exams/ielts.ts)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
import type { SpeakingFeedback, SpeakingIelts, Speaker, WritingFeedback, WritingPrompt } from './contentApi';
import type { ScriptLine } from './examApi';

export type IeltsComponent = 'listening' | 'reading' | 'writing' | 'speaking';
export type IeltsPart = 'listening' | 'reading' | 'writing-task1' | 'writing-task2' | 'speaking';
export type IeltsMode = 'mini' | 'part' | 'full';
export type IeltsSlot = 'listening-1' | 'listening-2' | 'listening-3' | 'listening-4' | 'reading' | 'writing-task1' | 'writing-task2' | 'speaking';

export const IELTS_COMPONENTS: IeltsComponent[] = ['listening', 'reading', 'writing', 'speaking'];
export const IELTS_PARTS: IeltsPart[] = ['listening', 'reading', 'writing-task1', 'writing-task2', 'speaking'];

/** TRUE / FALSE / NOT GIVEN answers are stored as these indexes */
export const TFNG_VALUES = ['true', 'false', 'not_given'] as const;

/** Objective question; answers and explanations only exist after submit */
export type IeltsQuestion =
  | { type: 'mcq'; prompt: string; options: string[]; answerIndex?: number; explanation?: string }
  | { type: 'tfng'; prompt: string; answer?: (typeof TFNG_VALUES)[number]; explanation?: string }
  | { type: 'gap'; prompt: string; wordLimit: number; answers?: string[]; explanation?: string };

export interface IeltsListening {
  section: 1 | 2 | 3 | 4;
  title: string;
  context: string;
  speakers: { A: Speaker; B?: Speaker; C?: Speaker };
  script: ScriptLine[];
  questions: IeltsQuestion[];
}

export interface IeltsReading {
  title: string;
  paragraphs: string[];
  questions: IeltsQuestion[];
}

export type IeltsGroup =
  | { id: string; kind: 'ielts-listening'; payload: IeltsListening }
  | { id: string; kind: 'ielts-reading'; payload: IeltsReading }
  | { id: string; kind: 'writing-prompt'; payload: WritingPrompt }
  | { id: string; kind: 'speaking-ielts'; payload: SpeakingIelts };

type GradeStatus = 'pending' | 'done' | 'failed';

export interface IeltsResult {
  listening: { correct: number; total: number; band: number } | null;
  reading: { correct: number; total: number; band: number } | null;
  writing: {
    status: GradeStatus;
    band: number | null;
    tasks: { groupId: string; taskType: string; words: number; band: number | null; feedback: WritingFeedback | null }[];
    error?: string;
  } | null;
  speaking: { status: GradeStatus; band: number | null; groupId: string; feedback: SpeakingFeedback | null; error?: string } | null;
  overall: number | null;
}

export interface IeltsSession {
  id: string;
  exam: 'ielts';
  mode: IeltsMode;
  status: 'in_progress' | 'submitted';
  timeLimitSec: number;
  startedAt: string;
  submittedAt: string | null;
  deadline: string;
  answers: Record<string, number | string>;
  flags: string[];
  result: IeltsResult | null;
  title: null;
  sections: { component: IeltsComponent; groups: IeltsGroup[] }[];
}

export interface IeltsCatalog {
  modes: { mini: { minutes: number }; full: { minutes: number } };
  parts: { part: IeltsPart; minutes: number }[];
  bank: Record<IeltsSlot, number>;
}

export const ieltsApi = {
  catalog: () => apiFetch<IeltsCatalog>('/api/exams/ielts/catalog'),
  start: (mode: IeltsMode, part?: IeltsPart) =>
    apiFetch<{ session: IeltsSession }>('/api/exams/ielts/sessions', { method: 'POST', json: { mode, part, model: getSelectedModel() ?? undefined } }).then((r) => {
      // Starting may generate missing groups with AI
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
  get: (id: string) => apiFetch<{ session: IeltsSession }>(`/api/exams/sessions/${id}`),
  grade: (id: string) => apiFetch<{ session: IeltsSession }>(`/api/exams/sessions/${id}/grade`, { method: 'POST', json: { model: getSelectedModel() ?? undefined } }),
  bank: () => apiFetch<{ slots: { slot: IeltsSlot; groups: number; fullTestGroups: number }[] }>('/api/admin/ielts-bank'),
  fill: (slot: IeltsSlot, count: number, level: string) =>
    apiFetch<{ created: number; failed: number }>('/api/admin/ielts-bank/fill', { method: 'POST', json: { slot, count, level, model: getSelectedModel() ?? undefined } }),
};

/** Answer id of an objective question or essay */
export const questionId = (groupId: string, index: number) => `${groupId}:${index}`;
export const essayId = (groupId: string) => `${groupId}:essay`;

/**
 * Speaking questions in order with their answer ids (matches the server)
 */
export function speakingQuestions(groupId: string, set: SpeakingIelts): { id: string; part: 1 | 2 | 3; text: string }[] {
  return [
    ...set.part1.map((text, i) => ({ id: `${groupId}:p1-${i}`, part: 1 as const, text })),
    { id: `${groupId}:p2`, part: 2 as const, text: set.part2.cueCard },
    ...set.part3.map((text, i) => ({ id: `${groupId}:p3-${i}`, part: 3 as const, text })),
  ];
}

/**
 * Answer ids of every question in a group, for the navigator and progress
 */
export function groupAnswerIds(group: IeltsGroup): string[] {
  if (group.kind === 'writing-prompt') return [essayId(group.id)];
  if (group.kind === 'speaking-ielts') return speakingQuestions(group.id, group.payload).map((q) => q.id);
  return group.payload.questions.map((_, i) => questionId(group.id, i));
}
