/**
 * RoadmapPage
 * Two tabs: the roadmap (goal, expected date range, pace, stages) and Progress (what the learner has covered).
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, Icon, LinkButton, ProgressBar, Skeleton, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { JourneyPage } from '@/features/progress/JourneyPage';
import { formatDay, formatRange, hasRoadmap, roadmapApi, type RoadmapView } from '@/shared/roadmapApi';
import { StageList } from './StageList';
import './roadmap.css';

/**
 * Shown when every stage is done: the one big celebration besides finishing a stage, calm and without motion
 */
const GoalReached: React.FC<{ view: RoadmapView; onReview: () => void }> = ({ view, onReview }) => {
  const { t } = useI18n();
  const { roadmap } = view;
  const d = t.roadmapPage.done;
  const goal =
    roadmap.goalType === 'toeic' || roadmap.goalType === 'ielts' ? `${roadmap.goalType.toUpperCase()} ${roadmap.targetScore ?? ''}` : roadmap.goalType === 'jlpt' ? `JLPT ${roadmap.targetLevel}` : roadmap.targetLevel;
  const [now] = useState(() => Date.now());
  const weeks = Math.max(1, Math.round((now - Date.parse(`${roadmap.startDate}T00:00:00Z`)) / (7 * 86_400_000)));
  return (
    <div className="goal-done">
      <section className="goal-done__hero" role="status">
        <span className="goal-done__badge">
          <Icon name="check" size={40} />
        </span>
        <h2>{d.headline(goal)}</h2>
        <p>{d.body(weeks)}</p>
      </section>
      <Card padding="md">
        <div className="roadmap__bar">
          <span>{d.studyTime}</span>
          <strong>{d.hours(roadmap.plan.totalHours)}</strong>
        </div>
      </Card>
      <h3>{d.next}</h3>
      <Link to={ROUTES.ROADMAP_NEW} className="goal-done__next">
        <strong>{d.newGoal}</strong>
        <span>{d.newGoalHint}</span>
      </Link>
      <LinkButton to={ROUTES.ROADMAP_NEW} size="lg" block>
        {d.newGoal}
      </LinkButton>
      <Button variant="ghost" onClick={onReview}>
        {d.review}
      </Button>
    </div>
  );
};

