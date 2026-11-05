/**
 * TodayPage
 * What to do today, fitted to the minutes the learner has. One main button runs the next task.
 * Until roadmaps exist the list comes from due reviews, repeated mistakes and the goal's coverage.
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Button, Card, EmptyState, ErrorState, ProgressBar, Skeleton, Tag, TaskCard, TimeBar } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { tasksLeft } from '@/shared/billingApi';
import { journeyApi, type Journey } from '@/shared/journeyApi';
import { formatDay, formatRange, hasRoadmap, roadmapApi, type RoadmapView } from '@/shared/roadmapApi';
import { useStageName } from '@/features/roadmap/useStageName';
import { dismissInstallHint, shouldSuggestInstall } from '@/shared/installHint';
import { todayApi, TODAY_BUDGETS, type Today, type TodayBudget, type TodayTask } from '@/shared/todayApi';
import { useGrammarTitles } from '@/features/grammar/useGrammarTitles';
import { WeeklyReviewDialog } from './WeeklyReviewDialog';
import { fromToday, taskAlternative, taskKind, taskLink, taskText } from './todayTasks';
import './today.css';
import '@/features/me/install.css';

const BUDGET_KEY = 'today-minutes';

function readBudget(): TodayBudget {
  try {
    const stored = Number(localStorage.getItem(BUDGET_KEY));
    return (TODAY_BUDGETS as readonly number[]).includes(stored) ? (stored as TodayBudget) : 45;
  } catch {
    return 45;
  }
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const TodayPage: React.FC = () => {
  const { t, locale } = useI18n();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const titles = useGrammarTitles();
  const [budget, setBudget] = useState<TodayBudget>(readBudget);
  const [today, setToday] = useState<Today | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [failed, setFailed] = useState(false);
  const [roadmap, setRoadmap] = useState<RoadmapView | null>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [testDismissed, setTestDismissed] = useState(false);
  const [installHint, setInstallHint] = useState(shouldSuggestInstall);
  const stageName = useStageName();

  const load = useCallback(() => {
    todayApi
      .get(budget)
      .then((data) => {
        setToday(data);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [budget]);
  const retry = () => {
    setFailed(false);
    load();
  };

  useEffect(load, [load]);
  useEffect(() => {
    journeyApi.get().then(setJourney).catch(() => {});
    roadmapApi
      .get()
      .then((data) => setRoadmap(hasRoadmap(data) ? data : null))
      .catch(() => {});
  }, [user.studyLanguage]);

  const choose = (minutes: TodayBudget) => {
    setBudget(minutes);
    try {
      localStorage.setItem(BUDGET_KEY, String(minutes));
    } catch {
      // storage blocked: the choice lasts until reload
    }
  };

  const language = user.studyLanguage;
  const creditsOut = (tasksLeft(user.credits, 'writing') ?? 1) <= 0;
  const pointTitle = (id: string) => titles.get(id)?.[locale] ?? id;

  const text = (task: TodayTask) => taskText(task, t, pointTitle);

  const tasks = today?.tasks ?? [];
  const next = tasks.find((task) => !task.done);
  const allDone = tasks.length > 0 && !next;

  const start = () => {
    if (failed) return retry();
    if (next) navigate(fromToday(taskLink(next, language), next.minutes));
    else navigate(ROUTES.PRACTICE);
  };

  const goal = today?.goal ?? journey?.goal;
  const coverage = journey ? [journey.vocab.goal, journey.grammar?.goal].filter((c): c is NonNullable<typeof c> => Boolean(c)) : [];
  const coveragePct = percent(
    coverage.reduce((n, c) => n + c.mastered, 0),
    coverage.reduce((n, c) => n + c.total, 0)
  );
  const goalText = !goal || goal.kind === 'none'
    ? t.today.noGoal
    : goal.kind === 'toeic'
      ? t.journey.goal.toeic(goal.targetScore ?? 0, goal.targetLevel ?? '')
      : goal.kind === 'ielts'
        ? t.journey.goal.ielts(goal.targetScore ?? 0, goal.targetLevel ?? '')
        : goal.kind === 'jlpt'
          ? t.journey.goal.jlpt(goal.targetLevel ?? '')
          : t.journey.goal.cefr(goal.targetLevel ?? '');

  const ctaLabel = failed ? t.today.retry : allDone ? t.today.ctaMore : budget === 10 && next ? t.today.ctaStartShort(10) : t.today.cta;

  return (
    <div className="today">
      {roadmap && <WeeklyReviewDialog />}
      <header className="today__head">
        <h1>{t.today.greeting(user.displayName)}</h1>
        <p className="today__sub">{today ? (allDone ? t.today.summaryDone(today.totalMinutes, tasks.length) : t.today.summary(today.totalMinutes, tasks.length)) : failed ? '' : t.today.loading}</p>
      </header>

      <div className="today__grid">
        <div className="today__main">
          {!roadmap && (
            <p className="today__notice">
              {t.today.roadmapSoon}{' '}
              <Link to={ROUTES.ROADMAP_NEW} className="today__link">
                {t.today.createRoadmap}
              </Link>
            </p>
          )}

          {roadmap?.roadmap.levelSource === 'self' && user.studyLanguage === 'en' && !testDismissed && (
            <Banner tone="info">
              <div className="today__welcome">
                <span>{t.today.testBanner}</span>
                <span className="today__welcome-actions">
                  <Button size="sm" variant="secondary" onClick={() => navigate(ROUTES.PLACEMENT)}>
                    {t.today.takeTest}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTestDismissed(true)}>
                    {t.today.remindLater}
                  </Button>
                </span>
              </div>
            </Banner>
          )}
          {today?.welcomeBack && !welcomeDismissed && (
            <Banner tone="info">
              <div className="today__welcome">
                <span>{t.today.welcomeBack(today.welcomeBack.days)}</span>
                <span className="today__welcome-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      choose(20);
                      setWelcomeDismissed(true);
                    }}
                  >
                    {t.today.goLighter}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setWelcomeDismissed(true)}>
                    {t.today.keepAsIs}
                  </Button>
                  <Link to={ROUTES.ROADMAP_NEW} className="today__link">
                    {t.today.rebuild}
                  </Link>
                </span>
              </div>
            </Banner>
          )}
          {installHint && (
            <Banner tone="info">
              <div className="install-hint">
                <span>{t.install.suggestion}</span>
                <Link to={ROUTES.ME_INSTALL} className="today__link">
                  {t.install.seeHow}
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    dismissInstallHint();
                    setInstallHint(false);
                  }}
                >
                  {t.install.notNow}
                </Button>
              </div>
            </Banner>
          )}
          {today?.savedAt !== undefined && <Banner tone="warning">{t.today.offlineCopy(new Date(today.savedAt).toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' }))}</Banner>}
          {today && today.rolled > 0 && !today.welcomeBack && <Banner tone="info">{t.today.carriedBanner(today.rolled)}</Banner>}

          {creditsOut && (
            <Banner
              tone="warning"
              action={
                <Link to={ROUTES.ME_PLAN} className="today__link">
                  {t.today.seePlan}
                </Link>
              }
            >
              {t.today.creditsBanner}
            </Banner>
          )}

          <div className="today__time" role="radiogroup" aria-label={t.today.howLong}>
            <span className="today__time-label">{t.today.howLong}</span>
            <div className="today__radios">
              {TODAY_BUDGETS.map((minutes) => (
                <button key={minutes} type="button" role="radio" aria-checked={budget === minutes} className={`today__radio ${budget === minutes ? 'today__radio--on' : ''}`} onClick={() => choose(minutes)}>
                  {budget === minutes ? '✓ ' : ''}
                  {t.today.minutes(minutes)}
                </button>
              ))}
            </div>
          </div>

          {today && tasks.length > 0 && (
            <TimeBar
              label={t.today.summary(today.totalMinutes, tasks.length)}
              segments={tasks.map((task) => ({ id: task.id, minutes: task.minutes, tone: taskKind(task).tone }))}
            />
          )}

          {!today && !failed && (
            <div className="today__list" aria-busy="true">
              {[1, 2, 3, 4].map((n) => (
                <Skeleton key={n} />
              ))}
            </div>
          )}

          {failed && (
            <ErrorState
              title={t.today.errorTitle}
              action={
                <Button onClick={retry} variant="secondary">
                  {t.today.retry}
                </Button>
              }
            >
              {t.today.errorBody}
            </ErrorState>
          )}

          {allDone && (
            <div className="today__done" role="status">
              <strong>✓ {t.today.doneTitle}</strong>
              <span>{t.today.doneBody}</span>
            </div>
          )}

          {today && tasks.length === 0 && <EmptyState icon="sparkles" title={t.today.doneTitle}>{t.today.doneBody}</EmptyState>}

          <div className="today__list">
            {tasks.map((task) => {
              const { tone, kind } = taskKind(task);
              const copy = text(task);
              const blocked = Boolean(task.needsAi) && creditsOut;
              const alternative = blocked ? taskAlternative(task, language) : null;
              return (
                <TaskCard
                  key={task.id}
                  to={fromToday(taskLink(task, language), task.minutes)}
                  tone={tone}
                  kind={t.today.kinds[kind]}
                  meta={task.shortened ? t.today.minutesShort(task.minutes) : copy.meta}
                  title={copy.title}
                  why={copy.why}
                  done={task.done}
                  doneLabel={t.today.doneTitle}
                  todoLabel={t.today.minutes(task.minutes)}
                  badge={blocked ? t.today.needsCredits : undefined}
                  carried={task.rolledFrom ? t.today.carriedFrom(formatDay(task.rolledFrom)) : undefined}
                  alternative={alternative ? { to: alternative, label: t.today.tasks.skill.alternative[task.type === 'practice-skill' && task.skill === 'speaking' ? 'speaking' : 'writing'] } : undefined}
                />
              );
            })}
          </div>

          {today && today.carried > 0 && <p className="today__tail">{t.today.carried(today.carried)}</p>}
          {today && today.rolled > 0 && <p className="today__tail">{t.today.carriedNote}</p>}
        </div>

        <aside className="today__rail">
          {roadmap ? (
            <Card className="today__goal">
              {(() => {
                const { roadmap: rm, progress } = roadmap;
                const stage = rm.stages[progress.current];
                const pct = Math.round((progress.stages[progress.current]?.progress ?? 0) * 100);
                const goalName = rm.goalType === 'toeic' || rm.goalType === 'ielts' ? `${rm.goalType.toUpperCase()} ${rm.targetScore ?? ''}` : rm.goalType === 'jlpt' ? `JLPT ${rm.targetLevel}` : rm.targetLevel;
                return (
                  <>
                    <span className="today__label">{t.today.stageLabel(progress.current + 1, rm.stages.length)}</span>
                    <strong className="today__goal-title">{stageName(stage)}</strong>
                    <ProgressBar value={pct} label={stageName(stage)} />
                    <span className="today__goal-line">{pct}%</span>
                    <span className="today__goal-line">{t.today.etaLine(goalName, formatRange(rm.plan.etaFrom, rm.plan.etaTo), rm.deadline ? formatDay(rm.deadline) : null)}</span>
                    {rm.levelSource === 'self' && <Tag tone="notice">{t.roadmapPage.estimateTag}</Tag>}
                  </>
                );
              })()}
            </Card>
          ) : (
          <Card className="today__goal">
            <span className="today__label">{t.today.goalLabel}</span>
            <strong className="today__goal-title">{goalText}</strong>
            {coverage.length > 0 && (
              <>
                <ProgressBar value={coveragePct} label={t.today.coverageLine(coveragePct, goal?.targetLevel ?? null)} />
                <span className="today__goal-line">{t.today.coverageLine(coveragePct, goal?.targetLevel ?? null)}</span>
              </>
            )}
            {(!goal || goal.kind === 'none') && (
              <Link to={ROUTES.ME_ACCOUNT} className="today__link">
                {t.today.setGoal}
              </Link>
            )}
          </Card>
          )}
          <div className="today__cta">
            <Button size="lg" block onClick={start}>
              {ctaLabel}
            </Button>
            <Link to={ROUTES.PRACTICE} className="today__link today__more">
              {t.today.more}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
};
