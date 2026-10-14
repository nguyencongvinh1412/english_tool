/**
 * GrammarPage
 * English grammar map: search, an interactive map on wide screens and a collapsible list everywhere
 */
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, Card, Icon, PageHeader, Segmented, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { comparePath, decidePath, grammarApi, grammarPath, type GrammarMap as MapData, type GrammarMapPoint, type GrammarMistake, type Mastery, type PointProgress } from '@/shared/grammarApi';
import { DECISION_TREES } from './decisions';
import { GrammarAsk } from './GrammarAsk';
import { GrammarMap } from './GrammarMap';
import './grammar.css';

type View = 'map' | 'list';
const WIDE = '(min-width: 900px)';

/** Lower case without Vietnamese accents, for search */
const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

const PointLink: React.FC<{ point: GrammarMapPoint; mastery?: Mastery }> = ({ point, mastery }) => {
  const { locale } = useI18n();
  return (
    <Link to={grammarPath(point.id)} className={`grammar-item ${point.ready ? '' : 'grammar-item--empty'}`}>
      <span className="grammar-item__title">
        {mastery && mastery !== 'none' && <span className={`mastery-dot mastery-dot--${mastery}`} />}
        {point.title[locale]}
      </span>
      {locale === 'vi' && <span className="grammar-item__en">{point.title.en}</span>}
      <Badge tone="reading">{point.cefr}</Badge>
    </Link>
  );
};

export const GrammarPage: React.FC = () => {
  const { t, locale } = useI18n();
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>(() => (window.matchMedia?.(WIDE).matches ? 'map' : 'list'));
  const [progress, setProgress] = useState<PointProgress[]>([]);
  const [mistakes, setMistakes] = useState<GrammarMistake[]>([]);

  useEffect(() => {
    grammarApi.map().then(setData).catch(setError);
    grammarApi
      .progress()
      .then(({ points }) => setProgress(points))
      .catch(() => {});
    grammarApi
      .mistakes()
      .then((result) => setMistakes(result.mistakes))
      .catch(() => {});
  }, []);

  const mastery = useMemo(() => new Map(progress.map((p) => [p.pointId, p.mastery])), [progress]);
  const due = progress.filter((p) => p.due);
  const titleOf = (id: string) => data?.points.find((p) => p.id === id)?.title[locale] ?? id;
  const pairs = data?.edges.filter((e) => e.kind === 'contrast') ?? [];

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!data || q.length < 2) return null;
    return data.points.filter((p) =>
      [p.title.en, p.title.vi, p.summary?.en ?? '', p.summary?.vi ?? '', ...p.signals].some((text) => fold(text).includes(q))
    );
  }, [data, query]);

  return (
    <div className="grammar">
      <PageHeader eyebrow="Grammar" title={t.grammar.title} description={t.grammar.intro} />
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      {mistakes.length > 0 && (
        <Card padding="lg" className="grammar-mistakes-card">
          <h2>
            <Icon name="flag" size={20} /> {t.grammar.mistakesTitle}
          </h2>
          <p className="grammar__hint">{t.grammar.mistakesIntro}</p>
          <ul className="grammar-mistakes-card__list">
            {mistakes.slice(0, 6).map((m) => (
              <li key={m.pointId}>
                <Link to={grammarPath(m.pointId)} className="grammar-chip">
                  {titleOf(m.pointId)} <span>×{m.count}</span>
                </Link>
                {m.examples[0] && (
                  <span className="grammar-mistakes-card__example" lang="en">
                    <s>{m.examples[0].wrong}</s> → {m.examples[0].right}
                  </span>
                )}
                {m.urgent && <Badge tone="danger">{t.grammar.reviewNow}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {due.length > 0 && (
        <Card padding="lg" className="grammar-due">
          <h2>
            <Icon name="bolt" size={20} /> {t.grammar.dueTitle(due.length)}
          </h2>
          <div className="grammar-links__items">
            {due.map((p) => (
              <Link key={p.pointId} to={grammarPath(p.pointId)} className="grammar-chip">
                {titleOf(p.pointId)}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <GrammarAsk />

      <section className="grammar-tools">
        <h2 className="en-group__title">{t.grammar.toolsTitle}</h2>
        <div className="grammar-tools__grid">
          {DECISION_TREES.map((tree) => (
            <Link key={tree.id} to={decidePath(tree.id)} className="grammar-tool">
              <Icon name="graph" size={22} />
              <span>
                <strong>{tree.title[locale]}</strong>
                <small>{tree.intro[locale]}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grammar__tools">
        <input
          type="search"
          className="input grammar__search"
          value={query}
          placeholder={t.grammar.searchPlaceholder}
          aria-label={t.grammar.searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Segmented<View>
          label={t.grammar.view}
          value={view}
          onChange={setView}
          options={[
            { value: 'map', label: t.grammar.views.map, tone: 'reading' },
            { value: 'list', label: t.grammar.views.list, tone: 'reading' },
          ]}
        />
      </div>

      {!data ? (
        error === null && <Spinner size={30} label={t.common.loading} />
      ) : results ? (
        <section className="grammar-results" aria-live="polite">
          <p className="grammar__hint">{t.grammar.results(results.length)}</p>
          <div className="grammar-items">
            {results.map((p) => (
              <PointLink key={p.id} point={p} mastery={mastery.get(p.id)} />
            ))}
          </div>
        </section>
      ) : view === 'map' ? (
        <>
          <ul className="grammar-legend">
            <li>
              <span className="grammar-legend__line grammar-legend__line--builds" /> {t.grammar.legend.builds}
            </li>
            <li>
              <span className="grammar-legend__line grammar-legend__line--next" /> {t.grammar.links.leadsTo}
            </li>
            <li>
              <span className="grammar-legend__line grammar-legend__line--contrast" /> {t.grammar.legend.contrast}
            </li>
            <li>
              <span className="grammar-legend__line grammar-legend__line--related" /> {t.grammar.legend.related}
            </li>
            <li className="grammar__hint">{t.grammar.mapHint}</li>
          </ul>
          <GrammarMap data={data} mastery={mastery} />
        </>
      ) : (
        <div className="grammar-clusters">
          {data.clusters.map((cluster) => {
            const points = data.points.filter((p) => p.cluster === cluster.id);
            return (
              <details key={cluster.id} className="grammar-cluster" open={data.clusters.indexOf(cluster) === 0}>
                <summary>
                  <span>{cluster.title[locale]}</span>
                  <Badge tone="neutral">{points.length}</Badge>
                </summary>
                <div className="grammar-items">
                  {points.map((p) => (
                    <PointLink key={p.id} point={p} mastery={mastery.get(p.id)} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {data && pairs.length > 0 && (
        <section className="grammar-pairs">
          <h2 className="en-group__title">{t.grammar.pairsTitle}</h2>
          <div className="grammar-links__items">
            {pairs.map((pair) => (
              <Link key={`${pair.from}-${pair.to}`} to={comparePath(pair.from, pair.to)} className="grammar-chip">
                {titleOf(pair.from)} <span>{t.grammar.versus}</span> {titleOf(pair.to)}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
