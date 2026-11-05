/**
 * GrammarDrillPage
 * Build a practice set from the grammar points (and uses of them) the learner picks, do it, and see
 * the result per point
 */
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Banner, Button, Card, Icon, Segmented, Spinner, Tag } from '@/design';
import { useCurrentUser } from '@/app/AuthProvider';
import { CREDIT_COST, tasksLeft } from '@/shared/billingApi';
import { useI18n } from '@/i18n/I18nProvider';
import { ApiRequestError, errorMessage } from '@/shared/http';
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
import { ToolFooter, ToolHeader } from './ToolChrome';
import '@/features/me/notifications.css';
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
  const user = useCurrentUser();
  const creditsOut = (tasksLeft(user.credits, 'generate') ?? 1) < 1;
  /** Whether new questions are written by the AI (uses credits) or taken from those that already exist */
  const [useAi, setUseAi] = useState(true);
  const aiOn = useAi && !creditsOut;
  const startedAt = useRef(0);
  const d = t.grammar.drill;

  useEffect(() => {
    grammarApi
      .map()
      .then((data) => {
        setMap(data);
        const point = params.get('point');
        const cluster = params.get('cluster');
        const wanted = point ? point.split(',') : [];
        const ids = point
          ? data.points.filter((p) => wanted.includes(p.id)).map((p) => p.id)
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
        effectiveCount,
        aiOn
      );
      startedAt.current = now();
      setPhase({ name: 'doing', id: drill.id, items: drill.items });
    } catch (err) {
      setError(err);
      setPhase({ name: 'choose' });
    }
  };
  const notEnough = error instanceof ApiRequestError && error.code === 'not_enough_existing';

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
    <div className="grammar grammar-drill tool-page">
      <ToolHeader title={d.title} subtitle={d.intro} />
      {error !== null && <Banner tone={notEnough ? 'warning' : 'danger'}>{notEnough ? d.notEnough : errorMessage(error, t)}</Banner>}
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
                          <button type="button" className={`tool-chip ${on ? 'tool-chip--on' : ''}`} aria-pressed={on} disabled={!on && full} onClick={() => toggle(p.id)}>
                            {on && <span aria-hidden="true">✓ </span>}
                            {p.title[locale]} <small>{p.cefr}</small>
                          </button>
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

          <Card padding="md" className="grammar-drill__ai">
            <label className="notif-toggle">
              <span>
                <strong>
                  {d.aiTitle} <Tag tone={creditsOut ? 'notice' : 'neutral'}>{creditsOut ? t.today.needsCredits : t.grammar.askCost(String(CREDIT_COST.generate))}</Tag>
                </strong>
                <small>{creditsOut ? d.aiOut : d.aiNote}</small>
              </span>
              <input type="checkbox" role="switch" checked={aiOn} disabled={creditsOut} onChange={(e) => setUseAi(e.target.checked)} />
            </label>
          </Card>

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
          </Card>
          <p className="grammar__hint">{d.note}</p>
          <ToolFooter>
            <Button size="lg" icon="bolt" disabled={chosen.size === 0} onClick={() => void start()}>
              {d.start}
            </Button>
          </ToolFooter>
        </>
      )}
    </div>
  );
};

