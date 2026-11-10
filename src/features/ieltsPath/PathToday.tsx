/**
 * PathToday
 * The IELTS syllabus part of Today: where the learner is (phase, week, day), the steps that fit today's minutes
 * (steps missed before come first and are marked as catch-up), a button to study ahead, and the expected end at
 * the learner's real pace.
 */
import type React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Button, Card, ProgressBar, TaskCard } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { useGrammarTitles } from '@/features/grammar/useGrammarTitles';
import { formatRange } from '@/shared/roadmapApi';
import { ieltsPathApi, type PathToday as PathTodayData } from '@/shared/ieltsPathApi';
import { fromToday } from '@/features/today/todayTasks';
import { stepLink, stepTitle, stepTone } from './pathSteps';
import './ieltsPath.css';

const percent = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0);

export const PathToday: React.FC<{ today: PathTodayData; onChange: (today: PathTodayData) => void }> = ({ today, onChange }) => {
  const { t, locale } = useI18n();
  const titles = useGrammarTitles();
  const [busy, setBusy] = useState(false);
  const s = t.ieltsPath.study;
  const pointTitle = (id: string) => titles.get(id)?.[locale] ?? id;

  if (today.mode === 'unwritten') return <Banner tone="info">{s.unwritten}</Banner>;

  const ahead = async () => {
    setBusy(true);
    try {
      onChange((await ieltsPathApi.ahead()).today);
    } finally {
      setBusy(false);
    }
  };

  const allDone = today.steps.length > 0 && today.steps.every((step) => step.done);

  return (
    <section className="pathtoday" aria-label={s.title}>
      <Card padding="lg" className="pathtoday__head">
        <span className="pathtoday__label">{s.title}</span>
        {today.position && <strong className="pathtoday__pos">{s.position(today.position.phase, today.position.week, today.position.day)}</strong>}
        {today.mode === 'syllabus' && (
          <>
            <ProgressBar value={percent(today.doneMinutes, today.plannedMinutes)} label={s.minutesOf(today.doneMinutes, today.plannedMinutes)} />
            <span className="create__muted">{s.minutesOf(today.doneMinutes, today.plannedMinutes)}</span>
          </>
        )}
        <span className="create__muted">{s.progress(today.progress.done, today.progress.total)}</span>
        {today.eta && <span className="create__muted">{s.eta(formatRange(today.eta.from, today.eta.to))}</span>}
      </Card>

      {today.mode === 'complete' && <Banner tone="success">{s.complete}</Banner>}
      {today.restDay && today.mode === 'syllabus' && <Banner tone="info">{s.restDay}</Banner>}
      {today.behind.alert && (
        <Banner
          tone="warning"
          action={
            <Link to={ROUTES.IELTS_PATH} className="stage__more">
              {s.changePlan}
            </Link>
          }
        >
          <strong>{s.behind(today.behind.days)}</strong> {s.behindBody}
        </Banner>
      )}
      {allDone && <div className="today__done" role="status"><strong>✓ {s.allDone}</strong></div>}

      <div className="today__list">
        {today.steps.map((step) => (
          <TaskCard
            key={step.id}
            to={fromToday(stepLink(step), step.minutes)}
            tone={stepTone(step)}
            kind={`${s.blocks[step.block]} · ${s.kinds[step.kind]}`}
            meta={t.today.minutes(step.minutes)}
            title={stepTitle(step, t, locale, pointTitle)}
            why={s.whys[step.kind]}
            done={step.done}
            doneLabel={t.today.doneTitle}
            todoLabel={t.today.minutes(step.minutes)}
            carried={step.behind ? s.catchUp : undefined}
          />
        ))}
      </div>

      {today.canAhead && today.mode === 'syllabus' && (
        <div className="pathtoday__ahead">
          <Button variant="secondary" onClick={() => void ahead()} loading={busy} disabled={busy}>
            {s.ahead(today.dailyMinutes)}
          </Button>
          <span className="create__muted">{s.aheadHint}</span>
        </div>
      )}
    </section>
  );
};
