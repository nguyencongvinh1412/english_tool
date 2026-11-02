/**
 * GrammarDrillPage
 * Build a practice set from the grammar points (and uses of them) the learner picks, do it, and see
 * the result per point
 */
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Banner, Button, Card, Icon, PageHeader, Segmented, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import {
  DRILL_COUNTS,
  MAX_DRILL_TARGETS,
  MIN_PER_TARGET,
  grammarApi,
  grammarPath,
  type DrillAnswer,
  type DrillItem,
  type DrillPointResult,
  type GrammarMap,
} from '@/shared/grammarApi';
import { GrammarQuestions } from './GrammarQuestions';
import './grammar.css';

type Phase = { name: 'choose' } | { name: 'building' } | { name: 'doing'; id: string; items: DrillItem[] } | { name: 'done'; results: DrillPointResult[]; correct: number; total: number };

const now = () => Date.now();

export const GrammarDrillPage: React.FC = () => {
  const { t, locale, formatDate } = useI18n();
  const { celebrate } = useProgress();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [map, setMap] = useState<GrammarMap | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'choose' });
  /** Chosen points and, per point, the chosen uses (none chosen = the whole point) */
  const [chosen, setChosen] = useState<Map<string, number[]>>(new Map());
  /** Titles of the uses of a point, loaded when its list is opened */
  const [uses, setUses] = useState<Record<string, string[]>>({});
  const [count, setCount] = useState<(typeof DRILL_COUNTS)[number]>(10);
  const startedAt = useRef(0);
  const d = t.grammar.drill;

  useEffect(() => {
    grammarApi
      .map()
      .then((data) => {
        setMap(data);
        const point = params.get('point');
        const cluster = params.get('cluster');
        const ids = point
          ? data.points.filter((p) => p.id === point).map((p) => p.id)
          : cluster
            ? data.points.filter((p) => p.cluster === cluster).map((p) => p.id)
            : [];
        setChosen(new Map(ids.slice(0, MAX_DRILL_TARGETS).map((id) => [id, []])));
      })
      .catch(setError);
  }, [params]);

  const titleOf = (id: string) => map?.points.find((p) => p.id === id)?.title[locale] ?? id;
  const full = chosen.size >= MAX_DRILL_TARGETS;
  const minCount = chosen.size * MIN_PER_TARGET;
  // The smallest size that fits every chosen point
  const effectiveCount = DRILL_COUNTS.find((n) => n >= Math.max(count, minCount)) ?? DRILL_COUNTS[DRILL_COUNTS.length - 1];
  const clusterOfChoice = useMemo(() => {
    const first = [...chosen.keys()][0];
    return map?.points.find((p) => p.id === first)?.cluster;
  }, [chosen, map]);

  const toggle = (id: string) => {
    setChosen((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_DRILL_TARGETS) next.set(id, []);
      return next;
    });
  };

  const toggleUse = (id: string, index: number) => {
    setChosen((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? [];
      next.set(id, current.includes(index) ? current.filter((i) => i !== index) : [...current, index].sort((a, b) => a - b));
      return next;
    });
  };

  const loadUses = (id: string) => {
    if (uses[id]) return;
    grammarApi
      .point(id)
      .then(({ point }) => setUses((prev) => ({ ...prev, [id]: point.content?.uses.map((u) => u.title[locale]) ?? [] })))
      .catch(() => setUses((prev) => ({ ...prev, [id]: [] })));
  };

  const start = async () => {
    setError(null);
    setPhase({ name: 'building' });
    try {
      const { drill } = await grammarApi.drill(
        [...chosen].map(([pointId, picked]) => ({ pointId, uses: picked.length ? picked : undefined })),
        effectiveCount
      );
      startedAt.current = now();
      setPhase({ name: 'doing', id: drill.id, items: drill.items });
    } catch (err) {
      setError(err);
      setPhase({ name: 'choose' });
    }
  };

  const finish = async (answers: DrillAnswer[]) => {
    if (phase.name !== 'doing') return;
    try {
      const saved = await grammarApi.drillResult(phase.id, answers, Math.round((now() - startedAt.current) / 1000));
      celebrate(saved.xpEarned);
      setPhase({ name: 'done', results: saved.points, correct: answers.filter((a) => a.correct).length, total: answers.length });
    } catch (err) {
      setError(err);
    }
  };

  if (phase.name === 'building') {
    return (
      <div className="grammar grammar-drill">
        <Card padding="lg" className="grammar-practice">
          <Spinner size={28} label={d.building(effectiveCount)} />
        </Card>
      </div>
    );
  }

  if (phase.name === 'doing') {
    return (
      <div className="grammar grammar-drill">
        {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
        <GrammarQuestions items={phase.items} onFinish={finish} onClose={() => setPhase({ name: 'choose' })} />
      </div>
    );
  }

  if (phase.name === 'done') {
    return (
      <div className="grammar grammar-drill">
        <Card padding="lg" className="grammar-practice grammar-practice--done">
          <Icon name="check" size={36} />
          <h2>{t.grammar.practiceDone(phase.correct, phase.total)}</h2>
          <ul className="grammar-drill__results">
            {phase.results.map((r) => (
              <li key={r.pointId}>
                <Link to={grammarPath(r.pointId)}>{titleOf(r.pointId)}</Link>
                <span>
                  {r.correct}/{r.total}
                </span>
                <Badge tone={r.mastery === 'mastered' ? 'success' : r.mastery === 'good' ? 'reading' : 'warning'}>{t.grammar.mastery[r.mastery]}</Badge>
                <small>{t.grammar.nextReview(formatDate(r.dueAt))}</small>
              </li>
            ))}
          </ul>
          <div className="grammar-drill__actions">
            <Button onClick={() => setPhase({ name: 'choose' })}>{d.another}</Button>
            <Button variant="ghost" onClick={() => navigate('/grammar')}>
              {d.backToMap}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grammar grammar-drill">
      <PageHeader eyebrow="Grammar" title={d.title} description={d.intro} />
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {!map ? (
        error === null && <Spinner size={30} label={t.common.loading} />
      ) : (
        <>
          <div className="grammar-clusters">
            {map.clusters.map((cluster) => {
              const points = map.points.filter((p) => p.cluster === cluster.id);
              const picked = points.filter((p) => chosen.has(p.id)).length;
              return (
                <details key={cluster.id} className="grammar-cluster" open={cluster.id === clusterOfChoice || (!clusterOfChoice && map.clusters[0] === cluster)}>
                  <summary>
                    <span>{cluster.title[locale]}</span>
                    {picked > 0 && <Badge tone="reading">{picked}</Badge>}
                    <Badge tone="neutral">{points.length}</Badge>
                  </summary>
                  <div className="grammar-drill__points">
                    {points.map((p) => {
                      const on = chosen.has(p.id);
                      return (
                        <div key={p.id} className="grammar-drill__point">
                          <label className={`grammar-drill__check ${!on && full ? 'is-disabled' : ''}`}>
                            <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(p.id)} />
                            <span>
                              {p.title[locale]}
                              {locale === 'vi' && <small lang="en"> {p.title.en}</small>}
                            </span>
                            <Badge tone="reading">{p.cefr}</Badge>
                          </label>
                          {on && p.ready && (
                            <details className="grammar-drill__uses" onToggle={(e) => e.currentTarget.open && loadUses(p.id)}>
                              <summary>{chosen.get(p.id)?.length ? d.usesChosen(chosen.get(p.id)?.length ?? 0) : d.allUses}</summary>
                              {uses[p.id] === undefined ? (
                                <Spinner size={18} label={t.common.loading} />
                              ) : (
                                uses[p.id].map((title, i) => (
                                  <label key={i} className="grammar-drill__check grammar-drill__check--use">
                                    <input type="checkbox" checked={chosen.get(p.id)?.includes(i) ?? false} onChange={() => toggleUse(p.id, i)} />
                                    <span>{title}</span>
                                  </label>
                                ))
                              )}
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>

          <Card padding="lg" className="grammar-drill__start">
            <div>
              <strong>{chosen.size === 0 ? d.pickSome : d.picked(chosen.size, MAX_DRILL_TARGETS)}</strong>
              {full && <p className="grammar__hint">{d.limit(MAX_DRILL_TARGETS)}</p>}
              {chosen.size > 0 && (
                <p className="grammar__hint">
                  {[...chosen.keys()].map(titleOf).join(' · ')}
                </p>
              )}
            </div>
            <Segmented<string>
              label={d.count}
              value={String(effectiveCount)}
              onChange={(v) => setCount(Number(v) as (typeof DRILL_COUNTS)[number])}
              options={DRILL_COUNTS.map((n) => ({ value: String(n), label: d.questions(n), tone: 'reading' }))}
            />
            <Button icon="bolt" disabled={chosen.size === 0} onClick={() => void start()}>
              {d.start}
            </Button>
          </Card>
          <p className="grammar__hint">{d.note}</p>
        </>
      )}
    </div>
  );
};

