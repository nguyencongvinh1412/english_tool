/**
 * IeltsPathPage
 * The learner's IELTS path: goals, Gate 0 (four short tests, writing and speaking optional), and after it the
 * starting phase with the expected dates. With no path yet it invites the learner to set one up.
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner, Button, Card, EmptyState, ErrorState, LinkButton, Skeleton, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { examPath } from '@/features/exams/examRoutes';
import { formatDay, formatRange } from '@/shared/roadmapApi';
import { formatBand, ieltsPathApi, PATH_SKILLS, type PathSkill, type PathView } from '@/shared/ieltsPathApi';
import { GatePanel } from './GatePanel';
import { SkillRow } from './SkillRow';
import '@/features/roadmap/roadmap.css';
import './ieltsPath.css';

const GRADING_POLL_MS = 5000;

export const IeltsPathPage: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const p = t.ieltsPath;
  const [path, setPath] = useState<PathView | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(
    () =>
      ieltsPathApi
        .get()
        .then(({ path: view }) => {
          setPath(view);
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    []
  );
  useEffect(() => {
    void load();
  }, [load]);

  // Writing and speaking are graded in the background: look again until they are done
  const grading = path?.gate0.skills.some((s) => s.status === 'grading') ?? false;
  useEffect(() => {
    if (!grading) return;
    const timer = window.setInterval(() => void load(), GRADING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [grading, load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(false);
    try {
      await action();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  };

  if (failed)
    return (
      <ErrorState
        title={p.loadError}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            {p.retry}
          </Button>
        }
      />
    );
  if (path === undefined) return <Skeleton height={160} label={t.common.loading} />;
  if (path === null)
    return (
      <EmptyState icon="roadmap" title={p.emptyTitle} action={<LinkButton to={ROUTES.IELTS_PATH_START}>{p.emptyAction}</LinkButton>}>
        {p.emptyBody}
      </EmptyState>
    );

  const { gate0, plan } = path;
  const finished = gate0.status === 'finished';
  const skipped = gate0.skills.some((s) => s.status === 'skipped');
  const feasibility = plan?.feasibility ?? null;

  const start = (skill: PathSkill) =>
    run(async () => {
      const { sessionId } = await ieltsPathApi.startSkill(0, skill);
      navigate(examPath(sessionId));
    });
  const skip = (skill: PathSkill, skippedNow: boolean) =>
    run(async () => {
      const { gate } = await ieltsPathApi.skipSkill(0, skill, skippedNow);
      setPath({ ...path, gate0: gate });
    });
  const change = (change: { examDate?: string | null; dailyMinutes?: number }) =>
    run(async () => {
      const { path: next } = await ieltsPathApi.update(change);
      setPath(next);
    });

  return (
    <div className="ipath">
      <header className="ipath__head">
        <h1>{p.title}</h1>
        <p className="ipath__goal">{p.goalLine(formatBand(path.overallTarget))}</p>
        <p className="create__muted">
          {[path.examDate ? p.examLine(formatDay(path.examDate)) : null, p.dailyLine(path.dailyMinutes)].filter(Boolean).join(' · ')}
        </p>
      </header>

      {actionError && <Banner tone="warning">{p.startError}</Banner>}

      <div className="ipath__grid">
        <div className="ipath__col">
          <Card padding="lg">
            <h2>{finished ? p.resultTitle : p.gate0Title}</h2>
            {!finished && <p className="create__muted">{p.gate0Body}</p>}
            <ul className="ipath__skills">
              {gate0.skills.map((skill) => (
                <SkillRow key={skill.skill} skill={skill} finished={finished} busy={busy} onStart={() => void start(skill.skill)} onSkip={(s) => void skip(skill.skill, s)} onOpen={() => skill.sessionId && navigate(examPath(skill.sessionId))} />
              ))}
            </ul>
            {grading && <p className="create__muted">{p.gradingNote}</p>}
            {!finished && skipped && <p className="create__muted">{p.skipNote}</p>}
          </Card>

          <Card padding="lg">
            <h2>{p.goalsTitle}</h2>
            <table className="ipath__table">
              <thead>
                <tr>
                  <th />
                  <th>{p.bandNow}</th>
                  <th>{p.bandGoal}</th>
                </tr>
              </thead>
              <tbody>
                {PATH_SKILLS.map((skill) => {
                  const now = gate0.bands?.[skill] ?? null;
                  return (
                    <tr key={skill}>
                      <th scope="row">{t.ielts.components[skill]}</th>
                      <td>{now !== null ? formatBand(now) : finished ? p.notMeasured : '—'}</td>
                      <td>{formatBand(path.bandTargets[skill])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <LinkButton to={ROUTES.IELTS_PATH_START} variant="ghost" size="sm">
              {p.changeGoal}
            </LinkButton>
            <LinkButton to={ROUTES.IELTS_ERRORS} variant="ghost" size="sm">
              {p.errorBook.title}
            </LinkButton>
          </Card>
        </div>

        <div className="ipath__col">
          {finished && path.previous && <GatePanel view={path.previous} reload={() => void load()} />}
          {finished && path.gate && <GatePanel view={path.gate} reload={() => void load()} />}
          {finished && path.history.length > 0 && (
            <Card padding="lg">
              <h2>{p.gates.history.title}</h2>
              <ul className="ipath__history">
                {path.history.map((row) => (
                  <li key={row.gate}>
                    <strong>{p.gates.history.gate(row.gate)}</strong>
                    <Tag tone={row.outcome === 'pass' ? 'brand' : row.outcome === 'conditional' ? 'notice' : row.outcome === 'fail' ? 'hard' : 'neutral'}>
                      {row.outcome === 'open' || row.outcome === null ? p.gates.history.open : p.gates.outcome[row.outcome]}
                    </Tag>
                    <span className="create__muted">{p.gates.history.tries(row.tries)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {finished && path.startPhase !== null && plan && (
            <Card padding="lg" className="ipath__plan">
              <h2>{p.planTitle}</h2>
              <p className="ipath__phase">{plan.phases.length > 0 ? p.startPhase(path.startPhase) : p.alreadyThere}</p>
              <p className="create__eta">{p.expected(formatRange(plan.etaFrom, plan.etaTo))}</p>
              <p className="create__muted">{p.syllabusWeeks(plan.syllabusWeeks, Math.round(plan.minutes / 60))}</p>
              {feasibility && <Tag tone={feasibility === 'ok' ? 'brand' : feasibility === 'tight' ? 'notice' : 'hard'}>{(feasibility === 'ok' ? '✓ ' : feasibility === 'tight' ? '◐ ' : '! ') + p.feasibility[feasibility]}</Tag>}
              {plan.fixes && (
                <div className="create__fixes">
                  <strong>{p.fixTitle}</strong>
                  <Button variant="secondary" disabled={busy} onClick={() => void change({ examDate: plan.fixes!.laterDate })}>
                    {p.fixDate(formatDay(plan.fixes.laterDate))}
                  </Button>
                  <Button variant="secondary" disabled={busy || plan.fixes.dailyMinutes > 300} onClick={() => void change({ dailyMinutes: plan.fixes!.dailyMinutes })}>
                    {p.fixMinutes(plan.fixes.dailyMinutes)}
                  </Button>
                </div>
              )}
              <ol className="ipath__phases">
                {plan.phases.map((phase) => (
                  <li key={phase}>
                    <strong>{p.phaseName(phase)}</strong>
                    <span className="create__muted">{p.phaseLine(phase, 4)}</span>
                  </li>
                ))}
              </ol>
              <p className="create__muted">{p.estimateNote}</p>
              <Banner tone="info">{p.soonNote}</Banner>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
