/**
 * GrammarPage
 * English grammar map: search, an interactive map on wide screens and a collapsible list everywhere
 */
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, PageHeader, Segmented, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { grammarApi, grammarPath, type GrammarMap as MapData, type GrammarMapPoint } from '@/shared/grammarApi';
import { GrammarMap } from './GrammarMap';
import './grammar.css';

type View = 'map' | 'list';
const WIDE = '(min-width: 900px)';

/** Lower case without Vietnamese accents, for search */
const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

const PointLink: React.FC<{ point: GrammarMapPoint }> = ({ point }) => {
  const { locale } = useI18n();
  return (
    <Link to={grammarPath(point.id)} className={`grammar-item ${point.ready ? '' : 'grammar-item--empty'}`}>
      <span className="grammar-item__title">{point.title[locale]}</span>
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

  useEffect(() => {
    grammarApi.map().then(setData).catch(setError);
  }, []);

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
              <PointLink key={p.id} point={p} />
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
          <GrammarMap data={data} />
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
                    <PointLink key={p.id} point={p} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
};
