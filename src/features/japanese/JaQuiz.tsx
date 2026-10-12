/**
 * Shared Japanese practice components: multiple-choice quiz and the word lookup sheet
 */
import type React from 'react';
import { useState } from 'react';
import { Banner, Button, Card, Icon, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { JaText } from '@/shared/ja/JaText';
import type { JaMcq, JaWordDefinition } from '@/shared/contentApi';
import '@/features/practice/practice.css';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Questions in Japanese with furigana; all answered, then checked at once
 */
export const JaQuiz: React.FC<{ questions: JaMcq[]; onChecked: (correct: number, total: number) => void }> = ({ questions, onChecked }) => {
  const { t, locale } = useI18n();
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [checked, setChecked] = useState(false);

  const unanswered = answers.filter((a) => a === null).length;
  const correctCount = questions.filter((q, i) => answers[i] === q.answerIndex).length;

  const check = () => {
    setChecked(true);
    onChecked(correctCount, questions.length);
  };

  const retry = () => {
    setAnswers(questions.map(() => null));
    setChecked(false);
  };

  return (
    <div className="quiz">
      {questions.map((question, index) => {
        const isRight = answers[index] === question.answerIndex;
        return (
          <Card key={index} padding="md" className={`quiz-q ${checked ? (isRight ? 'quiz-q--right' : 'quiz-q--wrong') : ''}`}>
            <fieldset className="quiz-q__set">
              <legend className="quiz-q__prompt">
                <span className="quiz-q__number">{t.quiz.question(index + 1, questions.length)}</span>
                <JaText text={question.prompt} />
              </legend>
              <div className="quiz-q__options">
                {question.options.map((option, optionIndex) => {
                  const selected = answers[index] === optionIndex;
                  const isAnswer = checked && optionIndex === question.answerIndex;
                  return (
                    <label
                      key={optionIndex}
                      className={`quiz-opt ${selected ? 'quiz-opt--selected' : ''} ${isAnswer ? 'quiz-opt--answer' : ''} ${checked && selected && !isAnswer ? 'quiz-opt--miss' : ''}`}
                    >
                      <input
                        type="radio"
                        className="visually-hidden"
                        name={`ja-q-${index}`}
                        checked={selected}
                        disabled={checked}
                        onChange={() => setAnswers((current) => current.map((a, i) => (i === index ? optionIndex : a)))}
                      />
                      <span className="quiz-opt__letter">{LETTERS[optionIndex]}</span>
                      <JaText text={option} />
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
                <p>{question.explanation[locale]}</p>
              </div>
            )}
          </Card>
        );
      })}

      <div className="quiz__footer">
        {checked ? (
          <>
            <Banner tone={correctCount / questions.length >= 0.8 ? 'success' : 'info'}>{t.quiz.score(correctCount, questions.length)}</Banner>
            <Button variant="secondary" icon="arrowLeft" onClick={retry}>
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

export type LookupState = JaWordDefinition | 'loading' | { error: unknown };

/**
 * Meaning of a tapped Japanese word: reading, Sino-Vietnamese, meanings and an example
 */
export const JaDefinitionSheet: React.FC<{ word: string; state: LookupState; onClose: () => void }> = ({ word, state, onClose }) => {
  const { t, locale } = useI18n();
  return (
    <div className="define" role="dialog" aria-label={word}>
      <button type="button" className="define__close" onClick={onClose} aria-label={t.common.close}>
        <Icon name="x" size={18} />
      </button>
      {state === 'loading' ? (
        <p className="define__loading">
          <Spinner size={18} /> {t.reading.defining}
        </p>
      ) : 'error' in state ? (
        <Banner tone="danger">{errorMessage(state.error, t)}</Banner>
      ) : (
        <>
          <p className="define__word">
            <span lang="ja">{state.word}</span> <span className="define__ipa" lang="ja">{state.reading}</span>{' '}
            <span className="define__pos">{state.partOfSpeech}</span>
          </p>
          {state.hanViet && (
            <p className="define__hanviet">
              <strong>{t.jaPractice.hanViet}:</strong> {state.hanViet}
            </p>
          )}
          <p>{locale === 'vi' ? state.translation : state.meaning}</p>
          {locale === 'vi' && <p className="define__translation" lang="en">{state.meaning}</p>}
          <p className="define__example">
            <strong>{t.reading.example}:</strong> <JaText text={state.example} />
            <br />
            <span className="define__translation">{state.exampleTranslation}</span>
          </p>
        </>
      )}
    </div>
  );
};
