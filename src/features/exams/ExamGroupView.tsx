/**
 * ExamGroupView
 * Renders one TOEIC group (audio, texts, questions) for taking or reviewing a test
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { prefetchScript, speakScript, type ScriptLine } from '@/shared/speech';
import { playSegment } from '@/shared/audioSegment';
import { mediaUrl, type ExamGroup, type P1Item, type P2Item, type ToeicPart } from '@/shared/examApi';

const LETTERS = ['A', 'B', 'C', 'D'];

interface ExamGroupViewProps {
  part: ToeicPart;
  group: ExamGroup;
  /** Number of the first question in this group */
  firstNumber: number;
  answers: Record<string, number>;
  flags: string[];
  /** Review mode shows answers, explanations and transcripts */
  review?: boolean;
  /** Test modes allow one play per group; part practice allows replays */
  playOnce?: boolean;
  played?: boolean;
  onPlayed?: () => void;
  onAnswer?: (questionId: string, choice: number) => void;
  onToggleFlag?: (questionId: string) => void;
}

/**
 * Lines spoken for a group without a recording: Part 1 reads the statements,
 * Part 2 the question then "A, B, C" responses
 */
function audioLines(part: ToeicPart, group: ExamGroup, firstNumber: number): ScriptLine[] {
  if (part === 1) {
    return (group.payload.items as P1Item[] | undefined ?? []).flatMap((item, index) => [
      { speaker: 'A' as const, text: `Number ${firstNumber + index}. Look at the picture marked number ${firstNumber + index} in your test book.` },
      ...item.statements.map((statement, i) => ({ speaker: 'B' as const, text: `${LETTERS[i]}. ${statement}` })),
    ]);
  }
  if (part === 2) {
    return (group.payload.items as P2Item[] | undefined ?? []).flatMap((item, index) => [
      { speaker: 'A' as const, text: `Number ${firstNumber + index}. ${item.question}` },
      ...item.options.map((option, i) => ({ speaker: 'B' as const, text: `${LETTERS[i]}. ${option}` })),
    ]);
  }
  return group.payload.script ?? [];
}

/**
 * Play button with a once-only rule for test modes
 */
const GroupAudio: React.FC<{ lines: ScriptLine[]; group: ExamGroup; playOnce: boolean; played: boolean; onPlayed: () => void }> = ({
  lines,
  group,
  playOnce,
  played,
  onPlayed,
}) => {
  const { t } = useI18n();
  const [isPlaying, setIsPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const play = () => {
    stopRef.current?.();
    setIsPlaying(true);
    const recording = group.payload.audio;
    if (recording) {
      stopRef.current = playSegment(recording, () => setIsPlaying(false), onPlayed);
      return;
    }
    onPlayed();
    const speakers = group.payload.speakers;
    stopRef.current = speakScript(
      lines,
      { A: speakers?.A.gender ?? 'female', B: speakers?.B?.gender ?? 'male', C: speakers?.C?.gender },
      1,
      (index) => index === -1 && setIsPlaying(false)
    );
  };

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setIsPlaying(false);
  };

  const locked = playOnce && played && !isPlaying;

  return (
    <div className="exam-audio">
      <Button variant="exam" icon="headphones" onClick={play} disabled={isPlaying || locked}>
        {isPlaying ? t.exams.playing : locked ? t.exams.played : t.exams.playAudio}
      </Button>
      {isPlaying && !playOnce && (
        <Button variant="ghost" size="sm" onClick={stop}>
          {t.exams.stopAudio}
        </Button>
      )}
      {playOnce && <span className="exam-audio__note">{t.exams.playOnce}</span>}
    </div>
  );
};

