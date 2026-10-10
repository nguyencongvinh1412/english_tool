/**
 * IELTS test panels: listening section, reading passage, writing task and speaking set,
 * each usable while taking the test and in the review
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Card } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useSpeechRecognition } from '@/hooks';
import { prefetchScript, speakOnce, speakScript } from '@/shared/speech';
import { speakingQuestions, type IeltsListening, type IeltsReading } from '@/shared/ieltsApi';
import type { SpeakingIelts, WritingPrompt } from '@/shared/contentApi';
import { WritingPromptCard } from '@/features/writing/WritingReview';
import { RecordButton } from '@/features/speaking/RecordButton';
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
    stopRef.current = speakScript(payload.script, genders, 1, (index) => index === -1 && setIsPlaying(false));
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
      <div className="exam-audio">
        <Button variant="exam" icon="headphones" onClick={play} disabled={isPlaying || locked}>
          {isPlaying ? t.exams.playing : locked ? t.exams.played : t.exams.playAudio}
        </Button>
        {isPlaying && !playOnce && (
          <Button variant="ghost" size="sm" onClick={stop}>
            {t.exams.stopAudio}
          </Button>
        )}
        {playOnce && !props.review && <span className="exam-audio__note">{t.exams.playOnce}</span>}
      </div>

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
}> = ({ groupId, payload, answers, review, onAnswer }) => {
  const { t } = useI18n();
  const { isListening, transcript, interimTranscript, isSupported, error, startListening, stopListening, resetTranscript } = useSpeechRecognition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const questions = speakingQuestions(groupId, payload);
  const textOf = (id: string) => String(answers[id] ?? '');

  // Append each finished recording to the question being answered
  useEffect(() => {
    if (!isListening && transcript && activeId) {
      const before = String(answers[activeId] ?? '');
      onAnswer?.(activeId, `${before ? `${before} ` : ''}${transcript}`.trim());
      resetTranscript();
    }
  }, [isListening, transcript, activeId, answers, onAnswer, resetTranscript]);

  const record = (id: string) => {
    if (isListening) stopListening();
    resetTranscript();
    setActiveId(id);
    startListening();
  };

  const parts = [
    { part: 1, title: t.ielts.part1 },
    { part: 2, title: t.ielts.part2 },
    { part: 3, title: t.ielts.part3 },
  ] as const;

  return (
    <div className="ielts-speaking">
      {!review && <p className="exam-group__instructions">{t.ielts.speakingIntro}</p>}
      {!review && !isSupported && <Banner tone="warning">{t.ielts.noMic}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      {parts.map(({ part, title }) => (
        <section key={part} className="ielts-speaking__part">
          <h3 className="ielts-speaking__title">{title}</h3>
          {questions
            .filter((q) => q.part === part)
            .map((q) => {
              const live = activeId === q.id && isListening;
              return (
                <Card key={q.id} padding="md" className={`ielts-sq ${live ? 'ielts-sq--live' : ''}`}>
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
                  {!review && isSupported && (
                    <RecordButton
                      size="md"
                      isRecording={live}
                      onStart={() => record(q.id)}
                      onStop={stopListening}
                      startLabel={t.ielts.record}
                      stopLabel={t.ielts.stopRecord}
                    />
                  )}
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
                </Card>
              );
            })}
        </section>
      ))}
    </div>
  );
};

