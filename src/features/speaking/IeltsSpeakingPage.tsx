/**
 * IeltsSpeakingPage
 * IELTS-style speaking test: Part 1 questions, Part 2 cue card with prep/speak timers,
 * Part 3 discussion; transcripts are band-scored by the server
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, ProgressBar, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useSpeechRecognition } from '@/hooks';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { speakOnce } from '@/shared/speech';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { contentApi, type ContentItem, type SpeakingFeedback, type SpeakingIelts } from '@/shared/contentApi';
import { ContentLibrary } from '@/features/practice/ContentLibrary';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { BandFeedback } from '@/features/practice/BandFeedback';
import { RecordButton } from './RecordButton';
import './speaking.css';

const PREP_SECONDS = 60;
const LONG_TURN_SECONDS = 120;

type Step = { part: 1 | 3; index: number } | { part: 2; phase: 'prep' | 'speak' } | 'intro' | 'scoring' | 'result';

interface Question {
  key: string;
  part: 1 | 2 | 3;
  text: string;
}

/**
 * Counts down while running; calls onDone at zero
 */
function useCountdown(seconds: number, running: boolean, onDone: () => void): number {
  const [left, setLeft] = useState(seconds);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(id);
        doneRef.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [seconds, running]);

  return running ? left : seconds;
}

const formatClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