const RoadmapTab: React.FC = () => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const [data, setData] = useState<RoadmapView | { roadmap: null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [now] = useState(() => Date.now());
  const [reviewing, setReviewing] = useState(false);
  const r = t.roadmapPage;

  const load = () =>
    roadmapApi
      .get()
      .then((result) => {
        setData(result);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  useEffect(() => {
    void load();
  }, [user.studyLanguage]);

  if (failed)
    return (
      <ErrorState
        title={t.today.errorTitle}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setFailed(false);
              void load();
            }}
          >
            {t.today.retry}
          </Button>
        }
      >
        {t.today.errorBody}
      </ErrorState>
    );
  if (!data) return <Skeleton height={160} label={t.common.loading} />;
  if (!hasRoadmap(data))
    return (
      <EmptyState icon="roadmap" title={r.emptyTitle} action={<LinkButton to={ROUTES.ROADMAP_NEW}>{r.emptyAction}</LinkButton>}>
        {r.emptyBody}
      </EmptyState>
    );

  const { roadmap, progress, checkpoint } = data;
  if (progress.completed && !reviewing) return <GoalReached view={data} onReview={() => setReviewing(true)} />;
  const goal =
    roadmap.goalType === 'toeic' || roadmap.goalType === 'ielts'
      ? `${roadmap.goalType.toUpperCase()} ${roadmap.targetScore ?? ''}`
      : roadmap.goalType === 'jlpt'
        ? `JLPT ${roadmap.targetLevel}`
        : roadmap.targetLevel;
  const feasibility = roadmap.plan.feasibility;
  const weeksLeft = roadmap.deadline ? Math.max(0, Math.round((Date.parse(`${roadmap.deadline}T00:00:00Z`) - now) / (7 * 86_400_000))) : 0;

  return (
    <div className="roadmap__grid">
      <div className="roadmap__col">
        <Card padding="lg" className="roadmap__eta">
          <span className="roadmap__label">{r.goalLine(goal)}</span>
          <strong className="roadmap__range">{formatRange(roadmap.plan.etaFrom, roadmap.plan.etaTo)}</strong>
          <span>{roadmap.deadline ? r.deadlineLine(formatDay(roadmap.deadline), weeksLeft, roadmap.hoursPerWeek) : r.noDeadlineLine(roadmap.hoursPerWeek)}</span>
          {Object.keys(roadmap.minSkillLevels).length > 0 && (
            <span className="roadmap__muted">
              {t.roadmapNew.minTitle.replace(' (optional)', '').replace(' (tuỳ chọn)', '')}:{' '}
              {Object.entries(roadmap.minSkillLevels)
                .map(([skill, value]) => `${t.today.kinds[skill as keyof typeof t.today.kinds]} ≥ ${value}`)
                .join(' · ')}
            </span>
          )}
          <div className="roadmap__tags">
            <Tag tone={feasibility === 'ok' ? 'brand' : feasibility === 'tight' ? 'notice' : 'hard'}>{(feasibility === 'ok' ? '✓ ' : feasibility === 'tight' ? '◐ ' : '! ') + r.feasibility[feasibility]}</Tag>
            {roadmap.levelSource === 'self' && <Tag tone="notice">{r.estimateTag}</Tag>}
            {roadmap.levelSource === 'self' && roadmap.language === 'en' && (
              <Link to={ROUTES.PLACEMENT} className="stage__more">
                {t.today.takeTest}
              </Link>
            )}
          </div>
        </Card>

        {checkpoint?.unlocked && !checkpoint.passed && (
          <Card padding="md" className="roadmap__pace">
            <p>{r.checkpointReady}</p>
            <LinkButton to={`${ROUTES.CHECKPOINT}/${checkpoint.stageIndex}`} variant="secondary">
              {r.checkpointOpen}
            </LinkButton>
          </Card>
        )}

        <Card padding="md" className="roadmap__pace">
          <h2>{r.paceTitle}</h2>
          <div className="roadmap__bar">
            <span>{r.timePassed}</span>
            <strong>{Math.round(progress.timeShare * 100)}%</strong>
          </div>
          <ProgressBar value={progress.timeShare * 100} tone="text-muted" size="sm" label={r.timePassed} />
          <div className="roadmap__bar">
            <span>{r.studyProgress}</span>
            <strong>{Math.round(progress.overall * 100)}%</strong>
          </div>
          <ProgressBar value={progress.overall * 100} size="sm" label={r.studyProgress} />
          <p className="roadmap__muted">{progress.pace === 'on' ? r.paceOn : r.paceBehind}</p>
        </Card>

        <div className="roadmap__actions">
          <LinkButton to={ROUTES.HOME} size="lg" block>
            {r.seeToday}
          </LinkButton>
          <LinkButton to={ROUTES.ROADMAP_NEW} variant="secondary" block>
            {r.editGoal}
          </LinkButton>
        </div>
      </div>

      <div className="roadmap__col">
        <StageList stages={roadmap.stages} progress={progress.stages} current={progress.current} />
      </div>
    </div>
  );
};

export const RoadmapPage: React.FC = () => {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const onProgress = pathname.startsWith(ROUTES.PROGRESS);
  const tabs = [
    { to: ROUTES.ROADMAP, label: t.roadmapPage.tabs.roadmap, on: !onProgress },
    { to: ROUTES.PROGRESS, label: t.roadmapPage.tabs.progress, on: onProgress },
  ];

  return (
    <div className="roadmap">
      <h1 className="roadmap__title">{t.roadmapPage.title}</h1>
      <nav className="roadmap__tabs" aria-label={t.roadmapPage.title}>
        {tabs.map((tab) => (
          <Link key={tab.to} to={tab.to} aria-current={tab.on ? 'page' : undefined} className={`roadmap__tab ${tab.on ? 'roadmap__tab--on' : ''}`}>
            {tab.on ? '✓ ' : ''}
            {tab.label}
          </Link>
        ))}
      </nav>
      {onProgress ? <JourneyPage embedded /> : <RoadmapTab />}
    </div>
  );
};
