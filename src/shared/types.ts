/**
 * API types shared across features
 */

export type Role = 'admin' | 'learner';
export type ExamGoal = 'none' | 'toeic' | 'ielts';
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Signed-in user, from GET /api/auth/me */
export type StudyLanguage = 'en' | 'ja';
export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  uiLocale: 'en' | 'vi';
  targetExam: ExamGoal;
  targetScore: number | null;
  cefrLevel: CefrLevel | null;
  /** Language the lessons are shown in (switched in the sidebar) */
  studyLanguage: StudyLanguage;
  /** Japanese goal, N5 (beginner) to N1 */
  jaTargetLevel: JlptLevel | null;
  onboarded: boolean;
  createdAt: string;
  aiQuota: { used: number; limit: number | null };
  /** null = any non-blocked model (admins) */
  allowedModels: string[] | null;
  /** Subscription plan; limits only apply when `enforced` */
  plan: { id: 'free' | 'plus' | 'pro'; name: string; endsAt: string | null; enforced: boolean };
  /** AI credits used and the plan's limits (null while plans are not enforced) */
  credits: { day: { used: number; limit: number | null }; month: { used: number; limit: number | null } };
}

/** Editable profile fields, for PATCH /api/me */
export interface ProfileUpdate {
  displayName?: string;
  uiLocale?: 'en' | 'vi';
  targetExam?: ExamGoal;
  targetScore?: number | null;
  cefrLevel?: CefrLevel | null;
  studyLanguage?: StudyLanguage;
  jaTargetLevel?: JlptLevel | null;
  onboarded?: true;
}
