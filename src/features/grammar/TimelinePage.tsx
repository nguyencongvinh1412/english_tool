/**
 * TimelinePage
 * Pick a tense and see it on the axis past → now → future, with what it means and an example
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banner, Card, LinkButton, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { drillPath, grammarApi, grammarPath, type GrammarMap, type GrammarPoint } from '@/shared/grammarApi';
import { TenseTimeline } from './TenseTimeline';
import { ToolFooter, ToolHeader } from './ToolChrome';
import './grammar.css';

export const TimelinePage: React.FC = () => {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [map, setMap] = useState<GrammarMap | null>(null);
  const [point, setPoint] = useState<GrammarPoint | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    grammarApi.map().then(setMap).catch(setError);
  }, []);

  const tenses = map?.points.filter((p) => p.hasTimeline) ?? [];
  const selected = tenses.find((p) => p.id === params.get('t')) ?? tenses.find((p) => p.id === 'present-perfect') ?? tenses[0];
  const selectedId = selected?.id;

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    grammarApi
      .point(selectedId)
      .then(({ point: loaded }) => alive && setPoint(loaded))
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [selectedId]);

  if (error !== null) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!map) return <Spinner size={30} label={t.common.loading} />;

  const shown = point && point.id === selectedId ? point : null;
  const example = shown?.content?.forms[0]?.example;

  return (
    <div className="tool-page">
      <ToolHeader title={t.grammar.timelineTool} subtitle={t.grammar.timelineSub} />
      <Card padding="lg">
        <div className="tool-chips" role="group" aria-label={t.grammar.timelineTool}>
          {tenses.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tool-chip ${p.id === selectedId ? 'tool-chip--on' : ''}`}
              aria-pressed={p.id === selectedId}
              onClick={() => setParams({ t: p.id }, { replace: true })}
            >
              {p.title[locale]}
            </button>
          ))}
        </div>
        {shown?.timeline ? (
          <TenseTimeline timeline={shown.timeline} label={shown.title[locale]} />
        ) : (
          <Spinner size={22} label={t.common.loading} />
        )}
        {shown?.content && (
          <p className="tool-timeline__text">
            <strong>{shown.title[locale]}:</strong> {shown.content.summary[locale]}
            {example && (
              <>
                {' '}
                <em lang="en">{example.en}</em>
              </>
            )}
          </p>
        )}
      </Card>
      <ToolFooter>
        <LinkButton size="lg" icon="bolt" to={drillPath({ point: selectedId })}>
          {t.grammar.practiceTense}
        </LinkButton>
        {selectedId && (
          <LinkButton variant="ghost" to={grammarPath(selectedId)}>
            {t.grammar.openPoint}
          </LinkButton>
        )}
      </ToolFooter>
    </div>
  );
};
