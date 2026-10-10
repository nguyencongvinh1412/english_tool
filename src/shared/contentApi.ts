/**
 * Content bank and AI feature client
 * Types mirror server/content/schemas.ts
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
import type { Attempt } from './progressApi';

export type CefrLevel = 'A2' | 'B1' | 'B2' | 'C1';
export const CONTENT_LEVELS: CefrLevel[] = ['A2', 'B1', 'B2', 'C1'];

export type ContentKind = 'reading-passage' | 'reading-gapfill' | 'listening-quiz' | 'speaking-ielts' | 'writing-prompt';
export type WritingTask = 'email' | 'ielts-task1' | 'ielts-task2';

export interface McqQuestion {
  type: 'mcq';
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface TfngQuestion {
  type: 'tfng';
  prompt: string;
  answer: 'true' | 'false' | 'not_given';
  explanation: string;
}

export type QuizQuestion = McqQuestion | TfngQuestion;

export interface ReadingPassage {
  title: string;
  paragraphs: string[];
  questions: QuizQuestion[];
}

export interface ReadingGapfill {
  title: string;
  questions: McqQuestion[];
}

export interface Speaker {
  name: string;
  gender: 'female' | 'male';
}

export interface ListeningQuiz {
  title: string;
  format: 'dialogue' | 'monologue';
  speakers: { A: Speaker; B?: Speaker };
  script: { speaker: 'A' | 'B'; text: string }[];
  questions: McqQuestion[];
}

export interface SpeakingIelts {
  topic: string;
  part1: string[];
  part2: { cueCard: string; bullets: string[]; closing: string };
  part3: string[];
}

export interface ChartData {
  type: 'bar' | 'line';
  title: string;
  unit: string;
  categories: string[];
  series: { name: string; values: number[] }[];
}

export interface WritingPrompt {
  taskType: WritingTask;
  title: string;
  instructions: string;
  prompt: string;
  minWords: number;
  timeMinutes: number;
  chart?: ChartData;
  email?: { from: string; subject: string; body: string };
}

export interface ContentSummary {
  id: string;
  kind: ContentKind;
  level: CefrLevel | null;
  title: string;
  topic: string | null;
  exam: 'none' | 'toeic' | 'ielts';
  part: string | null;
  source: 'builtin' | 'ai' | 'imported';
  createdAt: string;
  best: number | null;
}

export interface ContentItem<P> extends ContentSummary {
  payload: P;
}

export interface Criterion {
  key: string;
  name: string;
  band: number;
  comment: string;
}

export interface BandFeedback {
  overallBand: number;
  criteria: Criterion[];
  strengths: string[];
  improvements: string[];
}

export interface WritingFeedback extends BandFeedback {
  corrections: { original: string; corrected: string; explanation: string }[];
  improvedVersion: string;
}

export interface SpeakingFeedback extends BandFeedback {
  answers: { question: string; comment: string; betterAnswer: string }[];
}

export interface WordDefinition {
  word: string;
  partOfSpeech: string;
  ipa: string;
  meaning: string;
  example: string;
  translation: string;
}

interface ScoreResult<F> {
  feedback: F;
  attempt: Attempt;
  xpEarned: number;
}

/** Model chosen in the sidebar picker, if any */
const selectedModel = (): string | undefined => getSelectedModel() ?? undefined;

/** Lets the app shell refresh the remaining AI quota after an AI-backed call */
function afterAi<T>(promise: Promise<T>): Promise<T> {
  return promise.then((value) => {
    window.dispatchEvent(new Event(AI_USED_EVENT));
    return value;
  });
}

export const contentApi = {
  list: (kind: ContentKind, level?: CefrLevel, writingTask?: WritingTask) => {
    const params = new URLSearchParams({ kind });
    if (level) params.set('level', level);
    if (writingTask) params.set('writingTask', writingTask);
    return apiFetch<{ items: ContentSummary[] }>(`/api/content?${params}`);
  },
  get: <P>(id: string) => apiFetch<{ item: ContentItem<P> }>(`/api/content/${encodeURIComponent(id)}`),
  generate: <P>(input: { kind: ContentKind; level: CefrLevel; topic?: string; writingTask?: WritingTask }) =>
    afterAi(apiFetch<{ item: ContentItem<P> }>('/api/content/generate', { method: 'POST', json: { ...input, model: selectedModel() } })),
  define: (word: string, sentence: string) =>
    afterAi(apiFetch<{ definition: WordDefinition }>('/api/ai/define', { method: 'POST', json: { word, sentence, model: selectedModel() } })),
  scoreWriting: (contentId: string, response: string, durationSec: number) =>
    afterAi(apiFetch<ScoreResult<WritingFeedback>>('/api/ai/score-writing', {
      method: 'POST',
      json: { contentId, response, durationSec, model: selectedModel() },
    })),
  scoreSpeaking: (contentId: string, answers: { question: string; transcript: string }[], durationSec: number) =>
    afterAi(apiFetch<ScoreResult<SpeakingFeedback>>('/api/ai/score-speaking', {
      method: 'POST',
      json: { contentId, answers, durationSec, model: selectedModel() },
    })),
};
