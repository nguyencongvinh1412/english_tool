/**
 * DictationPractice
 * DailyDictation-style loop: listen, type, check word by word, hint or reveal, move on.
 * Records the finished lesson as an attempt for XP and history.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, ProgressBar } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useTextToSpeech } from '@/hooks';
import { useProgress } from '@/shared/progress';
import type { DictationLesson } from '@/constants/dictations';
import { checkDictation, maskWord, revealNextWord, type DictationCheckResult } from '@/utils/dictation';

/** Playback speed options */
const SPEEDS = [
  { label: '0.6×', rate: 0.6 },
  { label: '0.8×', rate: 0.8 },
  { label: '1×', rate: 1 },
] as const;

const DEFAULT_SPEED_INDEX = 1;

/** Delay before auto-playing a new sentence (ms) */
const AUTO_PLAY_DELAY_MS = 300;

/** Per-sentence outcome used for the final score */
interface SentenceOutcome {
  hints: number;
  revealed: boolean;
}

interface DictationPracticeProps {
  lesson: DictationLesson;
  /** AI-generated lessons have no stable id worth tracking per lesson */
  isGenerated: boolean;
  onExit: () => void;
  onCompleted: () => void;
}

export const DictationPractice: React.FC<DictationPracticeProps> = ({ lesson, isGenerated, onExit, onCompleted }) => {
  const { t } = useI18n();
  const { record } = useProgress();
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<DictationCheckResult | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
  const [outcomes, setOutcomes] = useState<SentenceOutcome[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const startedAtRef = useRef(Date.now());

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { speak, stop, isSpeaking, isSupported } = useTextToSpeech();

  const sentence = lesson.sentences[sentenceIndex];
  const totalSentences = lesson.sentences.length;
  const isSentenceDone = isRevealed || Boolean(result?.isComplete);
  const isLast = sentenceIndex + 1 >= totalSentences;

  const playSentence = useCallback(() => {
    speak(sentence, SPEEDS[speedIndex].rate);
    inputRef.current?.focus();
  }, [speak, sentence, speedIndex]);

  // Auto-play each new sentence (not when only the speed changes)
  useEffect(() => {
    if (isFinished) return;
    const timeoutId = setTimeout(playSentence, AUTO_PLAY_DELAY_MS);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentenceIndex, isFinished]);

  // Ctrl pressed and released on its own replays the sentence
  useEffect(() => {
    let isCtrlAlone = false;
    const handleKeyDown = (event: KeyboardEvent): void => {
      isCtrlAlone = event.key === 'Control';
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key === 'Control' && isCtrlAlone && !isFinished) playSentence();
      isCtrlAlone = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [playSentence, isFinished]);

  // Stop speech when leaving
  useEffect(() => stop, [stop]);

  const handleCheck = useCallback(() => {
    if (!input.trim()) return;
    setResult(checkDictation(sentence, input));
  }, [input, sentence]);

  const handleHint = useCallback(() => {
    const nextInput = revealNextWord(sentence, input);
    setInput(nextInput);
    setResult(checkDictation(sentence, nextInput));
    setHintsUsed((count) => count + 1);
    inputRef.current?.focus();
  }, [sentence, input]);

  const handleReveal = useCallback(() => {
    setIsRevealed(true);
    setResult(checkDictation(sentence, sentence));
  }, [sentence]);

  const handleNext = useCallback(() => {
    const nextOutcomes = [...outcomes, { hints: hintsUsed, revealed: isRevealed }];
    setOutcomes(nextOutcomes);

    if (isLast) {
      const perfect = nextOutcomes.filter((o) => !o.revealed && o.hints === 0).length;
      setIsFinished(true);
      stop();
      void record({
        activity: 'dictation',
        contentRef: isGenerated ? undefined : lesson.id,
        title: lesson.title,
        score: perfect,
        maxScore: totalSentences,
        durationSec: Math.round((Date.now() - startedAtRef.current) / 1000),
        details: {
          level: lesson.difficulty,
          hints: nextOutcomes.reduce((sum, o) => sum + o.hints, 0),
          revealed: nextOutcomes.filter((o) => o.revealed).length,
          generated: isGenerated,
        },
      })
        .then(onCompleted)
        .catch(() => {});
      return;
    }

    setSentenceIndex((index) => index + 1);
    setInput('');
    setResult(null);
    setIsRevealed(false);
    setHintsUsed(0);
  }, [outcomes, hintsUsed, isRevealed, isLast, stop, record, isGenerated, lesson, totalSentences, onCompleted]);

  const handleRestart = useCallback(() => {
    setSentenceIndex(0);
    setInput('');
    setResult(null);
    setIsRevealed(false);
    setHintsUsed(0);
    setOutcomes([]);
    setIsFinished(false);
    startedAtRef.current = Date.now();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (isSentenceDone) handleNext();
    else handleCheck();
  };

  if (!isSupported) {
    return <Banner tone="danger">{t.dictation.ttsUnsupported}</Banner>;
  }

  const header = (
    <div className="dict-head">
      <Button variant="ghost" icon="arrowLeft" onClick={onExit}>
        {t.dictation.lessons}
      </Button>
      <h2 className="dict-head__title">{lesson.title}</h2>
      <Badge tone={lesson.difficulty === 'easy' ? 'success' : lesson.difficulty === 'medium' ? 'warning' : 'danger'}>
        {t.dictation.levels[lesson.difficulty]}
      </Badge>
    </div>
  );

  if (isFinished) {
    const perfect = outcomes.filter((o) => !o.revealed && o.hints === 0).length;
    const percent = Math.round((perfect / totalSentences) * 100);

    return (
      <div className="dict">
        {header}
        <Card padding="lg" tone="listening" className="dict-summary reveal">
          <div className="dict-summary__score" style={{ ['--pct' as string]: percent }}>
            <span>{percent}%</span>
          </div>
          <h3 className="dict-summary__title">{t.dictation.completeTitle}</h3>
          <ul className="dict-summary__stats">
            <li>{t.dictation.perfect(perfect, totalSentences)}</li>
            <li>{t.dictation.hintsUsed(outcomes.reduce((sum, o) => sum + o.hints, 0))}</li>
            <li>{t.dictation.revealedCount(outcomes.filter((o) => o.revealed).length)}</li>
          </ul>
          <details className="dict-summary__transcript">
            <summary>{t.dictation.transcript}</summary>
            {lesson.sentences.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </details>
          <div className="dict-actions">
            <Button icon="sparkles" onClick={handleRestart}>
              {t.dictation.practiceAgain}
            </Button>
            <Button variant="secondary" onClick={onExit}>
              {t.dictation.backToLessons}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="dict">
      {header}

      <div className="dict-progress">
        <ProgressBar value={(sentenceIndex / totalSentences) * 100} tone="listening" label={t.dictation.sentenceOf(sentenceIndex + 1, totalSentences)} />
        <span className="dict-progress__label">{t.dictation.sentenceOf(sentenceIndex + 1, totalSentences)}</span>
      </div>

      <Card padding="lg" className="dict-card">
        <div className="dict-player">
          <button
            type="button"
            className={`dict-play ${isSpeaking ? 'dict-play--playing' : ''}`}
            onClick={playSentence}
            aria-label={t.dictation.play}
          >
            <Icon name="headphones" size={34} />
          </button>
          <div className="dict-speed" role="group" aria-label={t.dictation.speed}>
            {SPEEDS.map((speed, index) => (
              <button
                key={speed.label}
                type="button"
                aria-pressed={speedIndex === index}
                className={`dict-speed__btn ${speedIndex === index ? 'dict-speed__btn--active' : ''}`}
                onClick={() => setSpeedIndex(index)}
              >
                {speed.label}
              </button>
            ))}
          </div>
        </div>

        {result && (
          <p className="dict-answer" aria-live="polite">
            {result.words.map((word, index) => (
              <span key={index} className={`dict-word dict-word--${word.status}`}>
                {word.status === 'correct' ? word.text : maskWord(word.text)}
              </span>
            ))}
          </p>
        )}

        <textarea
          ref={inputRef}
          className="input dict-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.dictation.typePlaceholder}
          rows={3}
          readOnly={isSentenceDone}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          lang="en"
        />

        {isSentenceDone &&
          (isRevealed ? (
            <Banner tone="info">{t.dictation.revealed}</Banner>
          ) : (
            <Banner tone="success">{t.dictation.correct}</Banner>
          ))}

        <div className="dict-actions">
          {isSentenceDone ? (
            <Button icon={isLast ? 'check' : 'chevronRight'} onClick={handleNext}>
              {isLast ? t.dictation.finish : t.dictation.next}
            </Button>
          ) : (
            <>
              <Button icon="check" onClick={handleCheck} disabled={!input.trim()}>
                {t.dictation.check}
              </Button>
              <Button variant="secondary" icon="sparkles" onClick={handleHint}>
                {t.dictation.hint}
              </Button>
              <Button variant="ghost" onClick={handleReveal}>
                {t.dictation.showAnswer}
              </Button>
            </>
          )}
        </div>

        <p className="dict-shortcuts">
          <kbd>Ctrl</kbd> {t.dictation.shortcutReplay} · <kbd>Enter</kbd>{' '}
          {isSentenceDone ? t.dictation.shortcutNext : t.dictation.shortcutCheck}
        </p>
      </Card>
    </div>
  );
};
