/**
 * API types shared across features
 */

export type Role = 'admin' | 'learner';
export type ExamGoal = 'none' | 'toeic' | 'ielts';
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Signed-in user, from GET /api/auth/me */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  uiLocale: 'en' | 'vi';
  targetExam: ExamGoal;
  targetScore: number | null;
  cefrLevel: CefrLevel | null;
  onboarded: boolean;
  createdAt: string;
  aiQuota: { used: number; limit: number | null };
  /** null = any non-blocked model (admins) */
  allowedModels: string[] | null;
}

/** Editable profile fields, for PATCH /api/me */
export interface ProfileUpdate {
  displayName?: string;
  uiLocale?: 'en' | 'vi';
  targetExam?: ExamGoal;
  targetScore?: number | null;
  cefrLevel?: CefrLevel | null;
  onboarded?: true;
}
