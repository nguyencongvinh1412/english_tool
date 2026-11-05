/**
 * IELTS test panels: listening section, reading passage, writing task and speaking set,
 * each usable while taking the test and in the review
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, ProgressBar, Tag } from '@/design';
import { useCurrentUser } from '@/app/AuthProvider';
import { CREDIT_COST, tasksLeft } from '@/shared/billingApi';
import { useI18n } from '@/i18n/I18nProvider';
import { useSpeechRecognition } from '@/hooks';
import { prefetchScript, prefetchTexts, speakOnce, speakScript } from '@/shared/speech';
import { speakingQuestions, type IeltsListening, type IeltsReading } from '@/shared/ieltsApi';
import type { SpeakingIelts, WritingPrompt } from '@/shared/contentApi';
import { WritingPromptCard } from '@/features/writing/WritingReview';
import { ExamAudio } from './ExamAudio';
import { IeltsQuestions } from './IeltsQuestions';

type Answers = Record<string, number | string>;

interface ObjectiveProps {
  groupId: string;
  firstNumber: number;
  answers: Answers;
  flags: string[];
  review: boolean;
  onAnswer?: (id: string, value: number | string) => void;
  onToggleFlag?: (id: string) => void;
}

const PARAGRAPH_LETTERS = 'ABCDEFGHI';

/**
 * Listening section: context, one play (or replays in practice), questions; transcript in the review
 */
export const ListeningPanel: React.FC<ObjectiveProps & { payload: IeltsListening; playOnce: boolean; played: boolean; onPlayed: () => void }> = ({
  payload,
  playOnce,
  played,
  onPlayed,
  ...props
}) => {
  const { t } = useI18n();
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const genders = { A: payload.speakers.A.gender, B: payload.speakers.B?.gender ?? 'male', C: payload.speakers.C?.gender };

  useEffect(() => () => stopRef.current?.(), []);

  // Generate the audio in the background while the learner reads the questions
  useEffect(() => {
    if (!props.review) prefetchScript(payload.script, { A: payload.speakers.A.gender, B: payload.speakers.B?.gender ?? 'male', C: payload.speakers.C?.gender });
  }, [payload, props.review]);

  const play = () => {
    stopRef.current?.();
    setIsPlaying(true);
    onPlayed();
    setProgress(0);
    stopRef.current = speakScript(payload.script, genders, 1, (index) => (index === -1 ? setIsPlaying(false) : setProgress(index / Math.max(1, payload.script.length))));
  };

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setIsPlaying(false);
  };

  const locked = playOnce && played && !isPlaying;

  return (
    <div className="ielts-listening">
      <p className="ielts-context" lang="en">
        {payload.context}
      </p>
      {!props.review && <p className="exam-group__instructions">{t.ielts.listeningIntro}</p>}
      <ExamAudio playing={isPlaying} locked={locked} progress={progress} playOnce={playOnce} onPlay={play} onStop={stop} />
      {playOnce && !props.review && <p className="exam-audio__note">{t.exams.playOnce}</p>}

      {props.review && (
        <details className="exam-transcript">
          <summary>{t.exams.transcript}</summary>
          {payload.script.map((line, i) => (
            <p key={i} lang="en">
              <strong>{payload.speakers[line.speaker]?.name ?? line.speaker}:</strong> {line.text}
            </p>
          ))}
        </details>
      )}

      <IeltsQuestions questions={payload.questions} {...props} />
    </div>
  );
};

/**
 * Reading passage beside its questions (stacked on small screens)
 */
export const ReadingPanel: React.FC<ObjectiveProps & { payload: IeltsReading }> = ({ payload, ...props }) => (
  <div className="ielts-split">
    <article className="ielts-passage" lang="en">
      <h3 className="ielts-passage__title">{payload.title}</h3>
      {payload.paragraphs.map((paragraph, i) => (
        <p key={i} className="ielts-passage__para">
          <span className="ielts-passage__letter" aria-hidden="true">
            {PARAGRAPH_LETTERS[i]}
          </span>
          {paragraph}
        </p>
      ))}
    </article>
    <div className="ielts-split__questions">
      <IeltsQuestions questions={payload.questions} {...props} />
    </div>
  </div>
);

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Writing task with the essay editor and a live word count
 */
