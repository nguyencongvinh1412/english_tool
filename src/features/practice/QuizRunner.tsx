/**
 * QuizRunner
 * Answer MCQ and True/False/Not Given questions one at a time: check, see the explanation, move on. A finished
 * round is reported once, after the last question is checked. Reviewing a finished round lists every question.
 */
import type React from 'react';
import { useState } from 'react';
import { Banner, Button, Card, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import type { QuizQuestion } from '@/shared/contentApi';
import { ActivityProgress } from './ActivityProgress';
import { correctValue } from './session';
import './practice.css';

const TFNG_OPTIONS = ['true', 'false', 'not_given'] as const;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

interface QuizRunnerProps {
  questions: QuizQuestion[];
  /** Called once per check with the score; parent records the attempt */
  onChecked: (correct: number, total: number, answers: (string | null)[]) => void;
  /** Called when the learner wants a fresh try */
  onRetry?: () => void;
  /** Session buttons (more questions, end). Shown before and after checking, in place of "Try again" */
  actions?: React.ReactNode;
  /** Shows these saved answers, already checked and read-only (reviewing a finished round) */
  reviewAnswers?: (string | null)[];
}

/**
 * Renders a prompt, highlighting "____" blanks
 */
const Prompt: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('____').map((part, index, parts) => (
      <span key={index}>
        {part}
        {index < parts.length - 1 && <span className="quiz-blank" aria-label="blank" />}
      </span>
    ))}
  </>
);

export const QuizRunner: React.FC<QuizRunnerProps> = ({ questions, onChecked, onRetry, actions, reviewAnswers }) => {
  const { t } = useI18n();
  const reviewing = reviewAnswers !== undefined;
  const [answers, setAnswers] = useState<(string | null)[]>(() => reviewAnswers ?? questions.map(() => null));
  /** Questions the learner has checked (all of them when reviewing) */
  const [confirmed, setConfirmed] = useState<boolean[]>(() => questions.map(() => reviewing));
  const [index, setIndex] = useState(0);

  const finished = confirmed.every(Boolean);
  const correctCount = questions.filter((q, i) => answers[i] === correctValue(q)).length;

  const choose = (question: number, value: string): void => {
    if (confirmed[question]) return;
    setAnswers((current) => current.map((a, i) => (i === question ? value : a)));
  };

  const check = (): void => {
    const nextConfirmed = confirmed.map((done, i) => done || i === index);
    setConfirmed(nextConfirmed);
    // The round counts as checked once its last question is
    if (nextConfirmed.every(Boolean)) onChecked(questions.filter((q, i) => answers[i] === correctValue(q)).length, questions.length, answers);
  };

  const retry = (): void => {
    setAnswers(questions.map(() => null));
    setConfirmed(questions.map(() => false));
    setIndex(0);
    onRetry?.();
  };

  const label = (question: QuizQuestion, value: string): string =>
    question.type === 'mcq' ? question.options[Number(value)] : t.quiz.tfng[value as (typeof TFNG_OPTIONS)[number]];

  const renderQuestion = (question: QuizQuestion, qIndex: number) => {
    const values = question.type === 'mcq' ? question.options.map((_, i) => String(i)) : [...TFNG_OPTIONS];
    const checked = confirmed[qIndex];
    const isRight = answers[qIndex] === correctValue(question);

    return (
      <Card key={qIndex} padding="md" className={`quiz-q ${checked ? (isRight ? 'quiz-q--right' : 'quiz-q--wrong') : ''}`}>
        <fieldset className="quiz-q__set">
          <legend className="quiz-q__prompt">
            <span className="quiz-q__number">{t.quiz.question(qIndex + 1, questions.length)}</span>
            <span lang="en">
              <Prompt text={question.prompt} />
            </span>
          </legend>
          <div className={`quiz-q__options ${question.type === 'tfng' ? 'quiz-q__options--row' : ''}`}>
            {values.map((value, optionIndex) => {
              const selected = answers[qIndex] === value;
              const isAnswer = checked && value === correctValue(question);
              return (
                <label
                  key={value}
                  className={`quiz-opt ${selected ? 'quiz-opt--selected' : ''} ${isAnswer ? 'quiz-opt--answer' : ''} ${checked && selected && !isAnswer ? 'quiz-opt--miss' : ''}`}
                >
                  <input type="radio" className="visually-hidden" name={`q-${qIndex}`} value={value} checked={selected} onChange={() => choose(qIndex, value)} disabled={checked} />
                  {question.type === 'mcq' && <span className="quiz-opt__letter">{OPTION_LETTERS[optionIndex]}</span>}
                  <span lang="en">{label(question, value)}</span>
                  {isAnswer && <Icon name="check" size={18} />}
                  {checked && selected && !isAnswer && <Icon name="x" size={18} />}
                </label>
              );
            })}
          </div>
        </fieldset>

        {checked && (
          <div className="quiz-q__explain" aria-live="polite">
            <strong>{isRight ? t.quiz.correct : t.quiz.incorrect}</strong>
            {!isRight && <span> · {t.quiz.correctAnswer(label(question, correctValue(question)))}</span>}
            <p lang="en">{question.explanation}</p>
          </div>
        )}
      </Card>
    );
  };

  // Reviewing a finished round: every question with its answer, nothing to do
  if (reviewing) {
    return (
      <div className="quiz">
        {questions.map((question, qIndex) => renderQuestion(question, qIndex))}
        <div className="quiz__footer">
          <Banner tone={correctCount / questions.length >= 0.8 ? 'success' : 'info'}>{t.quiz.score(correctCount, questions.length)}</Banner>
        </div>
      </div>
    );
  }

  const last = index === questions.length - 1;
  const answered = answers[index] !== null;

  return (
    <div className="quiz">
      <ActivityProgress label={t.quiz.question(Math.min(index + 1, questions.length), questions.length)} index={index} total={questions.length} />
      {renderQuestion(questions[index], index)}

      <div className="quiz__footer">
        {!confirmed[index] ? (
          <>
            <Button size="lg" icon="check" onClick={check} disabled={!answered}>
              {t.quiz.check}
            </Button>
            {!answered && <span className="quiz__hint">{t.quiz.answerOne}</span>}
          </>
        ) : last ? (
          <>
            <Banner tone={correctCount / questions.length >= 0.8 ? 'success' : 'info'}>{t.quiz.score(correctCount, questions.length)}</Banner>
            {!actions && (
              <Button variant="secondary" icon="sparkles" onClick={retry}>
                {t.quiz.tryAgain}
              </Button>
            )}
          </>
        ) : (
          <Button size="lg" icon="chevronRight" onClick={() => setIndex(index + 1)}>
            {t.quiz.nextQuestion}
          </Button>
        )}
      </div>
      {finished && actions && <div className="quiz__footer quiz__session">{actions}</div>}
    </div>
  );
};
