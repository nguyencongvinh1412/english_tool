/**
 * ListeningQuizPage
 * Play a two-voice dialogue or a monologue, answer questions, then unlock the transcript
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, Icon, Segmented } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useProgress } from '@/shared/progress';
import { isSpeechSupported, speakScript } from '@/shared/speech';
import type { ContentItem, ListeningQuiz } from '@/shared/contentApi';
import { ContentLibrary } from '@/features/practice/ContentLibrary';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { QuizRunner } from '@/features/practice/QuizRunner';
import './listening-quiz.css';

const SPEEDS = [
  { value: '0.8', label: '0.8×' },
  { value: '1', label: '1×' },
] as const;

const ListeningSession: React.FC<{ item: ContentItem<ListeningQuiz>; onBack: () => void }> = ({ item, onBack }) => {
  const { t } = useI18n();
  const { record } = useProgress();
  const [speed, setSpeed] = useState<'0.8' | '1'>('1');
  const [currentLine, setCurrentLine] = useState(-1);
  const [plays, setPlays] = useState(0);
  const [checked, setChecked] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const startedAt = useRef(0);
  const quiz = item.payload;
  const isPlaying = currentLine >= 0;

  useEffect(() => {
    startedAt.current = Date.now();
    return () => stopRef.current?.();
  }, []);

  const play = useCallback(() => {
    stopRef.current?.();
    setPlays((n) => n + 1);
    stopRef.current = speakScript(
      quiz.script,
      { A: quiz.speakers.A.gender, B: quiz.speakers.B?.gender },
      Number(speed),
      setCurrentLine
    );
  }, [quiz, speed]);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  const onChecked = useCallback(
    (correct: number, total: number) => {
      setChecked(true);
      void record({
        activity: 'listening-quiz',
        contentRef: item.id,
        title: item.title,
        score: correct,
        maxScore: total,
        durationSec: Math.round((Date.now() - startedAt.current) / 1000),
        details: { plays, level: item.level },
      }).catch(() => {});
    },
    [record, item, plays]
  );

  const speakerName = (key: 'A' | 'B') => quiz.speakers[key]?.name ?? key;

  return (
    <div className="practice" style={{ ['--skill' as string]: 'var(--listening)', ['--skill-edge' as string]: 'var(--listening-edge)' }}>
      <PracticeHeader title={quiz.title} level={item.level} onBack={onBack} />

      {!isSpeechSupported() && <Banner tone="danger">{t.dictation.ttsUnsupported}</Banner>}

      <Card padding="lg" className="lq-player">
        <button
          type="button"
          className={`lq-play ${isPlaying ? 'lq-play--on' : ''}`}
          onClick={isPlaying ? stop : play}
          aria-label={isPlaying ? t.listening.stop : t.listening.play}
        >
          <Icon name={isPlaying ? 'x' : 'headphones'} size={34} />
        </button>
        <div className="lq-player__meta">
          <p className="lq-player__title">{isPlaying ? t.listening.stop : t.listening.play}</p>
          <p className="lq-player__sub">
            {quiz.format === 'dialogue' ? `${speakerName('A')} & ${speakerName('B')}` : speakerName('A')} · {t.listening.replays(plays)}
          </p>
          {isPlaying && (
            <div className="lq-wave" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          )}
        </div>
        <Segmented label={t.dictation.speed} value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ ...s, tone: 'listening' }))} />
      </Card>

      <div className="practice__narrow">
        <QuizRunner
          key={attempt}
          questions={quiz.questions}
          onChecked={onChecked}
          onRetry={() => {
            setAttempt((n) => n + 1);
            setChecked(false);
            setShowTranscript(false);
            startedAt.current = Date.now();
          }}
        />

        <Card padding="lg" className="lq-transcript">
          <div className="lq-transcript__head">
            <h2 className="lq-transcript__title">{t.listening.transcript}</h2>
            {checked && (
              <Button size="sm" variant="secondary" onClick={() => setShowTranscript((v) => !v)}>
                {showTranscript ? t.listening.hideTranscript : t.listening.showTranscript}
              </Button>
            )}
          </div>
          {!checked ? (
            <p className="lq-transcript__locked">
              <Icon name="lock" size={16} /> {t.listening.transcriptLocked}
            </p>
          ) : (
            showTranscript && (
              <ol className="lq-lines" lang="en">
                {quiz.script.map((line, index) => (
                  <li key={index} className={`lq-line lq-line--${line.speaker} ${currentLine === index ? 'lq-line--active' : ''}`}>
                    <span className="lq-line__speaker">{speakerName(line.speaker)}</span>
                    <span>{line.text}</span>
                  </li>
                ))}
              </ol>
            )
          )}
        </Card>
      </div>
    </div>
  );
};

export const ListeningQuizPage: React.FC = () => {
  const { t } = useI18n();
  const [item, setItem] = useState<ContentItem<ListeningQuiz> | null>(null);

  if (item) return <ListeningSession key={item.id} item={item} onBack={() => setItem(null)} />;

  return (
    <ContentLibrary<ListeningQuiz>
      kind="listening-quiz"
      tone="listening"
      icon="headphones"
      eyebrow={t.nav.listening}
      title={t.skills.activities.listeningQuiz.title}
      description={t.skills.activities.listeningQuiz.description}
      defaultLevel="A2"
      onOpen={setItem}
    />
  );
};
