/**
 * Shared hooks for Japanese practice pages
 */
import { useCallback, useRef, useState } from 'react';
import { useCurrentUser } from '@/app/AuthProvider';
import { useProgress } from '@/shared/progress';
import { contentApi, type ContentItem, type JlptLevel } from '@/shared/contentApi';
import type { Activity } from '@/shared/progressApi';
import type { FuriganaMode } from '@/shared/ja/furigana';
import { plainText } from '@/shared/ja/text';
import type { LookupState } from './JaQuiz';

/**
 * The learner's JLPT goal (N5 when unset) and the furigana default for it:
 * beginners always see readings, N3 and above reveal them on tap
 */
export function useJaLevel(): { level: JlptLevel; furigana: FuriganaMode } {
  const { jaTargetLevel } = useCurrentUser();
  const level = jaTargetLevel ?? 'N5';
  return { level, furigana: level === 'N5' || level === 'N4' ? 'always' : 'tap' };
}

/**
 * Records a finished Japanese exercise (XP and progress)
 */
export function useJaRecorder(item: ContentItem<unknown> | null, activity: Activity) {
  const { record } = useProgress();
  const startedAt = useRef(0);

  const start = useCallback(() => {
    startedAt.current = Date.now();
  }, []);

  const finish = useCallback(
    (score: number, maxScore: number) => {
      if (!item) return;
      void record({
        activity,
        language: 'ja',
        contentRef: item.id,
        title: plainText(item.title),
        score,
        maxScore,
        durationSec: startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : undefined,
        details: { kind: item.kind, level: item.level },
      }).catch(() => {});
      startedAt.current = Date.now();
    },
    [record, item, activity]
  );

  return { start, finish };
}

/**
 * Tap-to-define with a per-page cache
 */
export function useJaLookup() {
  const [lookup, setLookup] = useState<{ word: string; state: LookupState } | null>(null);
  const cache = useRef(new Map<string, LookupState>());

  const define = useCallback(async (word: string, sentence: string): Promise<void> => {
    const cached = cache.current.get(word);
    if (cached) {
      setLookup({ word, state: cached });
      return;
    }
    setLookup({ word, state: 'loading' });
    try {
      const { definition } = await contentApi.defineJapanese(word, plainText(sentence));
      cache.current.set(word, definition);
      setLookup((current) => (current?.word === word ? { word, state: definition } : current));
    } catch (error) {
      setLookup((current) => (current?.word === word ? { word, state: { error } } : current));
    }
  }, []);

  return { lookup, define, close: () => setLookup(null) };
}
