/**
 * Placement test API client and types (mirrors server/placement)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';

export type PlacementSkill = 'vocabulary' | 'grammar' | 'reading' | 'listening';
export type Confidence = 'low' | 'medium' | 'high';

export interface PlacementQuestion {
  id: string;
  skill: PlacementSkill;
  prompt: string;
  /** Passage (reading) or transcript (listening, played as audio, never shown) */
  context: string | null;
  options: string[];
}

export interface SkillResult {
  level: string;
  confidence: Confidence;
}

export interface PlacementResult {
  levels: Record<PlacementSkill, SkillResult | null>;
  overall: string | null;
  answered: number;
  correct: number;
}

export interface PlacementSession {
  id: string;
  status: 'in_progress' | 'finished';
  question: PlacementQuestion | null;
  result: PlacementResult | null;
  progress: { phases: { skill: PlacementSkill; asked: number; total: number; done: boolean }[]; answered: number; total: number; phase: number };
}

export interface PlacementOverview {
  session: PlacementSession | null;
  latest: { levels: Partial<Record<PlacementSkill, SkillResult>>; overall: string | null; measuredAt: string } | null;
}

export type ProductiveSkill = 'writing' | 'speaking';

export const placementApi = {
  get: () => apiFetch<PlacementOverview>('/api/placement'),
  /** Places a short piece of writing, or a transcript of speech, on the CEFR scale (uses AI credits) */
  productive: (skill: ProductiveSkill, text: string) =>
    apiFetch<{ level: string; reason: string }>('/api/placement/productive', { method: 'POST', json: { skill, text, model: getSelectedModel() ?? undefined } }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
  start: () => apiFetch<{ session: PlacementSession }>('/api/placement/start', { method: 'POST' }),
  answer: (sessionId: string, questionId: string, choice: number) => apiFetch<{ session: PlacementSession }>(`/api/placement/${sessionId}/answer`, { method: 'POST', json: { questionId, choice } }),
};
