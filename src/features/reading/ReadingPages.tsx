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
import { QuizSession, type RoundProps } from '@/features/practice/QuizSession';
import { quizEntries } from '@/features/practice/session';
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
const PassageRound: React.FC<RoundProps<ReadingPassage>> = ({ item, onBack, onChecked: reportChecked, actions, reviewAnswers }) => {
  const { t } = useI18n();
  const record = useQuizRecorder(item);
  const [collapsed, setCollapsed] = useState(false);
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
          <div className="passage__top">
            <p className="passage__hint">
              <Icon name="sparkles" size={16} /> {t.reading.tapHint}
            </p>
            <button type="button" className="passage__toggle" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? t.reading.expand : t.reading.collapse}
            </button>
          </div>
          <div className="passage__body" lang="en" hidden={collapsed}>
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
          <QuizRunner
            questions={item.payload.questions}
            actions={actions}
            reviewAnswers={reviewAnswers}
            onChecked={(correct, total, answers) => {
              record(correct, total);
              reportChecked(correct, total, answers);
            }}
          />
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
const GapfillRound: React.FC<RoundProps<ReadingGapfill>> = ({ item, onBack, onChecked: reportChecked, actions, reviewAnswers }) => {
  const record = useQuizRecorder(item);

  return (
    <div className="practice" style={{ ['--skill' as string]: 'var(--reading)' }}>
      <PracticeHeader title={item.payload.title} level={item.level} onBack={onBack} />
      <div className="practice__narrow">
        <QuizRunner
          questions={item.payload.questions}
          actions={actions}
          reviewAnswers={reviewAnswers}
          onChecked={(correct, total, answers) => {
            record(correct, total);
            reportChecked(correct, total, answers);
          }}
        />
      </div>
    </div>
  );
};

export const ReadingPassagePage: React.FC = () => {
  const { t } = useI18n();
  const [item, setItem] = useState<ContentItem<ReadingPassage> | null>(null);

  if (item) {
    return (
      <QuizSession<ReadingPassage>
        key={item.id}
        first={item}
        tone="reading"
        entriesOf={(passage, answers, { label }) => quizEntries(passage.questions, answers, label)}
        Round={PassageRound}
        onBack={() => setItem(null)}
      />
    );
  }

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

  if (item) {
    return (
      <QuizSession<ReadingGapfill>
        key={item.id}
        first={item}
        tone="reading"
        entriesOf={(set, answers, { label }) => quizEntries(set.questions, answers, label)}
        Round={GapfillRound}
        onBack={() => setItem(null)}
      />
    );
  }

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

