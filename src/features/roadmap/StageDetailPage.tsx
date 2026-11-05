/**
 * StageDetailPage
 * One stage in detail: each target with its progress, and the tasks that are left for it, each linking straight to
 * the activity. The main button runs the stage's next task through Today.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, Icon, LinkButton, ProgressBar, Skeleton } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { formatDay, hasRoadmap, roadmapApi, type RoadmapView, type SkillName } from '@/shared/roadmapApi';
import { skillActivities } from './stageTasks';
import { useStageName } from './useStageName';
import '@/features/me/me.css';
import './roadmap.css';

const pct = (have: number, goal: number) => (goal > 0 ? Math.min(100, (have / goal) * 100) : 0);

export const StageDetailPage: React.FC = () => {
  const { t } = useI18n();
  const { index } = useParams();
  const stageName = useStageName();
  const [data, setData] = useState<RoadmapView | { roadmap: null } | null>(null);
  const [open, setOpen] = useState<string | null>('vocab');
  const d = t.roadmapPage.detail;

  useEffect(() => {
    roadmapApi.get().then(setData).catch(() => setData({ roadmap: null }));
  }, []);

  if (!data) return <Skeleton height={200} label={t.common.loading} />;
  const stage = hasRoadmap(data) ? data.roadmap.stages[Number(index)] : undefined;
  if (!hasRoadmap(data) || !stage)
    return (
      <div className="roadmap">
        <p>{d.notFound}</p>
        <LinkButton to={ROUTES.ROADMAP}>{d.back}</LinkButton>
      </div>
    );

  const progress = data.progress.stages[stage.index];
  const done = Math.round(progress.progress * 100);
  const kinds = t.today.kinds;

  const rows: { key: string; label: string; have: number; goal: number; todo: { label: string; to: string }[] }[] = [];
  if (stage.objectives.vocabMastered > 0)
    rows.push({ key: 'vocab', label: t.roadmapPage.objectives.vocab, have: progress.vocab.have, goal: progress.vocab.goal, todo: [{ label: d.todo.words, to: ROUTES.VOCABULARY }] });
  if (stage.objectives.grammarGood > 0)
    rows.push({ key: 'grammar', label: t.roadmapPage.objectives.grammar, have: progress.grammar.have, goal: progress.grammar.goal, todo: [{ label: d.todo.grammar, to: ROUTES.GRAMMAR }] });
  for (const s of progress.sessions)
    rows.push({
      key: s.skill,
      label: t.roadmapPage.objectives.sessions(kinds[s.skill as keyof typeof kinds]),
      have: s.have,
      goal: s.goal,
      todo: skillActivities(s.skill as SkillName).map((to) => ({ label: d.todo.session(kinds[s.skill as keyof typeof kinds]), to })),
    });
  if (progress.mockTests.goal > 0)
    rows.push({ key: 'mock', label: t.roadmapPage.objectives.mock, have: progress.mockTests.have, goal: progress.mockTests.goal, todo: [{ label: d.todo.mock, to: ROUTES.EXAMS }] });

  return (
    <div className="stage-detail">
      <header className="plan__head">
        <Link to={ROUTES.ROADMAP} className="plan__back" aria-label={d.back}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <div>
          <h1>{stageName(stage)}</h1>
          <p className="roadmap__muted">{d.subtitle}</p>
        </div>
      </header>

      <Card padding="md" className="stage-detail__summary">
        <div className="stage__head">
          <strong>{stageName(stage)}</strong>
          <strong>{done}%</strong>
        </div>
        <ProgressBar value={done} label={stageName(stage)} />
        <p className="roadmap__muted">
          {t.roadmapNew.stage.weeks(stage.weeks)} · {t.roadmapPage.endsAround(formatDay(stage.endDate))}
        </p>
      </Card>

      {rows.map((row) => {
        const expanded = open === row.key;
        return (
          <Card key={row.key} padding="md" className={`stage-detail__row ${expanded ? 'stage-detail__row--open' : ''}`}>
            <button type="button" className="stage-detail__toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : row.key)}>
              <span>{row.label}</span>
              <strong>
                {row.have} / {row.goal} {expanded ? '▾' : '›'}
              </strong>
            </button>
            <ProgressBar value={pct(row.have, row.goal)} size="sm" label={row.label} />
            {expanded && (
              <div className="stage-detail__todo">
                <span className="roadmap__label">{d.remaining}</span>
                <ul>
                  {row.todo.map((item) => (
                    <li key={item.label + item.to}>
                      <Link to={item.to}>{item.label}</Link>
                      <Icon name="chevronRight" size={16} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })}

      {stage.kind === 'level' && (
        <p className="roadmap__muted">
          <Icon name="lock" size={14} /> {d.checkpoint(done)}{' '}
          <Link to={`${ROUTES.CHECKPOINT}/${stage.index}`}>{d.openCheckpoint}</Link>
        </p>
      )}
      <LinkButton to={ROUTES.HOME} size="lg">
        {d.cta}
      </LinkButton>
      <Button variant="ghost" onClick={() => window.history.back()} className="visually-hidden">
        {d.back}
      </Button>
    </div>
  );
};
