/**
 * GrammarPractice
 * Six questions on one grammar point, one at a time with instant feedback. The score sets when the
 * point comes back for review.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, ProgressBar, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import '@/features/vocab/vocab.css';
import './grammar.css';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { grammarApi, normalizeAnswer, type Mastery, type PracticeItem } from '@/shared/grammarApi';

const LETTERS = ['A', 'B', 'C', 'D'];

export const GrammarPractice: React.FC<{ pointId: string; onClose: (mastery?: Mastery) => void }> = ({ pointId, onClose }) => {
  const { t, locale, formatDate } = useI18n();
  const { celebrate } = useProgress();
  const [set, setSet] = useState<{ id: string; items: PracticeItem[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<{ given: string; correct: boolean } | null>(null);
  const [typed, setTyped] = useState('');
  const [correct, setCorrect] = useState(0);
  const [result, setResult] = useState<{ mastery: Mastery; dueAt: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const startedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    grammarApi
      .practice(pointId)
      .then(({ set: loaded }) => {
        startedAt.current = Date.now();
        setSet(loaded);
      })
      .catch(setError);
  }, [pointId]);

  const item = set?.items[index];
  useEffect(() => {
    if (item?.type === 'gap') inputRef.current?.focus();
  }, [item]);

  const check = (given: string, isRight: boolean) => {
    if (answer) return;
    setAnswer({ given, correct: isRight });
    if (isRight) setCorrect((n) => n + 1);
  };

  const next = async () => {
    if (!set) return;
    if (index < set.items.length - 1) {
      setIndex((i) => i + 1);
      setAnswer(null);
      setTyped('');
      return;
    }
    try {
      const saved = await grammarApi.result(pointId, set.id, correct, set.items.length, Math.round((Date.now() - startedAt.current) / 1000));
      celebrate(saved.xpEarned);
      setResult({ mastery: saved.progress.mastery, dueAt: saved.progress.dueAt });
    } catch (err) {
      setError(err);
    }
  };

  if (error !== null) {
    return (
      <Card padding="lg" className="grammar-practice">
        <Banner tone="danger">{errorMessage(error, t)}</Banner>
        <Button variant="ghost" onClick={() => onClose()}>
          {t.common.close}
        </Button>
      </Card>
    );
  }
  if (!set || !item) {
    return (
      <Card padding="lg" className="grammar-practice">
        <Spinner size={28} label={t.grammar.preparing} />
      </Card>
    );
  }

  if (result) {
    return (
      <Card padding="lg" className="grammar-practice grammar-practice--done">
        <Icon name="check" size={36} />
        <h2>{t.grammar.practiceDone(correct, set.items.length)}</h2>
        <p>
          <Badge tone={result.mastery === 'mastered' ? 'success' : result.mastery === 'good' ? 'reading' : 'warning'}>{t.grammar.mastery[result.mastery]}</Badge>{' '}
          {t.grammar.nextReview(formatDate(result.dueAt))}
        </p>
        <Button onClick={() => onClose(result.mastery)}>{t.common.close}</Button>
      </Card>
    );
  }

  const explanation = item.explanation[locale];
  return (
    <Card padding="lg" className="grammar-practice">
      <div className="grammar-practice__top">
        <ProgressBar value={(index / set.items.length) * 100} tone="reading" size="sm" label={t.vocab.progress} />
        <span>
          {index + 1}/{set.items.length}
        </span>
        <Button variant="ghost" size="sm" icon="x" onClick={() => onClose()} aria-label={t.common.close} />
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
          <p>{explanation}</p>
          <Button icon="chevronRight" onClick={() => void next()}>
            {index < set.items.length - 1 ? t.enVocab.continue : t.grammar.finish}
          </Button>
        </div>
      )}
    </Card>
  );
};
