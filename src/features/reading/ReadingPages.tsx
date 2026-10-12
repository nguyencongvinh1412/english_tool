/**
 * Reading pages
 * Comprehension passages with tap-to-define words, and TOEIC Part 5 sentence completion
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useProgress } from '@/shared/progress';
import { contentApi, type ContentItem, type ReadingGapfill, type ReadingPassage, type WordDefinition } from '@/shared/contentApi';
import { ContentLibrary } from '@/features/practice/ContentLibrary';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { QuizRunner } from '@/features/practice/QuizRunner';
import './reading.css';
import { DefinitionSheet } from '@/features/vocab/DefinitionSheet';
import { sentenceWith } from '@/shared/enVocabApi';

/** Strips punctuation around a tapped token, keeping inner apostrophes and hyphens */
function cleanWord(token: string): string {
  return token.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
}

/**
 * Hook that records a finished quiz once per check
 */
function useQuizRecorder(item: ContentItem<unknown>) {
  const { record } = useProgress();
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [item.id]);

  return useCallback(
    (correct: number, total: number) => {
      void record({
        activity: 'reading-quiz',
        contentRef: item.id,
        title: item.title,
        score: correct,
        maxScore: total,
        durationSec: Math.round((Date.now() - startedAt.current) / 1000),
        details: { kind: item.kind, level: item.level },
      }).catch(() => {});
      startedAt.current = Date.now();
    },
    [record, item]
  );
}

/**
 * Passage + questions, with tap-to-define
 */
const PassageSession: React.FC<{ item: ContentItem<ReadingPassage>; onBack: () => void }> = ({ item, onBack }) => {
  const { t } = useI18n();
  const onChecked = useQuizRecorder(item);
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<{ word: string; context: string; state: WordDefinition | 'loading' | { error: unknown } } | null>(null);
  const cache = useRef(new Map<string, WordDefinition>());

  const define = async (token: string, sentence: string): Promise<void> => {
    const word = cleanWord(token);
    if (!word) return;
    const key = word.toLowerCase();
    const context = sentenceWith(sentence, token);
    const cached = cache.current.get(key);
    if (cached) {
      setLookup({ word, context, state: cached });
      return;
    }
    setLookup({ word, context, state: 'loading' });
    try {
      const { definition } = await contentApi.define(word, sentence);
      cache.current.set(key, definition);
      setLookup((current) => (current?.word === word ? { word, context, state: definition } : current));
    } catch (error) {
      setLookup((current) => (current?.word === word ? { word, context, state: { error } } : current));
    }
  };

  return (
    <div className="practice" style={{ ['--skill' as string]: 'var(--reading)', ['--skill-edge' as string]: 'var(--reading-edge)' }}>
      <PracticeHeader title={item.payload.title} level={item.level} onBack={onBack} />

      <div className="reading-layout">
        <Card padding="lg" className="passage">
          <p className="passage__hint">
            <Icon name="sparkles" size={16} /> {t.reading.tapHint}
          </p>
          <div className="passage__body" lang="en">
            {item.payload.paragraphs.map((paragraph, pIndex) => (
              <p key={pIndex}>
                {paragraph.split(/(\s+)/).map((token, wIndex) =>
                  /^\s+$/.test(token) || !cleanWord(token) ? (
                    token
                  ) : (
                    <button key={wIndex} type="button" className="passage__word" onClick={() => void define(token, paragraph)}>
                      {token}
                    </button>
                  )
                )}
              </p>
            ))}
          </div>
        </Card>

        <div className="reading-layout__questions">
          <QuizRunner key={attempt} questions={item.payload.questions} onChecked={onChecked} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      </div>

      {lookup && (
        <DefinitionSheet key={lookup.word} word={lookup.word} state={lookup.state} context={lookup.context} source="reading" onClose={() => setLookup(null)} />
      )}
    </div>
  );
};

/**
 * Sentence completion set
 */
const GapfillSession: React.FC<{ item: ContentItem<ReadingGapfill>; onBack: () => void }> = ({ item, onBack }) => {
  const onChecked = useQuizRecorder(item);
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="practice" style={{ ['--skill' as string]: 'var(--reading)' }}>
      <PracticeHeader title={item.payload.title} level={item.level} onBack={onBack} />
      <div className="practice__narrow">
        <QuizRunner key={attempt} questions={item.payload.questions} onChecked={onChecked} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    </div>
  );
};

export const ReadingPassagePage: React.FC = () => {
  const { t } = useI18n();
  const [item, setItem] = useState<ContentItem<ReadingPassage> | null>(null);

  if (item) return <PassageSession key={item.id} item={item} onBack={() => setItem(null)} />;

  return (
    <ContentLibrary<ReadingPassage>
      kind="reading-passage"
      tone="reading"
      icon="book"
      eyebrow={t.nav.reading}
      title={t.skills.activities.readingPassage.title}
      description={t.skills.activities.readingPassage.description}
      onOpen={setItem}
    />
  );
};

export const GapfillPage: React.FC = () => {
  const { t } = useI18n();
  const [item, setItem] = useState<ContentItem<ReadingGapfill> | null>(null);

  if (item) return <GapfillSession key={item.id} item={item} onBack={() => setItem(null)} />;

  return (
    <ContentLibrary<ReadingGapfill>
      kind="reading-gapfill"
      tone="reading"
      icon="type"
      eyebrow={t.nav.reading}
      title={t.skills.activities.gapfill.title}
      description={t.skills.activities.gapfill.description}
      onOpen={setItem}
    />
  );
};

