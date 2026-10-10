/**
 * useSessionRecorder
 * Records a chat practice session once the learner has sent enough messages
 */
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types/api';
import { useProgress, type Activity } from '@/shared/progress';

/** Learner messages that count as a real practice session */
export const SESSION_MIN_TURNS = 3;

/**
 * @param messages - Current conversation
 * @param session - What to record; a new key starts a new session
 */
export function useSessionRecorder(
  messages: ChatMessage[],
  session: { key: string; activity: Activity; contentRef: string; title: string }
): void {
  const { record } = useProgress();
  const recordedKey = useRef<string | null>(null);
  const startedAt = useRef(0);

  // A new session (topic/scenario change or reset) restarts the clock
  useEffect(() => {
    startedAt.current = Date.now();
  }, [session.key]);

  const turns = messages.filter((m) => m.role === 'user').length;

  useEffect(() => {
    if (turns < SESSION_MIN_TURNS || recordedKey.current === session.key) return;
    recordedKey.current = session.key;

    void record({
      activity: session.activity,
      contentRef: session.contentRef,
      title: session.title,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
      details: { turns },
    }).catch(() => {
      recordedKey.current = null;
    });
  }, [turns, session, record]);
}
