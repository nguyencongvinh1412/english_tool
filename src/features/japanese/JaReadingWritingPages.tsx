/**
 * Japanese reading (furigana, tap a word for its meaning) and writing (AI feedback)
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { JaText } from '@/shared/ja/JaText';
import { contentApi, JLPT_CONTENT_LEVELS, type ContentItem, type JaReading, type JaWriting, type JaWritingFeedback } from '@/shared/contentApi';
import { ContentLibrary } from '@/features/practice/ContentLibrary';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { BandFeedback } from '@/features/practice/BandFeedback';
import { WritingReview } from '@/features/writing/WritingReview';
import '@/features/reading/reading.css';
import '@/features/writing/writing.css';
import { JaDefinitionSheet, JaQuiz } from './JaQuiz';
import { useJaLevel, useJaLookup, useJaRecorder } from './useJaPractice';
import './japanese.css';

/* ---------- Reading ---------- */

const JaReadingSession: React.FC<{ item: ContentItem<JaReading>; onBack: () => void }> = ({ item, onBack }) => {
  const { t } = useI18n();
  const { furigana } = useJaLevel();
  const { lookup, define, close } = useJaLookup();
  const { start, finish } = useJaRecorder(item, 'reading-quiz');

  useEffect(start, [start]);

  return (
    <div className="practice" style={{ ['--skill' as string]: 'var(--reading)', ['--skill-edge' as string]: 'var(--reading-edge)' }}>
      <PracticeHeader title={<JaText text={item.payload.title} defaultMode={furigana} />} level={item.level} onBack={onBack} />

      <div className="reading-layout">
        <Card padding="lg" className="passage">
          <p className="passage__hint">
            <Icon name="sparkles" size={16} /> {t.jaPractice.tapHint}
          </p>
          <div className="passage__body ja-passage">
            {item.payload.paragraphs.map((paragraph, index) => (
              <p key={index}>
                <JaText text={paragraph} defaultMode={furigana} onWordTap={(word) => void define(word, paragraph)} activeWord={lookup?.word} />
              </p>
            ))}
          </div>
        </Card>

        <div className="reading-layout__questions">
          <JaQuiz questions={item.payload.questions} onChecked={finish} />
        </div>
      </div>

      {lookup && <JaDefinitionSheet word={lookup.word} state={lookup.state} onClose={close} />}
    </div>
  );
};

export const JaReadingPage: React.FC = () => {
  const { t } = useI18n();
  const { level } = useJaLevel();
  const [item, setItem] = useState<ContentItem<JaReading> | null>(null);

  if (item) return <JaReadingSession key={item.id} item={item} onBack={() => setItem(null)} />;
  return (
    <ContentLibrary<JaReading>
      kind="ja-reading"
      tone="reading"
      icon="book"
      eyebrow="日本語"
      title={t.skills.activities.jaReading.title}
      description={t.skills.activities.jaReading.description}
      levels={JLPT_CONTENT_LEVELS}
      defaultLevel={level}
      onOpen={setItem}
    />
  );
};

/* ---------- Writing ---------- */

/** Characters typed, ignoring spaces and line breaks (Japanese length is counted in characters) */
const countChars = (text: string) => [...text.replace(/\s/g, '')].length;

const JaWritingSession: React.FC<{ item: ContentItem<JaWriting>; onBack: () => void }> = ({ item, onBack }) => {
  const { t, locale } = useI18n();
  const { furigana } = useJaLevel();
  const { celebrate } = useProgress();
  const task = item.payload;
  const [text, setText] = useState('');
  const [startedAt] = useState(() => Date.now());
  const [result, setResult] = useState<{ feedback: JaWritingFeedback; response: string } | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const chars = countChars(text);

  const submit = async (): Promise<void> => {
    setIsScoring(true);
    setError(null);
    try {
      const scored = await contentApi.scoreWriting<JaWritingFeedback>(item.id, text, Math.round((Date.now() - startedAt) / 1000));
      setResult({ feedback: scored.feedback, response: text });
      celebrate(scored.xpEarned);
    } catch (err) {
      setError(err);
    } finally {
      setIsScoring(false);
    }
  };

  const promptCard = (
    <Card padding="lg" tone="writing" className="w-prompt">
      <p className="w-prompt__meta">
        {t.jaPractice.minChars(task.minChars)} · {t.writing.timeLimit(task.timeMinutes)}
      </p>
      <p className="w-prompt__question">
        <JaText text={task.prompt} defaultMode={furigana} />
      </p>
      <p className="w-prompt__instructions">{task.instructions[locale]}</p>
    </Card>
  );

  if (result) {
    return (
      <div className="practice" style={{ ['--skill' as string]: 'var(--writing)' }}>
        <PracticeHeader title={task.title} level={item.level} onBack={onBack} />
        {promptCard}
        <BandFeedback
          feedback={result.feedback}
          tone="writing"
          note={t.jaPractice.writingNote}
        />
        <Banner tone="info">
          {t.jaPractice.levelEstimate} <Badge tone="writing">{result.feedback.levelEstimate}</Badge>
        </Banner>
        <WritingReview response={result.response} feedback={result.feedback} />
        <div className="practice__actions">
          <Button
            icon="pen"
            onClick={() => {
              setResult(null);
              setText('');
            }}
          >
            {t.writing.writeAgain}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice" style={{ ['--skill' as string]: 'var(--writing)', ['--skill-edge' as string]: 'var(--writing-edge)' }}>
      <PracticeHeader title={task.title} level={item.level} onBack={onBack} />
      <div className="w-layout">
        {promptCard}
        <Card padding="lg" className="w-editor">
          <div className="w-editor__bar">
            <span className={`w-count ${chars >= task.minChars ? 'w-count--ok' : ''}`}>{t.jaPractice.chars(chars, task.minChars)}</span>
          </div>
          <textarea
            className="input w-editor__text"
            lang="ja"
            value={text}
            placeholder={t.jaPractice.writeHere}
            spellCheck={false}
            disabled={isScoring}
            onChange={(event) => setText(event.target.value)}
          />
          {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
          <div className="practice__actions">
            <Button size="lg" icon="sparkles" onClick={submit} loading={isScoring} disabled={chars < 20}>
              {isScoring ? t.writing.scoring : t.writing.submit}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export const JaWritingPage: React.FC = () => {
  const { t } = useI18n();
  const { level } = useJaLevel();
  const [item, setItem] = useState<ContentItem<JaWriting> | null>(null);

  if (item) return <JaWritingSession key={item.id} item={item} onBack={() => setItem(null)} />;
  return (
    <ContentLibrary<JaWriting>
      kind="ja-writing"
      tone="writing"
      icon="pen"
      eyebrow="日本語"
      title={t.skills.activities.jaWriting.title}
      description={t.skills.activities.jaWriting.description}
      levels={JLPT_CONTENT_LEVELS}
      defaultLevel={level}
      bandScores
      onOpen={setItem}
    />
  );
};
