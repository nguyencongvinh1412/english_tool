/**
 * Skill curriculum API client and types (mirrors server/routes/curriculum.ts and server/curriculum/units.ts)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
import type { Attempt } from './progressApi';
import type { WritingFeedback, WritingPrompt } from './contentApi';
import type { Bilingual } from './grammarApi';

export type CurriculumSkill = 'writing';
export type UnitLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export interface UnitProgress {
  drillScore: number | null;
  bestBand: number | null;
  attempts: number;
  completedAt: string | null;
}

export interface PathUnit {
  id: string;
  track: string;
  level: UnitLevel;
  title: Bilingual;
  /** The lesson has been written */
  ready: boolean;
  /** Open on the learner's path (earlier lessons done or below their level) */
  open: boolean;
  progress: UnitProgress | null;
}

export interface LearningPath {
  skill: CurriculumSkill;
  learnerLevel: string | null;
  units: PathUnit[];
}

export type UnitDrill =
  | { type: 'choice'; prompt: Bilingual; sentence?: string; options: string[]; answerIndex: number; explanation: Bilingual }
  | { type: 'order'; prompt: Bilingual; parts: string[]; explanation: Bilingual };

export interface UnitContent {
  objectives: Bilingual[];
  learn: { heading: Bilingual; body: Bilingual }[];
  model: { situation: Bilingual; subject: string; parts: { label: Bilingual; text: string; note: Bilingual }[] };
  phrases: { use: Bilingual; items: string[] }[];
  drills: UnitDrill[];
  task: Omit<WritingPrompt, 'taskType' | 'chart'>;
  checklist: { id: string; label: Bilingual }[];
}

export interface UnitView {
  unit: { id: string; skill: CurriculumSkill; track: string; level: UnitLevel; title: Bilingual; order: number; total: number };
  content: UnitContent;
  open: boolean;
  progress: UnitProgress | null;
  next: { id: string; title: Bilingual; level: UnitLevel } | null;
}

export type ChecklistMark = 'yes' | 'partly' | 'no';

export interface UnitFeedback extends WritingFeedback {
  checklist: { id: string; met: ChecklistMark; comment: string }[];
}

export interface UnitAdminRow {
  id: string;
  skill: CurriculumSkill;
  level: UnitLevel;
  title: Bilingual;
  status: 'draft' | 'reviewed' | null;
  edited: boolean;
  updatedAt: string | null;
}

/** Where a skill's course lives in the app: under the skill, so the practice header shows the skill */
export const coursePath = (skill: CurriculumSkill) => `/${skill}/course`;
export const unitPath = (skill: CurriculumSkill, id: string) => `/${skill}/course/${id}`;

/** The lesson task as a regular email task, for the shared task card */
export const unitTask = (content: UnitContent): WritingPrompt => ({ taskType: 'email', ...content.task });

const model = () => getSelectedModel() ?? undefined;

export const curriculumApi = {
  path: (skill: CurriculumSkill) => apiFetch<LearningPath>(`/api/learn/${skill}`),
  unit: (id: string) => apiFetch<UnitView>(`/api/learn/units/${id}`),
  saveDrills: (id: string, correct: number, total: number) =>
    apiFetch<{ progress: UnitProgress }>(`/api/learn/units/${id}/drills`, { method: 'POST', json: { correct, total } }),
  write: async (id: string, response: string, durationSec: number) => {
    const result = await apiFetch<{ feedback: UnitFeedback; progress: UnitProgress; attempt: Attempt; xpEarned: number }>(`/api/learn/units/${id}/write`, {
      method: 'POST',
      json: { response, durationSec, model: model() },
    });
    window.dispatchEvent(new Event(AI_USED_EVENT));
    return result;
  },
  adminList: () => apiFetch<{ units: UnitAdminRow[] }>('/api/admin/units'),
  adminUnit: (id: string) => apiFetch<{ content: UnitContent | null }>(`/api/admin/units/${id}`),
  save: (id: string, content: UnitContent, status: 'draft' | 'reviewed') => apiFetch<{ ok: true }>(`/api/admin/units/${id}`, { method: 'PUT', json: { content, status } }),
  draft: async (id: string) => {
    const result = await apiFetch<{ content: UnitContent }>(`/api/admin/units/${id}/draft`, { method: 'POST', json: { model: model() } });
    window.dispatchEvent(new Event(AI_USED_EVENT));
    return result;
  },
};
