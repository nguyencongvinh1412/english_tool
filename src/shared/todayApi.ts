/**
 * Today API client and types (mirrors server/progress/today.ts)
 */
import { ApiRequestError, apiFetch } from './http';
import { loadOffline, saveOffline } from './offlineCache';
import type { JourneyGoal } from './journeyApi';

export const TODAY_BUDGETS = [10, 20, 45] as const;
export type TodayBudget = (typeof TODAY_BUDGETS)[number];
export type TodaySkill = 'listening' | 'reading' | 'speaking' | 'writing';

export type TodayTask = {
  id: string;
  minutes: number;
  shortened?: boolean;
  done: boolean;
  needsAi?: boolean;
  /** Day it was first planned, when carried over */
  rolledFrom?: string;
} & (
  | { type: 'review-words'; count: number }
  | { type: 'review-grammar'; count: number }
  | { type: 'fix-mistakes'; pointId: string; count: number }
  | { type: 'learn-grammar'; pointId: string; level: string }
  | { type: 'practice-skill'; skill: TodaySkill }
  | { type: 'learn-words'; level: string; remaining: number }
);

export interface Today {
  language: 'en' | 'ja';
  budget: TodayBudget;
  totalMinutes: number;
  doneMinutes: number;
  tasks: TodayTask[];
  carried: number;
  rolled: number;
  welcomeBack: { days: number } | null;
  goal: JourneyGoal;
  /** Set when the list is the copy saved on this device (no connection): when it was saved */
  savedAt?: number;
}

export const todayApi = {
  /** Today's list; without a connection, the last copy saved on this device (if any) */
  get: async (minutes: TodayBudget): Promise<Today> => {
    try {
      const today = await apiFetch<Today>(`/api/today?minutes=${minutes}`);
      saveOffline(`today:${minutes}`, today);
      return today;
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'network') {
        const copy = loadOffline<Today>(`today:${minutes}`);
        if (copy) return { ...copy.value, savedAt: copy.savedAt };
      }
      throw error;
    }
  },
};