export const ExamGroupView: React.FC<ExamGroupViewProps> = ({
  part,
  group,
  firstNumber,
  answers,
  flags,
  review = false,
  playOnce = false,
  played = false,
  onPlayed,
  onAnswer,
  onToggleFlag,
}) => {
  const { t } = useI18n();
  const payload = group.payload;
  const isListening = part <= 4;

  // Generate the group's audio in the background while the learner reads the questions
  useEffect(() => {
    if (!isListening || group.payload.audio) return;
    const speakers = group.payload.speakers;
    prefetchScript(audioLines(part, group, firstNumber), { A: speakers?.A.gender ?? 'female', B: speakers?.B?.gender ?? 'male', C: speakers?.C?.gender });
  }, [group, part, firstNumber, isListening]);
  const instructions = { 1: t.exams.p1Instructions, 2: t.exams.p2Instructions, 3: t.exams.p3Instructions, 4: t.exams.p4Instructions, 5: t.exams.p5Instructions, 6: t.exams.p6Instructions, 7: t.exams.p7Instructions }[part];

  // Parts 1-2 options are spoken, so they are hidden while taking the test
  const questions: { prompt: string; options: string[]; answerIndex?: number; explanation?: string; imageAssetId?: string }[] =
    part === 1
      ? ((payload.items ?? []) as P1Item[]).map((item) => ({
          prompt: '',
          options: review ? item.statements : ['', '', '', ''],
          answerIndex: item.answerIndex,
          explanation: item.explanation,
          imageAssetId: item.imageAssetId,
        }))
      : part === 2
        ? ((payload.items ?? []) as P2Item[]).map((item) => ({
            prompt: review ? item.question : '',
            options: review ? item.options : ['', '', ''],
            answerIndex: item.answerIndex,
            explanation: item.explanation,
          }))
        : (payload.questions ?? []);

  return (
    <div className="exam-group">
      <p className="exam-group__instructions">{instructions}</p>

      {isListening && !review && (
        <GroupAudio
          lines={audioLines(part, group, firstNumber)}
          group={group}
          playOnce={playOnce}
          played={played}
          onPlayed={() => onPlayed?.()}
        />
      )}

      {review && isListening && (payload.audio || audioLines(part, group, firstNumber).length > 0) && (
        <GroupAudio lines={audioLines(part, group, firstNumber)} group={group} playOnce={false} played={false} onPlayed={() => undefined} />
      )}

      {review && isListening && part > 2 && payload.script && payload.script.length > 0 && (
        <details className="exam-transcript" open>
          <summary>{t.exams.transcript}</summary>
          {payload.script.map((line, i) => (
            <p key={i} lang="en">
              <strong>{payload.speakers?.[line.speaker]?.name ?? line.speaker}:</strong> {line.text}
            </p>
          ))}
        </details>
      )}

      {payload.graphic && (
        <div className="exam-text exam-text--graphic" lang="en">
          <p>{payload.graphic}</p>
        </div>
      )}

      {part === 6 && payload.passage && (
        <div className="exam-text" lang="en">
          <h3>{payload.title}</h3>
          <p>
            {payload.passage.split(/(\[\d\])/).map((piece, i) =>
              /^\[\d\]$/.test(piece) ? (
                <span key={i} className="exam-blank">
                  {firstNumber + Number(piece[1]) - 1}
                </span>
              ) : (
                piece
              )
            )}
          </p>
        </div>
      )}

      {part === 7 &&
        payload.passages?.map((passage, i) => (
          <div key={i} className="exam-text" lang="en">
            <p className="exam-text__kind">{passage.kind}</p>
            <h3>{passage.title}</h3>
            <p>{passage.text}</p>
          </div>
        ))}

      <ol className="exam-questions" start={firstNumber}>
        {questions.map((question, index) => {
          const id = `${group.id}:${index}`;
          const chosen = answers[id];
          const flagged = flags.includes(id);
          const correct = question.answerIndex;

          return (
            <li key={id} id={`q-${id}`} className="exam-q">
              <div className="exam-q__head">
                <span className="exam-q__number">{firstNumber + index}</span>
                {question.prompt && (
                  <span className="exam-q__prompt" lang="en">
                    {question.prompt.replace('____', '_______')}
                  </span>
                )}
                {!review && (
                  <button
                    type="button"
                    className={`exam-flag ${flagged ? 'exam-flag--on' : ''}`}
                    onClick={() => onToggleFlag?.(id)}
                    aria-pressed={flagged}
                    title={flagged ? t.exams.unflag : t.exams.flag}
                  >
                    <Icon name="flag" size={16} />
                    <span className="visually-hidden">{flagged ? t.exams.unflag : t.exams.flag}</span>
                  </button>
                )}
              </div>
              {question.imageAssetId && (
                <img className="exam-q__photo" src={mediaUrl(question.imageAssetId)} alt={t.exams.photoAlt(firstNumber + index)} loading="lazy" />
              )}
              <div className="exam-q__options" role="radiogroup" aria-label={t.exams.question(firstNumber + index)}>
                {question.options.map((option, optionIndex) => {
                  const isChosen = chosen === optionIndex;
                  const state = review ? (optionIndex === correct ? 'right' : isChosen ? 'wrong' : '') : isChosen ? 'chosen' : '';
                  return (
                    <label key={optionIndex} className={`exam-opt ${state ? `exam-opt--${state}` : ''}`}>
                      <input
                        type="radio"
                        className="visually-hidden"
                        name={id}
                        value={optionIndex}
                        checked={isChosen}
                        disabled={review}
                        onChange={() => onAnswer?.(id, optionIndex)}
                      />
                      <span className="exam-opt__letter">{LETTERS[optionIndex]}</span>
                      {option && <span lang="en">{option}</span>}
                    </label>
                  );
                })}
              </div>
              {review && (
                <p className="exam-q__explain">
                  {chosen === undefined ? t.exams.noAnswer : chosen === correct ? '✓' : `${t.exams.yourAnswer}: ${LETTERS[chosen]}`} ·{' '}
                  {t.exams.correctAnswer}: {LETTERS[correct ?? 0]}
                  {question.explanation && <span lang="en"> · {question.explanation}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
