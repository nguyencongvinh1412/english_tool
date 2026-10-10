/**
 * PronunciationPage
 * Read a phrase aloud; speech recognition compares it word by word.
 * Each scored attempt is recorded; optional AI coaching explains what to fix.
 */
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Banner, Button, Card, EmptyState, Icon, PageHeader, Segmented, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useClaude, useSpeechRecognition, useTextToSpeech } from '@/hooks';
import { useProgress } from '@/shared/progress';
import { DIFFICULTIES, getRandomPhrase, type Difficulty, type Phrase } from '@/constants/phrases';
import { compareTexts, type ComparisonResult } from '@/utils/textComparison';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { RecordButton } from './RecordButton';
import './speaking.css';

const LEVEL_TONES: Record<Difficulty, string> = { easy: 'success', medium: 'warning', hard: 'danger' };

/** Feedback thresholds (percent) */
const EXCELLENT = 90;
const GOOD = 70;
const FAIR = 50;

/** Slower TTS for model pronunciation */
const MODEL_SPEECH_RATE = 0.75;

/** Feedback language follows the learner's profile on the server */
const COACH_CONTEXT = { mode: 'pronunciation' } as const;

export const PronunciationPage: React.FC = () => {
  const { t } = useI18n();
  const { record } = useProgress();
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const awaitingResult = useRef(false);

  const { isListening, transcript, interimTranscript, error: speechError, isSupported, startListening, stopListening, resetTranscript } =
    useSpeechRecognition();
  const { messages, isLoading: isAiLoading, error: aiError, sendUserMessage, clearMessages } = useClaude({ context: COACH_CONTEXT });
  const { speak, isSpeaking } = useTextToSpeech();

  const aiFeedback = useMemo(() => [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? null, [messages]);

  const resetAttempt = useCallback(() => {
    setComparison(null);
    setShowFeedback(false);
    resetTranscript();
    clearMessages();
  }, [resetTranscript, clearMessages]);

  const nextPhrase = useCallback(() => {
    setPhrase(getRandomPhrase(difficulty));
    resetAttempt();
  }, [difficulty, resetAttempt]);

  const start = useCallback(() => {
    resetAttempt();
    awaitingResult.current = true;
    startListening();
  }, [resetAttempt, startListening]);

  // Score once recognition has stopped and produced its final transcript
  useEffect(() => {
    if (isListening || !awaitingResult.current || !phrase) return;
    awaitingResult.current = false;
    if (!transcript.trim()) return;

    const result = compareTexts(phrase.text, transcript);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- result of the external speech API
    setComparison(result);
    void record({
      activity: 'pronunciation',
      contentRef: phrase.id,
      title: phrase.text,
      score: result.similarity,
      maxScore: 100,
      details: { level: phrase.difficulty, transcript },
    }).catch(() => {});
  }, [isListening, transcript, phrase, record]);

  const askCoach = useCallback(async () => {
    if (!phrase || !comparison) return;
    setShowFeedback(true);
    const missed = comparison.targetWords.filter((w) => !w.matched).map((w) => w.word);
    await sendUserMessage(
      `Target phrase: "${phrase.text}"\nUser said: "${transcript}"\n${missed.length ? `Missed words: ${missed.join(', ')}` : 'All words matched!'}`
    );
  }, [phrase, comparison, transcript, sendUserMessage]);

  const feedbackText = (similarity: number): string =>
    similarity >= EXCELLENT
      ? t.pronunciation.feedback.excellent
      : similarity >= GOOD
        ? t.pronunciation.feedback.good
        : similarity >= FAIR
          ? t.pronunciation.feedback.fair
          : t.pronunciation.feedback.low;

  return (
    <div className="speak">
      <PageHeader eyebrow={t.nav.speaking} title={t.pronunciation.title} description={t.pronunciation.description} />

      {!isSupported && <Banner tone="danger">{t.pronunciation.unsupported}</Banner>}

      <div className="speak-toolbar">
        <Segmented<Difficulty>
          label={t.dashboard.level}
          value={difficulty}
          onChange={(level) => {
            setDifficulty(level);
            setPhrase(null);
            resetAttempt();
          }}
          options={DIFFICULTIES.map((level) => ({ value: level, label: t.dictation.levels[level], tone: LEVEL_TONES[level] }))}
        />
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
              <span className="phrase-card__category">{phrase.category}</span>
            </div>
            <p className="phrase-card__text" lang="en">
              {phrase.text}
            </p>
            <Button variant="secondary" size="sm" icon="headphones" onClick={() => speak(phrase.text, MODEL_SPEECH_RATE)} disabled={isSpeaking}>
              {t.pronunciation.listen}
            </Button>
          </Card>

          {isSupported && (
            <div className="speak-recorder">
              <RecordButton
                isRecording={isListening}
                onStart={start}
                onStop={stopListening}
                startLabel={t.pronunciation.record}
                stopLabel={t.pronunciation.stop}
              />
              {(isListening || transcript) && (
                <p className="speak-live" aria-live="polite">
                  <span className="speak-live__label">{t.pronunciation.youSaid}</span>
                  <span lang="en">
                    {transcript}
                    {interimTranscript && <span className="speak-live__interim"> {interimTranscript}</span>}
                  </span>
                </p>
              )}
            </div>
          )}

          {speechError && <Banner tone="danger">{speechError}</Banner>}

          {comparison && !isListening && (
            <Card padding="lg" className="score-card reveal">
              <div className="score-card__top">
                <div className="score-ring" style={{ ['--pct' as string]: comparison.similarity }}>
                  <span>{comparison.similarity}%</span>
                </div>
                <div>
                  <p className="score-card__label">{t.pronunciation.accuracy}</p>
                  <p className="score-card__feedback">{feedbackText(comparison.similarity)}</p>
                </div>
              </div>

              <p className="score-card__label">{t.pronunciation.wordAnalysis}</p>
              <div className="word-chips" lang="en">
                {comparison.targetWords.map((word, index) => (
                  <span key={`${word.word}-${index}`} className={`word-chip ${word.matched ? 'word-chip--ok' : 'word-chip--miss'}`}>
                    <Icon name={word.matched ? 'check' : 'x'} size={14} />
                    {word.word}
                  </span>
                ))}
              </div>

              {!showFeedback ? (
                <Button variant="secondary" icon="sparkles" onClick={askCoach} disabled={isAiLoading}>
                  {t.pronunciation.aiFeedback}
                </Button>
              ) : (
                <div className="coach">
                  <p className="coach__title">
                    <Icon name="sparkles" size={18} /> {t.pronunciation.aiCoach}
                  </p>
                  {isAiLoading ? (
                    <p className="coach__loading">
                      <Spinner size={18} /> {t.pronunciation.analyzing}
                    </p>
                  ) : (
                    aiFeedback && (
                      <p className="coach__body">
                        <InlineMarkdown text={aiFeedback} />
                      </p>
                    )
                  )}
                  {aiError && <Banner tone="danger">{aiError}</Banner>}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
};
