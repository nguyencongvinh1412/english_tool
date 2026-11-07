/**
 * DepthProgressBlock
 * A block of the Progress page: how deep the learner's words are (stages), how many they used without a hint, and what
 * to do about the weakest ones. Shown only once a word has been studied in depth.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Card, LinkButton } from '@/design';
import { ROUTES } from '@/app/routes';
import { useI18n } from '@/i18n/I18nProvider';
import { ASPECTS, deepWordApi, type DeepStats } from '@/shared/deepWordApi';
import './deepword.css';

export const DepthProgressBlock: React.FC = () => {
  const { t } = useI18n();
  const d = t.deepWord;
  const [stats, setStats] = useState<DeepStats | null>(null);

  useEffect(() => {
    deepWordApi.stats().then(setStats).catch(() => undefined);
  }, []);

  if (!stats || stats.total === 0) return null;
  const max = Math.max(1, ...stats.stages);
  const weak = ASPECTS.filter((a) => stats.weak[a] > 0);

  return (
    <Card padding="lg" className="dw__card reveal">
      <h2 className="dw__h">{d.progress.title}</h2>
      <div className="dw__core">
        <p className="dw__kicker">{d.progress.unaided}</p>
        <strong>
          {stats.unaided.ok} / {stats.unaided.of}
        </strong>
        <span className="dw__muted">{d.progress.unaidedBody(stats.unaided.ok, stats.unaided.of)}</span>
      </div>

      <div className="dw__section">
        <h3 className="dw__h">{d.progress.funnel}</h3>
        <ul className="dw-funnel">
          {d.stageNames.map((name, i) => (
            <li key={name}>
              <span>{name}</span>
              <span className="dw-funnel__bar" aria-hidden="true">
                <span style={{ width: `${(stats.stages[i] / max) * 100}%` }} />
              </span>
              <span>{d.stages.words(stats.stages[i])}</span>
            </li>
          ))}
        </ul>
      </div>

      {weak.length > 0 && (
        <div className="dw__section">
          <h3 className="dw__h">{d.progress.weak}</h3>
          <ul className="dw__list">
            {weak.map((a) => (
              <li key={a} className="dw__item">
                {d.progress.weakItem(d.aspects[a], stats.weak[a])}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.recognisedOnly > 0 && <p className="dw__note">{d.progress.action(stats.recognisedOnly)}</p>}
      <div>
        <LinkButton to={`${ROUTES.VOCABULARY}?tab=deep`} variant="secondary" size="sm">
          {d.progress.open}
        </LinkButton>
      </div>
    </Card>
  );
};
