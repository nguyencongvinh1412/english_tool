/**
 * PronunciationPage
 * Read a phrase aloud; the speech check listens to the recording and points out mispronounced words.
 * Each attempt is recorded; the learner can ask the AI how to fix the sounds.
 * When the speech check is unavailable, the browser's transcript is compared word by word instead.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Banner, Button, Card, EmptyState, Icon, Segmented, Select, Spinner } from '@/design';
import { ReviewChat, ReviewGroup, type ReviewPart } from '@/features/exams/ReviewChat';
import { ROUTES } from '@/app/routes';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { useI18n } from '@/i18n/I18nProvider';
import { useTextToSpeech } from '@/hooks';
import { useAudioCapture, type CaptureResult } from '@/hooks/useAudioCapture';
import { errorMessage } from '@/shared/http';
import { assessSpeech, isSpeechUnavailable, type PronunciationLevel, type SpeechAssessment } from '@/shared/speechApi';
import { useProgress } from '@/shared/progress';
import { prefetchText } from '@/shared/speech';
import { DIFFICULTIES, SOUND_FOCUSES, getPhrases, pickPhrase, type Difficulty, type Phrase, type SoundFocus } from '@/constants/phrases';
import { compareTexts, type ComparisonResult } from '@/utils/textComparison';
import { RecordButton } from './RecordButton';
import { SpeechNotes } from './SpeechNotes';
import { micErrorText } from '@/shared/micError';
import { tokens } from './speechSummary';
import './speaking.css';

const LEVEL_TONES: Record<Difficulty, string> = { easy: 'success', medium: 'warning', hard: 'danger' };

/** Feedback thresholds (percent) */
const EXCELLENT = 90;
const GOOD = 70;
const FAIR = 50;

/** Slower TTS for model pronunciation */
const MODEL_SPEECH_RATE = 0.75;

/** A phrase takes a few seconds to read; stop the recording on its own after this */
const MAX_RECORD_SEC = 20;

/** Progress needs a number; the speech check gives a level */
const LEVEL_SCORE: Record<PronunciationLevel, number> = { good: 90, fair: 70, needs_work: 45 };
const LEVEL_CLASS: Record<PronunciationLevel, string> = { good: 'score-level--good', fair: 'score-level--fair', needs_work: 'score-level--work' };

/** The result of one attempt */
type Check =
  | { status: 'checking' }
  | { status: 'done'; result: SpeechAssessment }
  /** Speech check unavailable: the browser transcript compared word by word */
  | { status: 'fallback'; transcript: string; comparison: ComparisonResult };

/** Phrases already shown, kept across visits so coming back does not repeat them */
const SEEN_KEY = 'pronunciation-seen';
const MAX_SEEN = 200;

function loadSeen(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveSeen(seen: string[]): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-MAX_SEEN)));
  } catch {
    // Private mode or blocked storage: phrases still rotate within this visit
  }
}

