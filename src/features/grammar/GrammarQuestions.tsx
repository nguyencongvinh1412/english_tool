/**
 * GrammarQuestions
 * Grammar questions one at a time with instant feedback; reports every answer when the last one is done
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Icon, ProgressBar } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import '@/features/vocab/vocab.css';
import './grammar.css';
import { normalizeAnswer, type DrillAnswer, type PracticeItem } from '@/shared/grammarApi';

const LETTERS = ['A', 'B', 'C', 'D'];

interface GrammarQuestionsProps {
  items: PracticeItem[];
  /** Called once with an answer for every question */
  onFinish: (answers: DrillAnswer[]) => void | Promise<void>;
  onClose: () => void;
}

export const GrammarQuestions: React.FC<GrammarQuestionsProps> = ({ items, onFinish, onClose }) => {
  const { t, locale } = useI18n();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<DrillAnswer | null>(null);
  const [answers, setAnswers] = useState<DrillAnswer[]>([]);
  const [typed, setTyped] = useState('');
  const [finishing, setFinishing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const item = items[index];
  useEffect(() => {
    if (item?.type === 'gap') inputRef.current?.focus();
  }, [item]);

  if (!item) return null;

  const check = (given: string, correct: boolean) => {
    if (!answer) setAnswer({ given, correct });
  };

  const next = async () => {
    if (!answer || finishing) return;
    const all = [...answers, answer];
    if (index < items.length - 1) {
      setAnswers(all);
      setIndex((i) => i + 1);
      setAnswer(null);
      setTyped('');
      return;
    }
    setFinishing(true);
    try {
      await onFinish(all);
    } finally {
      setFinishing(false);
    }
  };

  return (
    <Card padding="lg" className="grammar-practice">
      <div className="grammar-practice__top">
        <ProgressBar value={(index / items.length) * 100} tone="reading" size="sm" label={t.vocab.progress} />
        <span>
          {index + 1}/{items.length}
        </span>
        <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label={t.common.close} />
      </div>

      <p className="grammar-practice__prompt" lang="en">
        {item.prompt.split(/(_{3,})/).map((piece, i) =>
          /^_{3,}$/.test(piece) ? (
            <span key={i} className="grammar-practice__blank">
              {answer && item.type === 'gap' ? item.answers[0] : '_____'}
            </span>
          ) : (
            piece
          )
        )}
        {item.type === 'gap' && item.hint && <span className="grammar-practice__hint"> {item.hint}</span>}
      </p>

      {item.type === 'choice' ? (
        <div className="en-choices">
          {item.options.map((option, i) => {
            const state = !answer ? '' : i === item.answerIndex ? 'right' : option === answer.given ? 'wrong' : '';
            return (
              <button
                key={i}
                type="button"
                className={`en-choice ${state ? `en-choice--${state}` : ''}`}
                onClick={() => check(option, i === item.answerIndex)}
                disabled={Boolean(answer)}
                lang="en"
              >
                <kbd>{LETTERS[i]}</kbd>
                <span>{option}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="en-type"
          onSubmit={(e) => {
            e.preventDefault();
            if (!typed.trim() || answer) return;
            check(typed.trim(), item.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(typed)));
          }}
        >
          <input
            ref={inputRef}
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={Boolean(answer)}
            placeholder={t.grammar.typeAnswer}
            aria-label={t.grammar.typeAnswer}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            lang="en"
          />
          <Button type="submit" disabled={!typed.trim() || Boolean(answer)}>
            {t.enVocab.check}
          </Button>
        </form>
      )}

      {answer && (
        <div className={`grammar-practice__feedback grammar-practice__feedback--${answer.correct ? 'right' : 'wrong'}`}>
          <p>
            <Icon name={answer.correct ? 'check' : 'x'} size={18} />{' '}
            {answer.correct ? t.enVocab.right : item.type === 'gap' ? t.grammar.answerWas(item.answers[0]) : t.grammar.answerWas(item.options[item.answerIndex])}
          </p>
          <p>{item.explanation[locale]}</p>
          <Button icon="chevronRight" onClick={() => void next()} disabled={finishing}>
            {index < items.length - 1 ? t.enVocab.continue : t.grammar.finish}
          </Button>
        </div>
      )}
    </Card>
  );
};
