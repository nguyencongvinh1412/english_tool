/**
 * PathToday
 * The IELTS syllabus part of Today: where the learner is (phase, week, day), the steps that fit today's minutes
 * (steps missed before come first and are marked as catch-up), a button to study ahead, and the expected end at
 * the learner's real pace.
 */
import type React from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Button, Card, LinkButton, ProgressBar, TaskCard } from '@/design';
import { formatBand } from '@/shared/ieltsPathApi';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { useGrammarTitles } from '@/features/grammar/useGrammarTitles';
import { examPath } from '@/features/exams/examRoutes';
import { formatRange } from '@/shared/roadmapApi';
import { ieltsPathApi, type PathToday as PathTodayData } from '@/shared/ieltsPathApi';
import { fromToday } from '@/features/today/todayTasks';
import { adaptiveReason, stepKindKey, stepLink, stepTitle, stepTone } from './pathSteps';
import './ieltsPath.css';

const percent = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0);

export const PathToday: React.FC<{ today: PathTodayData; onChange: (today: PathTodayData) => void }> = ({ today, onChange }) => {
  const { t, locale } = useI18n();
  const titles = useGrammarTitles();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const s = t.ieltsPath.study;
  const pointTitle = (id: string) => titles.get(id)?.[locale] ?? id;


  const ahead = async () => {
    setBusy(true);
    try {
      onChange((await ieltsPathApi.ahead()).today);
    } finally {
      setBusy(false);
    }
  };

  const openRetest = async () => {
    if (!today.retest) return;
    setBusy(true);
    try {
      const { sessionId } = await ieltsPathApi.startRetest(today.retest.gate);
      navigate(examPath(sessionId));
    } finally {
      setBusy(false);
    }
  };
  const gate = today.gate;
  const showGate = gate !== null && (today.mode === 'gate' || today.mode === 'unwritten') && gate.startBlock !== 'earlier-gate';
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
        <table className="ipath__table pathtoday__bands" aria-label={s.bandsTitle}>
          <thead>
            <tr>
              <th>{s.bandsTitle}</th>
              <th>{s.bandGate}</th>
              <th>{s.bandPractice}</th>
              <th>{s.bandGoal}</th>
            </tr>
          </thead>
          <tbody>
            {(['listening', 'reading', 'writing', 'speaking'] as const).map((skill) => {
              const row = today.bands[skill];
              return (
                <tr key={skill}>
                  <th scope="row">{t.ielts.components[skill]}</th>
                  <td>{row.gate !== null ? formatBand(row.gate) : '–'}</td>
                  <td>{row.practice !== null ? formatBand(row.practice) : '–'}</td>
                  <td>{formatBand(row.target)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <span className="create__muted">{s.bandNote}</span>
      </Card>

      {(today.focus.writing || today.focus.speaking) && (
        <Card padding="md" className="pathtoday__focus">
          <strong>{s.focusTitle}</strong>
          {today.focus.writing && <span>{s.focusWriting(today.focus.writing.name, formatBand(today.focus.writing.band))}</span>}
          {today.focus.speaking && <span>{s.focusSpeaking(today.focus.speaking.name, formatBand(today.focus.speaking.band))}</span>}
          <Link to={ROUTES.IELTS_ERRORS} className="stage__more">
            {s.focusLink}
          </Link>
        </Card>
      )}
      {today.mode === 'complete' && <Banner tone="success">{s.complete}</Banner>}
      {today.mode === 'unwritten' && !gate && <Banner tone="info">{s.unwritten}</Banner>}
      {today.retest && today.retest.status !== 'locked' && today.retest.status !== 'done' && (
        <Card padding="lg" className="pathtoday__gate">
          <strong>{s.gate.retestTitle(t.ielts.components[today.retest.skill])}</strong>
          <span className="create__muted">{s.gate.retestDue}</span>
          <Button onClick={() => void openRetest()} loading={busy} disabled={busy}>
            {s.gate.retestOpen}
          </Button>
        </Card>
      )}
      {showGate && gate && (
        <Card padding="lg" className="pathtoday__gate">
          <strong>{gate.status === 'finished' ? s.gate.retakeTitle(gate.gate) : s.gate.title(gate.gate)}</strong>
          <span className="create__muted">{today.mode === 'unwritten' ? s.gate.unwritten : s.gate.ready}</span>
          {gate.stopped ? <Banner tone="warning">{s.gate.stopped}</Banner> : null}
          <LinkButton to={ROUTES.IELTS_PATH}>{gate.status === 'in_progress' ? s.gate.resume : s.gate.open}</LinkButton>
        </Card>
      )}
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
            kind={`${s.blocks[step.block]} · ${s.kinds[stepKindKey(step)]}`}
            meta={t.today.minutes(step.minutes)}
            title={stepTitle(step, t, locale, pointTitle)}
            why={step.ref.adaptive ? (s.adaptiveWhy[adaptiveReason(step)] ?? s.whys.adaptive) : s.whys[stepKindKey(step)]}
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
