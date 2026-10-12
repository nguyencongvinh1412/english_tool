/**
 * VocabStatsTab
 * English vocabulary progress: totals, words per CEFR level, the next week's reviews and hard words
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Badge, Banner, Card, ProgressBar, Spinner, StatTile } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { enVocabApi, meaningOf, type VocabStats } from '@/shared/enVocabApi';

export const VocabStatsTab: React.FC = () => {
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
      <div className="vocab-stats__tiles">
        <StatTile icon="book" tone="listening" value={stats.totals.seen} label={t.wordBank.statsSeen} />
        <StatTile icon="check" tone="xp" value={stats.totals.mastered} label={t.wordBank.statsMastered} />
        <StatTile icon="plus" tone="exam" value={stats.totals.saved} label={t.wordBank.statsSaved} />
      </div>

      <div className="vocab-stats__grid">
        <Card padding="lg">
          <h2 className="dash-card-title">{t.wordBank.statsLevels}</h2>
          <ul className="vocab-stats__levels">
            {stats.byLevel.map((row) => (
              <li key={row.level}>
                <Badge tone="reading">{row.level}</Badge>
                <ProgressBar value={(row.seen / Math.max(1, row.total)) * 100} tone="reading" size="sm" label={row.level} />
                <span>
                  {row.seen}/{row.total}
                </span>
              </li>
            ))}
          </ul>
        </Card>

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
      </div>

      <Card padding="lg">
        <h2 className="dash-card-title">{t.wordBank.statsHard}</h2>
        {stats.hard.length === 0 ? (
          <p className="exams__empty">{t.wordBank.hardEmpty}</p>
        ) : (
          <ul className="vocab-stats__hard">
            {stats.hard.map((word) => (
              <li key={word.id}>
                <strong lang="en">{word.term}</strong>
                <span>{meaningOf(word)}</span>
                <Badge tone="danger">{t.wordBank.lapses(word.lapses)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