const SpeakingSession: React.FC<{ item: ContentItem<SpeakingIelts>; onBack: () => void }> = ({ item, onBack }) => {
  const { t } = useI18n();
  const { celebrate } = useProgress();
  const set = item.payload;
  const [step, setStep] = useState<Step>('intro');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [error, setError] = useState<unknown>(null);
  const startedAt = useRef(0);
  const { isListening, transcript, interimTranscript, isSupported, error: speechError, startListening, stopListening, resetTranscript } =
    useSpeechRecognition();

  const cueCardText = `${set.part2.cueCard} You should say: ${set.part2.bullets.join('; ')}; ${set.part2.closing}`;
  const questions: Question[] = [
    ...set.part1.map((text, i) => ({ key: `p1-${i}`, part: 1 as const, text })),
    { key: 'p2', part: 2 as const, text: cueCardText },
    ...set.part3.map((text, i) => ({ key: `p3-${i}`, part: 3 as const, text })),
  ];

  const current: Question | null =
    typeof step === 'object'
      ? step.part === 2
        ? questions.find((q) => q.key === 'p2')!
        : questions.find((q) => q.key === `p${step.part}-${step.index}`)!
      : null;

  // Append each finished recording to the current answer
  useEffect(() => {
    if (!isListening && transcript && current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- result of the external speech API
      setAnswers((prev) => ({ ...prev, [current.key]: `${prev[current.key] ? `${prev[current.key]} ` : ''}${transcript}`.trim() }));
      resetTranscript();
    }
  }, [isListening, transcript, current, resetTranscript]);

  const goTo = useCallback(
    (next: Step) => {
      if (isListening) stopListening();
      setStep(next);
    },
    [isListening, stopListening]
  );

  const advance = useCallback(() => {
    if (typeof step !== 'object') return;
    if (step.part === 1) {
      goTo(step.index + 1 < set.part1.length ? { part: 1, index: step.index + 1 } : { part: 2, phase: 'prep' });
    } else if (step.part === 2) {
      goTo({ part: 3, index: 0 });
    } else if (step.index + 1 < set.part3.length) {
      goTo({ part: 3, index: step.index + 1 });
    }
  }, [step, set, goTo]);

  const prepLeft = useCountdown(PREP_SECONDS, typeof step === 'object' && step.part === 2 && step.phase === 'prep', () =>
    setStep({ part: 2, phase: 'speak' })
  );
  const speakLeft = useCountdown(LONG_TURN_SECONDS, typeof step === 'object' && step.part === 2 && step.phase === 'speak', () => {
    if (isListening) stopListening();
  });

  // Read each new question aloud (not the cue card)
  useEffect(() => {
    if (current && current.part !== 2) speakOnce(current.text);
  }, [current?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async (): Promise<void> => {
    if (isListening) stopListening();
    setStep('scoring');
    setError(null);
    try {
      const result = await contentApi.scoreSpeaking(
        item.id,
        questions.map((q) => ({ question: q.text, transcript: answers[q.key] ?? '' })),
        Math.round((Date.now() - startedAt.current) / 1000)
      );
      setFeedback(result.feedback);
      setStep('result');
      celebrate(result.xpEarned);
    } catch (err) {
      setError(err);
      setStep({ part: 3, index: set.part3.length - 1 });
    }
  };

  const header = <PracticeHeader title={set.topic} level={item.level} onBack={onBack} extra={<Badge tone="exam">IELTS</Badge>} />;

  if (step === 'intro') {
    return (
      <div className="practice speak">
        {header}
        <Card padding="lg" tone="speaking" className="ielts-intro">
          <p>{t.ieltsSpeaking.intro}</p>
          <ul className="ielts-intro__parts">
            <li>{t.ieltsSpeaking.part1}</li>
            <li>{t.ieltsSpeaking.part2}</li>
            <li>{t.ieltsSpeaking.part3}</li>
          </ul>
          {!isSupported && <Banner tone="warning">{t.chat.voiceUnsupported}</Banner>}
          <Button
            size="lg"
            icon="mic"
            onClick={() => {
              startedAt.current = Date.now();
              setStep({ part: 1, index: 0 });
            }}
          >
            {t.ieltsSpeaking.start}
          </Button>
        </Card>
      </div>
    );
  }

  if (step === 'scoring') {
    return (
      <div className="practice speak">
        {header}
        <Card padding="lg" className="ielts-scoring">
          <Spinner size={36} label={t.ieltsSpeaking.scoring} />
          <p>{t.ieltsSpeaking.scoring}</p>
        </Card>
      </div>
    );
  }

  if (step === 'result' && feedback) {
    return (
      <div className="practice speak">
        {header}
        <BandFeedback feedback={feedback} tone="speaking" note={t.ieltsSpeaking.estimateNote} />
        <div className="ielts-answers">
          {feedback.answers.map((answer, index) => (
            <Card key={index} padding="md" className="ielts-answer">
              <p className="ielts-answer__q" lang="en">
                {answer.question}
              </p>
              <p className="ielts-answer__mine" lang="en">
                <strong>{t.ieltsSpeaking.yourAnswer}:</strong> {answers[questions[index]?.key] || '—'}
              </p>
              <p className="ielts-answer__comment">
                <InlineMarkdown text={answer.comment} />
              </p>
              <p className="ielts-answer__better" lang="en">
                <strong>{t.ieltsSpeaking.betterAnswer}:</strong> {answer.betterAnswer}
              </p>
            </Card>
          ))}
        </div>
        <Button variant="secondary" onClick={onBack} icon="arrowLeft">
          {t.library.back}
        </Button>
      </div>
    );
  }

  if (!current || typeof step !== 'object') return null;

  const partLabel = step.part === 1 ? t.ieltsSpeaking.part1 : step.part === 2 ? t.ieltsSpeaking.part2 : t.ieltsSpeaking.part3;
  const position = questions.findIndex((q) => q.key === current.key);
  const isLast = step.part === 3 && step.index === set.part3.length - 1;
  const inPrep = step.part === 2 && step.phase === 'prep';

  return (
    <div className="practice speak">
      {header}
      <div className="ielts-progress">
        <ProgressBar value={(position / questions.length) * 100} tone="speaking" label={partLabel} />
        <span className="ielts-progress__label">{partLabel}</span>
      </div>

      {step.part === 2 ? (
        <Card padding="lg" tone="speaking" className="cue-card">
          <p className="cue-card__title" lang="en">
            {set.part2.cueCard}
          </p>
          <p className="cue-card__say">You should say:</p>
          <ul className="cue-card__bullets" lang="en">
            {set.part2.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <p lang="en">{set.part2.closing}</p>
          <div className={`cue-timer ${inPrep ? '' : 'cue-timer--speak'}`}>
            <Icon name={inPrep ? 'pen' : 'mic'} size={20} />
            <span>{inPrep ? t.ieltsSpeaking.prepare : t.ieltsSpeaking.speakTime}</span>
            <strong>{formatClock(inPrep ? prepLeft : speakLeft)}</strong>
          </div>
          {inPrep && (
            <>
              <p className="cue-card__hint">{t.ieltsSpeaking.prepareHint}</p>
              <Button icon="mic" onClick={() => setStep({ part: 2, phase: 'speak' })}>
                {t.ieltsSpeaking.startSpeaking}
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card padding="lg" tone="speaking" className="ielts-question">
          <p className="ielts-question__text" lang="en">
            {current.text}
          </p>
          <Button size="sm" variant="secondary" icon="headphones" onClick={() => speakOnce(current.text)}>
            {t.ieltsSpeaking.listenQuestion}
          </Button>
        </Card>
      )}

      {!inPrep && (
        <Card padding="lg" className="ielts-answer-box">
          {isSupported && (
            <div className="ielts-answer-box__rec">
              <RecordButton
                size="md"
                isRecording={isListening}
                onStart={startListening}
                onStop={stopListening}
                startLabel={t.chat.speak}
                stopLabel={t.chat.stop}
              />
              {isListening && (transcript || interimTranscript) && (
                <p className="speak-live" lang="en">
                  {transcript}
                  <span className="speak-live__interim"> {interimTranscript}</span>
                </p>
              )}
            </div>
          )}
          <label className="field">
            <span className="field__label">{t.ieltsSpeaking.yourAnswer}</span>
            <textarea
              className="input ielts-answer-box__text"
              rows={4}
              lang="en"
              value={answers[current.key] ?? ''}
              onChange={(event) => setAnswers((prev) => ({ ...prev, [current.key]: event.target.value }))}
              placeholder={t.ieltsSpeaking.typeInstead}
            />
          </label>
          {speechError && <Banner tone="warning">{speechError}</Banner>}
        </Card>
      )}

      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      {!inPrep && (
        <div className="practice__actions">
          {isLast ? (
            <Button size="lg" icon="sparkles" onClick={finish} disabled={isListening}>
              {t.ieltsSpeaking.finish}
            </Button>
          ) : (
            <Button icon="chevronRight" onClick={advance} disabled={isListening}>
              {step.part === 1 && step.index === set.part1.length - 1 ? t.ieltsSpeaking.nextPart : step.part === 2 ? t.ieltsSpeaking.nextPart : t.ieltsSpeaking.next}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export const IeltsSpeakingPage: React.FC = () => {
  const { t } = useI18n();
  const [item, setItem] = useState<ContentItem<SpeakingIelts> | null>(null);

  if (item) return <SpeakingSession key={item.id} item={item} onBack={() => setItem(null)} />;

  return (
    <ContentLibrary<SpeakingIelts>
      kind="speaking-ielts"
      tone="speaking"
      icon="mic"
      eyebrow={t.nav.speaking}
      title={t.skills.activities.ieltsSpeaking.title}
      description={t.skills.activities.ieltsSpeaking.description}
      defaultLevel="B2"
      bandScores
      onOpen={setItem}
    />
  );
};
