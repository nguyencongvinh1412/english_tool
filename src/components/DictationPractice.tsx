/**
 * DictationPractice Component
 * Plays a lesson sentence by sentence and checks what the user types,
 * DailyDictation style: listen, type, check, reveal hints, move on
 */

import type React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useTextToSpeech } from '@/hooks';
import type { DictationLesson } from '@/constants/dictations';
import {
  checkDictation,
  revealNextWord,
  maskWord,
  type DictationCheckResult,
} from '@/utils/dictation';

/** Playback speed options */
const SPEEDS = [
  { label: '0.6x', rate: 0.6 },
  { label: '0.8x', rate: 0.8 },
  { label: '1x', rate: 1 },
] as const;

/** Default playback speed index */
const DEFAULT_SPEED_INDEX = 1;

/** Delay before auto-playing a new sentence (ms) */
const AUTO_PLAY_DELAY_MS = 300;

/** Per-sentence outcome used for the final score */
interface SentenceOutcome {
  /** Number of hint words revealed */
  hints: number;
  /** Whether the full answer was revealed */
  revealed: boolean;
}

/** Props for DictationPractice */
interface DictationPracticeProps {
  /** Lesson to practice */
  lesson: DictationLesson;
  /** Called when the lesson is finished, with the score percentage */
  onComplete: (lessonId: string, score: number) => void;
  /** Called when the user leaves the lesson */
  onExit: () => void;
}

/**
 * Dictation practice for a single lesson
 *
 * @param props - Component props
 * @returns DictationPractice JSX element
 */
