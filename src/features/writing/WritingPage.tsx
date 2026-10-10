/**
 * WritingPage
 * Email, IELTS Task 1 (chart) and Task 2 (essay) with a timed editor and AI band feedback
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Banner, Button, Card, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { contentApi, type ContentItem, type WritingFeedback, type WritingPrompt, type WritingTask } from '@/shared/contentApi';
import { ContentLibrary } from '@/features/practice/ContentLibrary';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { BandFeedback } from '@/features/practice/BandFeedback';
import { WritingPromptCard, WritingReview } from './WritingReview';
import './writing.css';

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const formatClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** Draft autosave per exercise, so a refresh does not lose the essay */
const draftKey = (id: string) => `english-tool:writing-draft:${id}`;

function readDraft(id: string): string {
  try {
    return localStorage.getItem(draftKey(id)) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(id: string, text: string): void {
  try {
    if (text) localStorage.setItem(draftKey(id), text);
    else localStorage.removeItem(draftKey(id));
  } catch {
    // Storage unavailable; the draft only lives in memory
  }
}

const WritingSession: React.FC<{ item: ContentItem<WritingPrompt>; onBack: () => void }> = ({ item, onBack }) => {
  const { t } = useI18n();
  const { celebrate } = useProgress();
  const task = item.payload;
  const [text, setText] = useState(() => readDraft(item.id));
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<{ feedback: WritingFeedback; response: string } | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [startedAt, setStartedAt] = useState(0);

  useEffect(() => {
    const start = Date.now();
    setStartedAt(start);
    setNow(start);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => writeDraft(item.id, text), [item.id, text]);

  const words = countWords(text);
  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const left = Math.max(0, task.timeMinutes * 60 - elapsed);
  const enough = words >= Math.round(task.minWords * 0.5);

  const submit = async (): Promise<void> => {
    setIsScoring(true);
    setError(null);
    try {
      const scored = await contentApi.scoreWriting(item.id, text, elapsed);
      setResult({ feedback: scored.feedback, response: text });
      writeDraft(item.id, '');
      celebrate(scored.xpEarned);
    } catch (err) {
      setError(err);
    } finally {
      setIsScoring(false);
    }
  };

  const promptCard = <WritingPromptCard task={task} />;

  if (result) {
    return (
      <div className="practice" style={{ ['--skill' as string]: 'var(--writing)' }}>
        <PracticeHeader title={task.title} level={item.level} onBack={onBack} />
        <BandFeedback feedback={result.feedback} tone="writing" note={t.writing.estimateNote} />

        <WritingReview response={result.response} feedback={result.feedback} />

        <div className="practice__actions">
          <Button
            icon="pen"
            onClick={() => {
              setResult(null);
              setText('');
              setStartedAt(Date.now());
            }}
          >
            {t.writing.writeAgain}
          </Button>
          <Button variant="secondary" icon="arrowLeft" onClick={onBack}>
            {t.library.back}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice" style={{ ['--skill' as string]: 'var(--writing)' }}>
      <PracticeHeader title={task.title} level={item.level} onBack={onBack} />
      <div className="w-layout">
        {promptCard}
        <Card padding="lg" className="w-editor">
          <div className="w-editor__bar">
            <span className={`w-count ${words >= task.minWords ? 'w-count--ok' : ''}`}>{t.writing.words(words)}</span>
            <span className={`w-clock ${left === 0 ? 'w-clock--over' : ''}`}>
              <Icon name="target" size={16} /> {t.writing.timeLeft} {formatClock(left)}
            </span>
          </div>
          <textarea
            className="input w-editor__text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t.writing.placeholder}
            lang="en"
            spellCheck={false}
            disabled={isScoring}
          />
          {left === 0 && <Banner tone="warning">{t.writing.timeUp}</Banner>}
          {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
          <div className="practice__actions">
            <Button size="lg" icon="sparkles" onClick={submit} loading={isScoring} disabled={!enough}>
              {isScoring ? t.writing.scoring : t.writing.submit}
            </Button>
            {!enough && <span className="quiz__hint">{t.writing.tooShort(Math.round(task.minWords * 0.5))}</span>}
          </div>
        </Card>
      </div>
    </div>
  );
};

const TASK_COPY: Record<WritingTask, 'writingEmail' | 'writingTask1' | 'writingTask2'> = {
  email: 'writingEmail',
  'ielts-task1': 'writingTask1',
  'ielts-task2': 'writingTask2',
};

export const WritingPage: React.FC<{ task: WritingTask }> = ({ task }) => {
  const { t } = useI18n();
  const [item, setItem] = useState<ContentItem<WritingPrompt> | null>(null);

  if (item) return <WritingSession key={item.id} item={item} onBack={() => setItem(null)} />;

  const copy = t.skills.activities[TASK_COPY[task]];
  return (
    <ContentLibrary<WritingPrompt>
      key={task}
      kind="writing-prompt"
      writingTask={task}
      tone="writing"
      icon="pen"
      eyebrow={t.nav.writing}
      title={copy.title}
      description={copy.description}
      defaultLevel={task === 'email' ? 'B1' : 'B2'}
      bandScores
      onOpen={setItem}
    />
  );
};
