/**
 * GrammarPractice
 * Six questions on one grammar point, one at a time with instant feedback. The score sets when the
 * point comes back for review.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import './grammar.css';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { grammarApi, type DrillAnswer, type Mastery, type PracticeItem } from '@/shared/grammarApi';
import { GrammarQuestions } from './GrammarQuestions';

export const GrammarPractice: React.FC<{ pointId: string; onClose: (mastery?: Mastery) => void }> = ({ pointId, onClose }) => {
  const { t, formatDate } = useI18n();
  const { celebrate } = useProgress();
  const [set, setSet] = useState<{ id: string; items: PracticeItem[] } | null>(null);
  const [correct, setCorrect] = useState(0);
  const [result, setResult] = useState<{ mastery: Mastery; dueAt: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    grammarApi
      .practice(pointId)
      .then(({ set: loaded }) => {
        startedAt.current = Date.now();
        setSet(loaded);
      })
      .catch(setError);
  }, [pointId]);

  const finish = async (answers: DrillAnswer[]) => {
    if (!set) return;
    const right = answers.filter((a) => a.correct).length;
    try {
      const saved = await grammarApi.result(pointId, set.id, right, set.items.length, Math.round((Date.now() - startedAt.current) / 1000));
      celebrate(saved.xpEarned);
      setCorrect(right);
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
  if (!set) {
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

  return <GrammarQuestions items={set.items} onFinish={finish} onClose={() => onClose()} />;
};