export const DictationPractice: React.FC<DictationPracticeProps> = ({
  lesson,
  onComplete,
  onExit,
}) => {
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<DictationCheckResult | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
  const [outcomes, setOutcomes] = useState<SentenceOutcome[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { speak, stop, isSpeaking, isSupported } = useTextToSpeech();

  const sentence = lesson.sentences[sentenceIndex];
  const totalSentences = lesson.sentences.length;
  const isSentenceDone = isRevealed || Boolean(result?.isComplete);

  /** Play the current sentence at the selected speed */
  const playSentence = useCallback(() => {
    speak(sentence, SPEEDS[speedIndex].rate);
    inputRef.current?.focus();
  }, [speak, sentence, speedIndex]);

  // Auto-play each new sentence
  useEffect(() => {
    if (isFinished) return;
    const timeoutId = setTimeout(playSentence, AUTO_PLAY_DELAY_MS);
    return () => clearTimeout(timeoutId);
    // Only re-run when the sentence changes, not when speed changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentenceIndex, isFinished]);

  // Ctrl pressed and released on its own replays the sentence
  useEffect(() => {
    let isCtrlAlone = false;

    const handleKeyDown = (event: KeyboardEvent): void => {
      isCtrlAlone = event.key === 'Control';
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key === 'Control' && isCtrlAlone && !isFinished) {
        playSentence();
      }
      isCtrlAlone = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [playSentence, isFinished]);

  // Stop speech when leaving the lesson
  useEffect(() => stop, [stop]);

  /** Check the typed text against the current sentence */
  const handleCheck = useCallback(() => {
    if (!input.trim()) return;
    setResult(checkDictation(sentence, input));
  }, [input, sentence]);

  /** Reveal the next word as a hint */
  const handleHint = useCallback(() => {
    const nextInput = revealNextWord(sentence, input);
    setInput(nextInput);
    setResult(checkDictation(sentence, nextInput));
    setHintsUsed((count) => count + 1);
    inputRef.current?.focus();
  }, [sentence, input]);

  /** Reveal the full sentence */
  const handleReveal = useCallback(() => {
    setIsRevealed(true);
    setResult(checkDictation(sentence, sentence));
  }, [sentence]);

  /** Move to the next sentence, or finish the lesson */
  const handleNext = useCallback(() => {
    const nextOutcomes = [...outcomes, { hints: hintsUsed, revealed: isRevealed }];
    setOutcomes(nextOutcomes);

    if (sentenceIndex + 1 >= totalSentences) {
      const perfectCount = nextOutcomes.filter((o) => !o.revealed && o.hints === 0).length;
      onComplete(lesson.id, Math.round((perfectCount / totalSentences) * 100));
      setIsFinished(true);
      stop();
      return;
    }

    setSentenceIndex((index) => index + 1);
    setInput('');
    setResult(null);
    setIsRevealed(false);
    setHintsUsed(0);
  }, [outcomes, hintsUsed, isRevealed, sentenceIndex, totalSentences, onComplete, lesson.id, stop]);

  /** Restart the lesson from the first sentence */
  const handleRestart = useCallback(() => {
    setSentenceIndex(0);
    setInput('');
    setResult(null);
    setIsRevealed(false);
    setHintsUsed(0);
    setOutcomes([]);
    setIsFinished(false);
  }, []);

  /** Enter checks the answer, or moves on once the sentence is done */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();

    if (isSentenceDone) {
      handleNext();
    } else {
      handleCheck();
    }
  };

  if (!isSupported) {
    return (
      <div className="browser-not-supported">
        <div className="browser-not-supported__content">
          <p className="browser-not-supported__message">
            Your browser does not support text-to-speech. Please use Chrome, Edge, or Safari
            for this feature.
          </p>
        </div>
      </div>
    );
  }

  if (isFinished) {
    const perfectCount = outcomes.filter((o) => !o.revealed && o.hints === 0).length;
    const revealedCount = outcomes.filter((o) => o.revealed).length;
    const totalHints = outcomes.reduce((sum, o) => sum + o.hints, 0);

    return (
      <section className="dictation-summary">
        <h2 className="dictation-summary__title">Lesson complete!</h2>
        <p className="dictation-summary__score">
          {Math.round((perfectCount / totalSentences) * 100)}%
        </p>
        <ul className="dictation-summary__stats">
          <li>
            Perfect sentences: {perfectCount}/{totalSentences}
          </li>
          <li>Hints used: {totalHints}</li>
          <li>Answers revealed: {revealedCount}</li>
        </ul>
        <div className="dictation-summary__transcript">
          {lesson.sentences.map((s, index) => (
            <p key={index}>{s}</p>
          ))}
        </div>
        <div className="dictation-actions">
          <button type="button" className="action-btn" onClick={handleRestart}>
            Practice again
          </button>
          <button type="button" className="action-btn action-btn--secondary" onClick={onExit}>
            Back to lessons
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="dictation-practice">
      <div className="dictation-practice__header">
        <button type="button" className="dictation-back-btn" onClick={onExit}>
          ← Lessons
        </button>
        <h2 className="dictation-practice__title">{lesson.title}</h2>
        <span className={`difficulty-badge difficulty-badge--${lesson.difficulty}`}>
          {lesson.difficulty}
        </span>
      </div>

      <div className="dictation-progress">
        <div className="dictation-progress__bar">
          <div
            className="dictation-progress__fill"
            style={{ width: `${(sentenceIndex / totalSentences) * 100}%` }}
          />
        </div>
        <span className="dictation-progress__label">
          {sentenceIndex + 1} / {totalSentences}
        </span>
      </div>

      <div className="dictation-player">
        <button
          type="button"
          className={`dictation-play-btn ${isSpeaking ? 'dictation-play-btn--playing' : ''}`}
          onClick={playSentence}
          aria-label="Play sentence"
        >
          {isSpeaking ? '🔊' : '▶'}
        </button>
        <div className="dictation-speed" role="group" aria-label="Playback speed">
          {SPEEDS.map((speed, index) => (
            <button
              key={speed.label}
              type="button"
              className={`dictation-speed__btn ${
                speedIndex === index ? 'dictation-speed__btn--active' : ''
              }`}
              onClick={() => setSpeedIndex(index)}
            >
              {speed.label}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <p className="dictation-answer" aria-live="polite">
          {result.words.map((word, index) => (
            <span key={index} className={`dictation-word dictation-word--${word.status}`}>
              {word.status === 'correct' ? word.text : maskWord(word.text)}
            </span>
          ))}
        </p>
      )}

      <textarea
        ref={inputRef}
        className="dictation-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type what you hear..."
        rows={3}
        readOnly={isSentenceDone}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
      />

      {isSentenceDone && (
        <p className={`dictation-feedback ${isRevealed ? '' : 'dictation-feedback--success'}`}>
          {isRevealed ? 'Answer revealed. Listen once more, then continue.' : 'Correct! 🎉'}
        </p>
      )}

      <div className="dictation-actions">
        {isSentenceDone ? (
          <button type="button" className="action-btn" onClick={handleNext}>
            {sentenceIndex + 1 >= totalSentences ? 'Finish' : 'Next sentence'}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="action-btn"
              onClick={handleCheck}
              disabled={!input.trim()}
            >
              Check
            </button>
            <button type="button" className="action-btn action-btn--secondary" onClick={handleHint}>
              Hint
            </button>
            <button
              type="button"
              className="action-btn action-btn--secondary"
              onClick={handleReveal}
            >
              Show answer
            </button>
          </>
        )}
      </div>

      <p className="dictation-shortcuts">
        <kbd>Ctrl</kbd> replay · <kbd>Enter</kbd> {isSentenceDone ? 'next' : 'check'}
      </p>
    </section>
  );
};
