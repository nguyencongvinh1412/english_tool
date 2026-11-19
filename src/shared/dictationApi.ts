import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';

export interface DictationPassage {
  id: string;
  title: string;
  level: 'A2' | 'B1' | 'B2' | 'C1';
  /** Empty for a fixed lesson of the app, whose sentences the browser holds */
  sentences: string[];
  /** A passage cut from the books, one the AI wrote, or a fixed lesson of the app */
  origin: 'book' | 'ai' | 'builtin';
  /** Not done yet, or done before with a score under 80% */
  reason: 'new' | 'redo';
  /** The score of the last time, for a redo */
  previousPercent?: number;
}

/** new: not done yet; redo: done with under 80%; auto: mostly new, now and then one to redo */
export type DictationMode = 'auto' | 'new' | 'redo';

export const dictationApi = {
  next: (mode: DictationMode = 'auto') =>
    apiFetch<{ lesson: DictationPassage }>('/api/dictation/next', { method: 'POST', json: { mode, model: getSelectedModel() ?? undefined } }).then((r) => {
      // Writing a new passage uses the AI
      if (r.lesson.origin === 'ai' && r.lesson.reason === 'new') window.dispatchEvent(new Event(AI_USED_EVENT));
      return r.lesson;
    }),
  /** The learner's level and how many lessons are worth doing again */
  summary: () => apiFetch<{ level: DictationPassage['level']; weak: number }>('/api/dictation/summary'),
};
