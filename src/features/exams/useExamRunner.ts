/**
 * useExamRunner
 * Shared test-taking state for TOEIC and IELTS: answers and flags with debounced autosave,
 * the countdown clock with auto-submit at the deadline, and submit
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProgress } from '@/shared/progress';
import { apiFetch } from '@/shared/http';
import { getSelectedModel } from '@/services/api';

/** Wait after the last change before autosaving (ms) */
const SAVE_DEBOUNCE_MS = 800;
const SAVE_RETRY_MS = 4000;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type AnswerValue = number | string;

interface RunnableSession<A extends AnswerValue> {
  id: string;
  deadline: string;
  answers: Record<string, A>;
  flags: string[];
}

export function useExamRunner<A extends AnswerValue, S>(session: RunnableSession<A>, onSubmitted: (session: S) => void) {
  const { celebrate } = useProgress();
  const [answers, setAnswers] = useState<Record<string, A>>(session.answers);
  const [flags, setFlags] = useState<string[]>(session.flags);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [now, setNow] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<{ answers: Record<string, A | null>; flags?: string[] }>({ answers: {} });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deadline = Date.parse(session.deadline);
  const secondsLeft = Math.max(0, Math.round((deadline - now) / 1000));

  const flush = useCallback(async () => {
    const batch = pending.current;
    if (Object.keys(batch.answers).length === 0 && !batch.flags) return;
    pending.current = { answers: {} };
    setSaveState('saving');
    try {
      await apiFetch(`/api/exams/sessions/${session.id}`, { method: 'PATCH', json: { answers: batch.answers, flags: batch.flags } });
      setSaveState('saved');
    } catch {
      // Put the batch back (newer edits win); the retry effect below tries again
      pending.current = { answers: { ...batch.answers, ...pending.current.answers }, flags: pending.current.flags ?? batch.flags };
      setSaveState('error');
    }
  }, [session.id]);

  // Retry a failed save after a pause
  useEffect(() => {
    if (saveState !== 'error') return;
    const id = setTimeout(() => void flush(), SAVE_RETRY_MS);
    return () => clearTimeout(id);
  }, [saveState, flush]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }, [flush]);

  const submit = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await flush();
      const result = await apiFetch<{ session: S; xpEarned: number }>(`/api/exams/sessions/${session.id}/submit`, {
        method: 'POST',
        // IELTS writing and speaking are graded with the learner's chosen model
        json: { model: getSelectedModel() ?? undefined },
      });
      celebrate(result.xpEarned);
      onSubmitted(result.session);
    } catch (err) {
      setError(err);
      setIsSubmitting(false);
    }
  }, [flush, session.id, celebrate, onSubmitted]);

  // Latest submit for the clock callback
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  // Clock, and auto-submit once at the deadline
  const autoSubmitted = useRef(false);
  useEffect(() => {
    const id = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= deadline && !autoSubmitted.current) {
        autoSubmitted.current = true;
        void submitRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  // Save before the tab closes
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void flush();
    };
  }, [flush]);

  /** Sets one answer; an empty text answer is removed */
  const answer = useCallback(
    (questionId: string, value: A) => {
      const cleared = typeof value === 'string' && value.trim() === '';
      setAnswers((prev) => {
        const next = { ...prev };
        if (cleared) delete next[questionId];
        else next[questionId] = value;
        return next;
      });
      pending.current.answers[questionId] = cleared ? null : value;
      scheduleSave();
    },
    [scheduleSave]
  );

  const toggleFlag = useCallback(
    (questionId: string) => {
      setFlags((prev) => {
        const next = prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId];
        pending.current.flags = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave]
  );

  return { answers, flags, answer, toggleFlag, saveState, secondsLeft, submit, isSubmitting, error };
}

/**
 * "1:05:09" or "4:09"
 */
export const formatClock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
};
