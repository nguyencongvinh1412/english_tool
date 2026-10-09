/**
 * QuizRunner
 * Answer MCQ and True/False/Not Given questions, check all at once, see explanations
 */
import type React from 'react';
import { useState } from 'react';
import { Banner, Button, Card, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import type { QuizQuestion } from '@/shared/contentApi';
import './practice.css';

const TFNG_OPTIONS = ['true', 'false', 'not_given'] as const;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

interface QuizRunnerProps {
  questions: QuizQuestion[];
  /** Called once per check with the score; parent records the attempt */
  onChecked: (correct: number, total: number, answers: (string | null)[]) => void;
  /** Called when the learner wants a fresh try */
  onRetry?: () => void;
}

/**
 * Value of the correct answer, comparable with the stored choice
 */
function correctValue(question: QuizQuestion): string {
  return question.type === 'mcq' ? String(question.answerIndex) : question.answer;
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

export const QuizRunner: React.FC<QuizRunnerProps> = ({ questions, onChecked, onRetry }) => {
  const { t } = useI18n();
  const [answers, setAnswers] = useState<(string | null)[]>(() => questions.map(() => null));
  const [checked, setChecked] = useState(false);

  const unanswered = answers.filter((a) => a === null).length;
  const correctCount = questions.filter((q, i) => answers[i] === correctValue(q)).length;

  const choose = (index: number, value: string): void => {
    if (checked) return;
    setAnswers((current) => current.map((a, i) => (i === index ? value : a)));
  };

  const check = (): void => {
    setChecked(true);
    onChecked(correctCount, questions.length, answers);
  };

  const retry = (): void => {
    setAnswers(questions.map(() => null));
    setChecked(false);
    onRetry?.();
  };

  const label = (question: QuizQuestion, value: string): string =>
    question.type === 'mcq' ? question.options[Number(value)] : t.quiz.tfng[value as (typeof TFNG_OPTIONS)[number]];

  return (
    <div className="quiz">
      {questions.map((question, index) => {
        const values = question.type === 'mcq' ? question.options.map((_, i) => String(i)) : [...TFNG_OPTIONS];
        const isRight = answers[index] === correctValue(question);

        return (
          <Card key={index} padding="md" className={`quiz-q ${checked ? (isRight ? 'quiz-q--right' : 'quiz-q--wrong') : ''}`}>
            <fieldset className="quiz-q__set">
              <legend className="quiz-q__prompt">
                <span className="quiz-q__number">{t.quiz.question(index + 1, questions.length)}</span>
                <span lang="en">
                  <Prompt text={question.prompt} />
                </span>
              </legend>
              <div className={`quiz-q__options ${question.type === 'tfng' ? 'quiz-q__options--row' : ''}`}>
                {values.map((value, optionIndex) => {
                  const selected = answers[index] === value;
                  const isAnswer = checked && value === correctValue(question);
                  return (
                    <label
                      key={value}
                      className={`quiz-opt ${selected ? 'quiz-opt--selected' : ''} ${isAnswer ? 'quiz-opt--answer' : ''} ${checked && selected && !isAnswer ? 'quiz-opt--miss' : ''}`}
                    >
                      <input
                        type="radio"
                        className="visually-hidden"
                        name={`q-${index}`}
                        value={value}
                        checked={selected}
                        onChange={() => choose(index, value)}
                        disabled={checked}
                      />
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
              <div className="quiz-q__explain">
                <strong>{isRight ? t.quiz.correct : t.quiz.incorrect}</strong>
                {!isRight && <span> · {t.quiz.correctAnswer(label(question, correctValue(question)))}</span>}
                <p lang="en">{question.explanation}</p>
              </div>
            )}
          </Card>
        );
      })}

      <div className="quiz__footer">
        {checked ? (
          <>
            <Banner tone={correctCount / questions.length >= 0.8 ? 'success' : 'info'}>
              {t.quiz.score(correctCount, questions.length)}
            </Banner>
            <Button variant="secondary" icon="sparkles" onClick={retry}>
              {t.quiz.tryAgain}
            </Button>
          </>
        ) : (
          <>
            <Button icon="check" onClick={check} disabled={unanswered > 0}>
              {t.quiz.check}
            </Button>
            {unanswered > 0 && <span className="quiz__hint">{t.quiz.answerAll(unanswered)}</span>}
          </>
        )}
      </div>
    </div>
  );
};
