/**
 * GrammarPage
 * English grammar map: search, an interactive map on wide screens and a collapsible list everywhere
 */
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, Button, Card, Icon, LinkButton, Segmented, Skeleton, Tag } from '@/design';
import { ROUTES } from '@/app/routes';
import { hasRoadmap, roadmapApi } from '@/shared/roadmapApi';
import { todayApi } from '@/shared/todayApi';
import { fromToday } from '@/features/today/todayTasks';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { comparePath, decidePath, drillPath, grammarApi, grammarPath, type GrammarMap as MapData, type GrammarMapPoint, type GrammarMistake, type Mastery, type PointProgress } from '@/shared/grammarApi';
import { DECISION_TREES } from './decisions';
import { GrammarAsk } from './GrammarAsk';
import { GrammarTree } from './tree/GrammarTree';
import './grammar.css';

type View = 'map' | 'list';
const WIDE = '(min-width: 900px)';

/** Lower case without Vietnamese accents, for search */
const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

const SYMBOL: Record<Mastery, string> = { none: '○', learning: '◔', good: '◕', mastered: '●' };
const BADGE_TONE = { none: 'neutral', learning: 'neutral', good: 'brand', mastered: 'success' } as const;

const PointLink: React.FC<{ point: GrammarMapPoint; mastery?: Mastery; inRoadmap?: boolean }> = ({ point, mastery, inRoadmap }) => {
  const { locale, t } = useI18n();
  const level: Mastery = mastery ?? 'none';
  return (
    <Link to={grammarPath(point.id)} className={`grammar-item ${point.ready ? '' : 'grammar-item--empty'}`}>
      <span className="grammar-item__title">
        {point.title[locale]}
        {inRoadmap && <Tag tone="brand">{t.enVocab.fromRoadmap}</Tag>}
      </span>
      {locale === 'vi' && <span className="grammar-item__en">{point.title.en}</span>}
      <span className="grammar-item__badges">
        <Badge tone={BADGE_TONE[level]}>
          <span aria-hidden="true">{SYMBOL[level]}</span> {t.grammar.mastery[level]}
        </Badge>
        <Badge tone="reading">{point.cefr}</Badge>
      </span>
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
  const navigate = useNavigate();
  /** CEFR levels of the roadmap's stages (their points are marked and their clusters opened) */
  const [roadmapLevels, setRoadmapLevels] = useState<string[]>([]);
  /** The grammar point Today suggests, with its minutes */
  const [suggested, setSuggested] = useState<{ pointId: string; minutes: number } | null>(null);

  useEffect(() => {
    grammarApi.map().then(setData).catch(setError);
    grammarApi
      .progress()
      .then(({ points }) => setProgress(points))
      .catch(() => {});
    roadmapApi
      .get()
      .then((data) => setRoadmapLevels(hasRoadmap(data) ? [...new Set(data.roadmap.stages.map((stage) => stage.level))] : []))
      .catch(() => {});
    todayApi
      .get(45)
      .then((today) => {
        const task = today.tasks.find((x) => x.type === 'learn-grammar' && !x.done);
        setSuggested(task && task.type === 'learn-grammar' ? { pointId: task.pointId, minutes: task.minutes } : null);
      })
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

  const suggestedPoint = suggested ? data?.points.find((p) => p.id === suggested.pointId) : undefined;
  const learnSuggested = () => suggested && navigate(fromToday(grammarPath(suggested.pointId), suggested.minutes));

  return (
    <div className="grammar">
      <header className="plan__head">
        <Link to={ROUTES.PRACTICE} className="plan__back" aria-label={t.nav.practice}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <h1>{t.grammar.title}</h1>
      </header>
      {error !== null && <Banner tone="warning">{errorMessage(error, t)}</Banner>}

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

      {suggested && suggestedPoint && (
        <Card padding="md" className="grammar-today">
          <div>
            <span className="grammar-today__label">{t.grammar.todayLabel}</span>
            <strong className="grammar-today__title">{t.grammar.todayLine(suggestedPoint.title[locale], suggested.minutes)}</strong>
          </div>
          <Button size="lg" onClick={learnSuggested} className="grammar-today__cta">
            {t.grammar.learnThis}
          </Button>
        </Card>
      )}

      {!data ? (
        error === null && <Skeleton height={140} label={t.common.loading} />
      ) : results ? (
        <section className="grammar-results" aria-live="polite">
          <p className="grammar__hint">{t.grammar.results(results.length)}</p>
          <div className="grammar-items">
            {results.map((p) => (
              <PointLink key={p.id} point={p} mastery={mastery.get(p.id)} inRoadmap={roadmapLevels.includes(p.cefr)} />
            ))}
          </div>
        </section>
      ) : view === 'map' ? (
        <GrammarTree data={data} mastery={mastery} />
      ) : (
        <div className="grammar-clusters">
          {data.clusters.map((cluster) => {
            const points = data.points.filter((p) => p.cluster === cluster.id);
            return (
              <details key={cluster.id} className="grammar-cluster" open={roadmapLevels.length > 0 ? points.some((p) => roadmapLevels.includes(p.cefr)) : data.clusters.indexOf(cluster) === 0}>
                <summary>
                  <span>{cluster.title[locale]}</span>
                  <span className="grammar-cluster__count">{t.grammar.clusterCount(points.length)}</span>
                </summary>
                <div className="grammar-items">
                  {points.map((p) => (
                    <PointLink key={p.id} point={p} mastery={mastery.get(p.id)} inRoadmap={roadmapLevels.includes(p.cefr)} />
                  ))}
                </div>
                <Link to={drillPath({ cluster: cluster.id })} className="grammar-cluster__drill">
                  <Icon name="sparkles" size={16} /> {t.grammar.drill.clusterLink}
                </Link>
              </details>
            );
          })}
        </div>
      )}


      <GrammarAsk />

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

      <Card padding="md" className="grammar-practice-cta">
        <span>{t.grammar.drill.cta}</span>
        <LinkButton icon="sparkles" to={drillPath()}>
          {t.grammar.drill.make}
        </LinkButton>
      </Card>

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
          <Link to={`${ROUTES.GRAMMAR}/timeline`} className="grammar-tool">
            <Icon name="graph" size={22} />
            <span>
              <strong>{t.grammar.timelineTool}</strong>
              <small>{t.grammar.timelineSub}</small>
            </span>
          </Link>
        </div>
      </section>

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
      {suggested && suggestedPoint && (
        <div className="grammar__cta">
          <Button size="lg" block onClick={learnSuggested}>
            {t.grammar.learnSuggested}
          </Button>
        </div>
      )}
    </div>
  );
};
