/**
 * Progress client and provider
 * Records finished activities, keeps the summary (XP, streak) fresh for the shell,
 * and celebrates XP gains
 */
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { progressApi, type AttemptInput, type ProgressSummary } from './progressApi';

export type { Activity, Attempt, AttemptInput, DayStat, ProgressSummary, SkillName } from './progressApi';

interface ProgressContextValue {
  summary: ProgressSummary | null;
  refresh: () => Promise<void>;
  /** Saves an attempt, refreshes the summary and returns the XP earned */
  record: (input: AttemptInput) => Promise<number>;
  /** For attempts the server recorded itself (AI scoring): refresh and show the XP burst */
  celebrate: (xpEarned: number) => void;
  /** Most recent XP gain, for the celebration burst; cleared after it plays */
  lastGain: { xp: number; id: number } | null;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

/** How long the "+XP" burst stays on screen */
const GAIN_DURATION_MS = 2200;

export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  // Keyed by user so a previous account's summary is never shown after switching
  const [state, setState] = useState<{ userId: string; data: ProgressSummary } | null>(null);
  const [lastGain, setLastGain] = useState<{ xp: number; id: number } | null>(null);
  const userId = user?.id;
  const summary = state && state.userId === userId ? state.data : null;

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await progressApi.summary();
      setState({ userId, data });
    } catch {
      // Keep the last known summary; the shell simply shows no streak
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    progressApi
      .summary()
      .then((data) => setState({ userId, data }))
      .catch(() => {});
  }, [userId]);

  const celebrate = useCallback(
    (xpEarned: number) => {
      void refresh();
      if (xpEarned > 0) {
        const id = Date.now();
        setLastGain({ xp: xpEarned, id });
        setTimeout(() => setLastGain((current) => (current?.id === id ? null : current)), GAIN_DURATION_MS);
      }
    },
    [refresh]
  );

  const record = useCallback(
    async (input: AttemptInput) => {
      const { xpEarned } = await progressApi.record(input);
      celebrate(xpEarned);
      return xpEarned;
    },
    [celebrate]
  );

  const value = useMemo(() => ({ summary, refresh, record, celebrate, lastGain }), [summary, refresh, record, celebrate, lastGain]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};

/**
 * Returns progress state and the record() action
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useProgress(): ProgressContextValue {
  const value = useContext(ProgressContext);
  if (!value) throw new Error('useProgress must be used inside ProgressProvider');
  return value;
}
