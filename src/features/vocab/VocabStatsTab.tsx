/**
 * VocabStatsTab
 * English vocabulary: the reviews due over the next 7 days and the words that keep being forgotten (S10)
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Banner, Card, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import '@/features/grammar/grammar.css';
import { enVocabApi, type VocabStats } from '@/shared/enVocabApi';

export const VocabStatsTab: React.FC<{ onReviewHard?: () => void }> = ({ onReviewHard }) => {
  const { t } = useI18n();
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    enVocabApi.stats().then(setStats).catch(setError);
  }, []);

  if (error !== null) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!stats) return <Spinner size={28} label={t.common.loading} />;

  const peak = Math.max(1, ...stats.forecast);
  return (
    <div className="vocab-stats">
      <Card padding="lg">
        <h2 className="dash-card-title">{t.wordBank.statsForecast}</h2>
        <div className="vocab-forecast" role="img" aria-label={stats.forecast.map((n, day) => `${t.wordBank.forecastDay(day)}: ${n}`).join(', ')}>
          {stats.forecast.map((count, day) => (
            <div key={day} className="vocab-forecast__day">
              <span className="vocab-forecast__count">{count}</span>
              <span className="vocab-forecast__bar" style={{ height: `${(count / peak) * 100}%` }} />
              <span className="vocab-forecast__label">{t.wordBank.forecastDay(day)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <h2 className="dash-card-title">{t.wordBank.statsHard}</h2>
        {stats.hard.length === 0 ? (
          <p className="exams__empty">{t.wordBank.hardEmpty}</p>
        ) : (
          <>
            <p lang="en" className="vocab-stats__leeches">
              {stats.hard.map((word) => word.term).join(' · ')}
            </p>
            {onReviewHard && (
              <button type="button" className="tool-footer__link" onClick={onReviewHard}>
                {t.wordBank.reviewHard}
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
};
