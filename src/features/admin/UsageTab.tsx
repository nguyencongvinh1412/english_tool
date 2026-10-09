/**
 * UsageTab
 * AI requests per day and per learner over a chosen period
 */
import type React from 'react';
import { useMemo, useState } from 'react';
import { Banner, Card, EmptyState, Select, Spinner, StatTile } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { adminApi } from './adminApi';
import { useAsync } from './useAsync';

const PERIODS = [7, 30, 90];

export const UsageTab: React.FC = () => {
  const { t, formatDate } = useI18n();
  const [days, setDays] = useState(30);
  const { data, error, isLoading } = useAsync(() => adminApi.usage(days), [days]);

  const summary = useMemo(() => {
    const byDay = new Map<string, number>();
    const byUser = new Map<string, number>();
    let total = 0;

    for (const row of data?.usage ?? []) {
      total += row.requests;
      byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.requests);
      byUser.set(row.email, (byUser.get(row.email) ?? 0) + row.requests);
    }

    const sortDesc = (entries: [string, number][]) => entries.sort((a, b) => b[1] - a[1]);
    return {
      total,
      days: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      users: sortDesc([...byUser.entries()]).slice(0, 10),
    };
  }, [data]);

  const maxDay = Math.max(1, ...summary.days.map(([, n]) => n));
  const maxUser = Math.max(1, ...summary.users.map(([, n]) => n));

  return (
    <div className="usage">
      <div className="admin__toolbar">
        <label className="usage__period">
          <span className="visually-hidden">{t.admin.usage.days(days)}</span>
          <Select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {PERIODS.map((period) => (
              <option key={period} value={period}>
                {t.admin.usage.days(period)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {isLoading && !data && <div className="admin__loading"><Spinner size={32} label={t.common.loading} /></div>}
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      {data && summary.total === 0 && <EmptyState icon="chart" title={t.admin.tabs.usage}>{t.admin.usage.empty}</EmptyState>}

      {data && summary.total > 0 && (
        <div className="usage__grid">
          <StatTile icon="bolt" tone="xp" value={summary.total} label={t.admin.usage.total} />

          <Card padding="lg">
            <h3 className="usage__title">{t.admin.usage.byUser}</h3>
            <ul className="bar-list">
              {summary.users.map(([email, count]) => (
                <li key={email} className="bar-list__row">
                  <span className="bar-list__label">{email}</span>
                  <span className="bar-list__track">
                    <span className="bar-list__bar" style={{ width: `${(count / maxUser) * 100}%` }} />
                  </span>
                  <span className="bar-list__value">{count}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card padding="lg">
            <h3 className="usage__title">{t.admin.usage.byDay}</h3>
            <ul className="bar-list">
              {summary.days.map(([day, count]) => (
                <li key={day} className="bar-list__row">
                  <span className="bar-list__label">{formatDate(day)}</span>
                  <span className="bar-list__track">
                    <span className="bar-list__bar bar-list__bar--day" style={{ width: `${(count / maxDay) * 100}%` }} />
                  </span>
                  <span className="bar-list__value">{count}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
};