export const WritingPanel: React.FC<{
  groupId: string;
  payload: WritingPrompt;
  value: string;
  review: boolean;
  onChange?: (value: string) => void;
}> = ({ groupId, payload, value, review, onChange }) => {
  const { t } = useI18n();
  const words = countWords(value);
  return (
    <div className="ielts-split ielts-split--writing">
      <WritingPromptCard task={payload} />
      <div className="ielts-essay">
        <label className="visually-hidden" htmlFor={`essay-${groupId}`}>
          {payload.title}
        </label>
        <textarea
          id={`essay-${groupId}`}
          className="input ielts-essay__area"
          lang="en"
          spellCheck={false}
          placeholder={t.ielts.essayPlaceholder}
          value={value}
          readOnly={review}
          onChange={(e) => onChange?.(e.target.value)}
        />
        <p className={`ielts-essay__count ${words >= payload.minWords ? 'ielts-essay__count--ok' : ''}`}>{t.ielts.words(words, payload.minWords)}</p>
      </div>
    </div>
  );
};

/**
 * Speaking set: questions read aloud, answers recorded by speech recognition into editable transcripts
 */
export const SpeakingPanel: React.FC<{
  groupId: string;
  payload: SpeakingIelts;
  answers: Answers;
  review: boolean;
  onAnswer?: (id: string, value: string) => void;
  /** Submit the test (last part) */
  onFinish?: () => void;
  submitting?: boolean;
}> = ({ groupId, payload, answers, review, onAnswer, onFinish, submitting = false }) => {
  const { t } = useI18n();
  const { isListening, transcript, interimTranscript, isSupported, error, errorKind, startListening, stopListening, resetTranscript } = useSpeechRecognition();
  const user = useCurrentUser();
  const creditsOut = (tasksLeft(user.credits, 'speaking') ?? 1) < 1;
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Seconds left of the one-minute preparation for the cue card (null: not started) */
  const [prep, setPrep] = useState<number | null>(null);
  /** The part shown while taking the test (0-2); the review shows all three */
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (prep === null || prep <= 0) return;
    const id = setTimeout(() => setPrep((value) => (value === null ? null : value - 1)), 1000);
    return () => clearTimeout(id);
  }, [prep]);
  const questions = speakingQuestions(groupId, payload);
  const textOf = (id: string) => String(answers[id] ?? '');
  /** The question the main button records next: the first one of this part without an answer */
  const target = questions.find((q) => q.part === step + 1 && !textOf(q.id))?.id ?? null;

  // Append each finished recording to the question being answered
  useEffect(() => {
    if (!isListening && transcript && activeId) {
      const before = String(answers[activeId] ?? '');
      onAnswer?.(activeId, `${before ? `${before} ` : ''}${transcript}`.trim());
      resetTranscript();
    }
  }, [isListening, transcript, activeId, answers, onAnswer, resetTranscript]);

  /** Leaving a part ends any recording in progress */
  const goStep = (next: number) => {
    if (isListening) stopListening();
    setStep(next);
  };

  const record = (id: string) => {
    if (isListening) stopListening();
    resetTranscript();
    setActiveId(id);
    startListening();
  };

  // Generate the questions' audio in one request, so the speaker buttons play at once
  useEffect(() => {
    if (!review) prefetchTexts(questions.filter((q) => q.part !== 2).map((q) => q.text));
  }, [payload, review]); // eslint-disable-line react-hooks/exhaustive-deps

  const parts = [
    { part: 1, title: t.ielts.part1 },
    { part: 2, title: t.ielts.part2 },
    { part: 3, title: t.ielts.part3 },
  ] as const;

  return (
    <div className="ielts-speaking">
      {!review && <p className="exam-group__instructions">{t.ielts.speakingIntro}</p>}
      {!review && creditsOut && <Banner tone="warning">{t.ielts.speakingNoCredits}</Banner>}
      {!review && !isSupported && <Banner tone="warning">{t.ielts.noMic}</Banner>}
      {error && <Banner tone="warning">{errorKind === 'denied' ? t.ielts.micDenied : error}</Banner>}

      {!review && (
        <div className="ielts-steps">
          <div className="ielts-steps__row">
            <strong>{t.ielts.partOf(step + 1, parts.length)}</strong>
            <span>{t.ielts.autoSaved}</span>
          </div>
          <ProgressBar value={((step + 1) / parts.length) * 100} tone="exam" size="sm" label={t.ielts.partOf(step + 1, parts.length)} />
        </div>
      )}

      {parts.filter(({ part }) => review || part === step + 1).map(({ part, title }) => (
        <section key={part} className="ielts-speaking__part">
          <h3 className="ielts-speaking__title">{title}</h3>
          {questions
            .filter((q) => q.part === part)
            .map((q) => {
              const live = activeId === q.id && isListening;
              return (
                <Card key={q.id} padding="md" className={`ielts-sq ${live ? 'ielts-sq--live' : ''} ${!review && q.id === target ? 'ielts-sq--target' : ''}`}>
                  <div className="ielts-sq__head">
                    <div className="ielts-sq__question" lang="en">
                      <p>{q.text}</p>
                      {part === 2 && (
                        <>
                          <p className="ielts-sq__say">{t.ielts.youShouldSay}</p>
                          <ul>
                            {payload.part2.bullets.map((bullet) => (
                              <li key={bullet}>{bullet}</li>
                            ))}
                          </ul>
                          <p>{payload.part2.closing}</p>
                          {!review && <p className="ielts-sq__note">{t.ielts.cueCardNote}</p>}
                          {!review && (
                            <div className={`ielts-prep ${prep !== null && prep > 0 ? 'ielts-prep--on' : ''}`}>
                              <span>{t.ielts.prepTime}</span>
                              {prep === null ? (
                                <Button size="sm" variant="secondary" onClick={() => setPrep(60)}>
                                  {t.ielts.prepStart}
                                </Button>
                              ) : (
                                <strong role="timer">
                                  {Math.floor(prep / 60)}:{String(prep % 60).padStart(2, '0')}
                                </strong>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="headphones"
                      aria-label={t.ielts.listen}
                      onClick={() => speakOnce(part === 2 ? `${q.text} You should say: ${payload.part2.bullets.join('. ')}. ${payload.part2.closing}` : q.text)}
                    />
                  </div>
                  {(review || !isSupported || live || textOf(q.id)) && (
                    <>
                  <label className="ielts-sq__label" htmlFor={`sq-${q.id}`}>
                    {t.ielts.transcriptLabel}
                  </label>
                  <textarea
                    id={`sq-${q.id}`}
                    className="input ielts-sq__text"
                    lang="en"
                    rows={part === 2 ? 5 : 2}
                    readOnly={review}
                    value={live ? `${textOf(q.id)} ${transcript} ${interimTranscript}`.trim() : textOf(q.id)}
                    onChange={(e) => onAnswer?.(q.id, e.target.value)}
                  />
                    </>
                  )}
                </Card>
              );
            })}
        </section>
      ))}

      {!review && (
        <div className="exam-footer">
          <Tag tone={creditsOut ? 'notice' : 'neutral'}>{creditsOut ? t.today.needsCredits : t.ielts.gradeCost(CREDIT_COST.speaking)}</Tag>
          {isListening ? (
            <Button size="lg" onClick={stopListening}>
              {t.ielts.stopRecord}
            </Button>
          ) : isSupported && target ? (
            <Button size="lg" icon="mic" onClick={() => record(target)}>
              {t.ielts.startSpeaking}
            </Button>
          ) : step < parts.length - 1 ? (
            <Button size="lg" onClick={() => goStep(step + 1)}>
              {t.ielts.nextPart}
            </Button>
          ) : (
            <Button size="lg" icon="check" onClick={onFinish} loading={submitting}>
              {t.exams.submit}
            </Button>
          )}
          {step > 0 && !isListening && (
            <button type="button" className="exam-footer__link" onClick={() => goStep(step - 1)}>
              {t.ielts.prevPart}
            </button>
          )}
          {!isListening && isSupported && !target && step < parts.length - 1 && (
            <span className="exam-footer__pos">{t.ielts.partDone}</span>
          )}
        </div>
      )}
    </div>
  );
};