export const PronunciationPage: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { record } = useProgress();
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [focus, setFocus] = useState<SoundFocus | 'all'>('all');
  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [roundDone, setRoundDone] = useState(false);
  const seen = useRef<string[]>(loadSeen());
  const [check, setCheck] = useState<Check | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  /** Ignores a result that comes back after the learner moved on */
  const attempt = useRef(0);
  /** The result the Ask AI panel can read */
  const reviewParts = useRef(new Map<string, ReviewPart>());

  const { speak, isSpeaking } = useTextToSpeech();
  const phraseText = phrase?.text;
  useEffect(() => {
    if (phraseText) prefetchText(phraseText);
  }, [phraseText]);

  const onTake = useCallback(
    ({ wav, fallbackText }: CaptureResult) => {
      if (!phrase) return;
      const id = ++attempt.current;
      setCheck({ status: 'checking' });
      setCheckError(null);
      const save = (score: number, details: Record<string, unknown>) =>
        void record({ activity: 'pronunciation', contentRef: phrase.id, title: phrase.text, score, maxScore: 100, details: { level: phrase.difficulty, ...details } }).catch(
          () => {}
        );

      assessSpeech(wav, { mode: 'read', reference: phrase.text })
        .then((result) => {
          if (id !== attempt.current) return;
          setCheck({ status: 'done', result });
          // Reading another sentence is not a pronunciation attempt; a quick check (fallback model) hears too little to score
          if (result.offScript || result.accuracy === 'basic') return;
          const level = result.overall?.pronunciation ?? (result.issues.length ? 'fair' : 'good');
          save(LEVEL_SCORE[level], { transcript: result.transcript, pronunciation: level, issues: result.issues.map((i) => i.word) });
        })
        .catch((failure: unknown) => {
          if (id !== attempt.current) return;
          const heard = fallbackText();
          if (isSpeechUnavailable(failure) && heard) {
            const comparison = compareTexts(phrase.text, heard);
            setCheck({ status: 'fallback', transcript: heard, comparison });
            save(comparison.similarity, { transcript: heard });
            return;
          }
          setCheck(null);
          setCheckError(isSpeechUnavailable(failure) ? t.speechCheck.unavailableNoText : errorMessage(failure, t));
        });
    },
    [phrase, record, t]
  );

  const capture = useAudioCapture({ maxSec: MAX_RECORD_SEC, livePreview: true, onComplete: onTake });
  const isListening = capture.status === 'recording' || capture.status === 'starting';

  const resetAttempt = useCallback(() => {
    attempt.current++;
    setCheck(null);
    setCheckError(null);
  }, []);

  const nextPhrase = useCallback(() => {
    const result = pickPhrase(getPhrases(difficulty, focus), seen.current, phrase?.id ?? null);
    setRoundDone(result.restarted);
    seen.current = result.seen;
    saveSeen(result.seen);
    setPhrase(result.phrase);
    resetAttempt();
  }, [difficulty, focus, phrase, resetAttempt]);

  const start = useCallback(() => {
    resetAttempt();
    void capture.start();
  }, [resetAttempt, capture]);

  const levelText = (level: PronunciationLevel): string =>
    level === 'good' ? t.pronunciation.feedback.excellent : level === 'fair' ? t.pronunciation.feedback.fair : t.pronunciation.feedback.low;

  const feedbackText = (similarity: number): string =>
    similarity >= EXCELLENT
      ? t.pronunciation.feedback.excellent
      : similarity >= GOOD
        ? t.pronunciation.feedback.good
        : similarity >= FAIR
          ? t.pronunciation.feedback.fair
          : t.pronunciation.feedback.low;

  /** The phrase word by word, with the words the check flagged */
  const flaggedChips = (result: SpeechAssessment) => {
    const flagged = new Set(result.issues.flatMap((issue) => tokens(issue.word)));
    return phrase!.text.split(/\s+/).map((word, index) => {
      const bad = tokens(word).some((token) => flagged.has(token));
      return (
        <span key={`${word}-${index}`} className={`word-chip ${bad ? 'word-chip--miss' : 'word-chip--ok'}`}>
          <Icon name={bad ? 'x' : 'check'} size={14} />
          {word}
        </span>
      );
    });
  };

  return (
    <div className="speak">
      <PracticeHeader title={t.pronunciation.title} level={null} onBack={() => navigate(ROUTES.PRACTICE)} />

      {!capture.isSupported && <Banner tone="warning">{t.pronunciation.unsupported}</Banner>}

      <div className="speak-toolbar">
        <Segmented<Difficulty>
          label={t.dashboard.level}
          value={difficulty}
          onChange={(level) => {
            setDifficulty(level);
            setPhrase(null);
            setRoundDone(false);
            resetAttempt();
          }}
          options={DIFFICULTIES.map((level) => ({ value: level, label: t.dictation.levels[level], tone: LEVEL_TONES[level] }))}
        />
        <label className="topic-picker">
          <span className="visually-hidden">{t.pronunciation.focusLabel}</span>
          <Select
            value={focus}
            disabled={isListening}
            onChange={(event) => {
              setFocus(event.target.value as SoundFocus | 'all');
              setPhrase(null);
              setRoundDone(false);
              resetAttempt();
            }}
          >
            <option value="all">{t.pronunciation.focusAll}</option>
            {SOUND_FOCUSES.map((option) => (
              <option key={option} value={option}>
                {t.pronunciation.focus[option].label}
              </option>
            ))}
          </Select>
        </label>
        <Button icon={phrase ? 'chevronRight' : 'sparkles'} onClick={nextPhrase} disabled={isListening}>
          {phrase ? t.pronunciation.nextPhrase : t.pronunciation.getPhrase}
        </Button>
      </div>

      {!phrase ? (
        <EmptyState icon="mic" title={t.pronunciation.emptyTitle}>
          {t.pronunciation.emptyBody}
        </EmptyState>
      ) : (
        <>
          <Card padding="lg" tone="speaking" className="phrase-card reveal" key={phrase.id}>
            <div className="phrase-card__meta">
              <Badge tone={difficulty === 'easy' ? 'success' : difficulty === 'medium' ? 'warning' : 'danger'}>
                {t.dictation.levels[phrase.difficulty]}
              </Badge>
              <span className="phrase-card__category">{t.pronunciation.focus[phrase.category].label}</span>
            </div>
            <p className="phrase-card__text" lang="en">
              {phrase.text}
            </p>
            <Button variant="secondary" size="sm" icon="headphones" onClick={() => speak(phrase.text, MODEL_SPEECH_RATE)} disabled={isSpeaking}>
              {t.pronunciation.listen}
            </Button>
            <p className="phrase-card__tip">
              <Icon name="target" size={16} /> {t.pronunciation.focus[phrase.category].tip}
            </p>
          </Card>
          {roundDone && <Banner tone="info">{t.pronunciation.roundDone}</Banner>}

          {capture.isSupported && (
            <div className="speak-recorder">
              <RecordButton
                isRecording={isListening}
                level={capture.level}
                onStart={start}
                onStop={capture.stop}
                startLabel={t.pronunciation.record}
                stopLabel={t.pronunciation.stop}
                disabled={check?.status === 'checking'}
              />
              {isListening && capture.liveText && (
                <p className="speak-live" aria-live="polite">
                  <span className="speak-live__label">{t.pronunciation.youSaid}</span>
                  <span lang="en">{capture.liveText}</span>
                </p>
              )}
            </div>
          )}

          {!capture.errorKind && !isListening && !check && !checkError && <p className="speak-note">{t.pronunciation.mic.note}</p>}
          {capture.errorKind && <Banner tone="warning">{micErrorText(capture.errorKind, t)}</Banner>}
          {checkError && <Banner tone="danger">{checkError}</Banner>}

          {check?.status === 'checking' && (
            <Card padding="lg" className="score-card score-card--checking">
              <Spinner size={22} /> {t.speechCheck.checking}
            </Card>
          )}

          {check?.status === 'done' && !isListening && (
            <ReviewGroup id="attempt" label={phrase.text} registry={reviewParts}>
              <Card padding="lg" className="score-card reveal">
                {(() => {
                  const level = check.result.overall?.pronunciation ?? (check.result.issues.length ? 'fair' : 'good');
                  return (
                    <div className="score-card__top">
                      <div className={`score-level ${LEVEL_CLASS[level]}`}>{t.speechCheck.levels[level]}</div>
                      <div>
                        <p className="score-card__label">{t.speechCheck.pronunciation}</p>
                        <p className="score-card__feedback">{levelText(level)}</p>
                      </div>
                    </div>
                  );
                })()}
                <p className="score-card__label">{t.pronunciation.checkedWords}</p>
                <div className="word-chips" lang="en">
                  {flaggedChips(check.result)}
                </div>
                <p className="score-card__heard">
                  <span className="speak-live__label">{t.pronunciation.youSaid}</span> <span lang="en">{check.result.transcript}</span>
                </p>
                {check.result.offScript ? <Banner tone="warning">{t.pronunciation.offScript}</Banner> : <SpeechNotes assessment={check.result} hideFluency />}
              </Card>
            </ReviewGroup>
          )}

          {check?.status === 'fallback' && !isListening && (
            <ReviewGroup id="attempt" label={phrase.text} registry={reviewParts}>
              <Card padding="lg" className="score-card reveal">
                <div className="score-card__top">
                  <div className="score-ring" style={{ ['--pct' as string]: check.comparison.similarity }}>
                    <span>{check.comparison.similarity}%</span>
                  </div>
                  <div>
                    <p className="score-card__label">{t.pronunciation.accuracy}</p>
                    <p className="score-card__feedback">{feedbackText(check.comparison.similarity)}</p>
                  </div>
                </div>
                <p className="score-card__label">{t.pronunciation.wordAnalysis}</p>
                <div className="word-chips" lang="en">
                  {check.comparison.targetWords.map((word, index) => (
                    <span key={`${word.word}-${index}`} className={`word-chip ${word.matched ? 'word-chip--ok' : 'word-chip--miss'}`}>
                      <Icon name={word.matched ? 'check' : 'x'} size={14} />
                      {word.word}
                    </span>
                  ))}
                </div>
                <p className="score-card__heard">
                  <span className="speak-live__label">{t.pronunciation.youSaid}</span> <span lang="en">{check.transcript}</span>
                </p>
                <Banner tone="info">{t.pronunciation.fallbackNote}</Banner>
              </Card>
            </ReviewGroup>
          )}
          {(check?.status === 'done' || check?.status === 'fallback') && !isListening && <ReviewChat registry={reviewParts} copy={t.speechCheck.askAi} />}
        </>
      )}
    </div>
  );
};
