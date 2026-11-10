/**
 * GatePanel
 * Gates 1-6 of the IELTS path: the four skills to take, and once the gate is finished its result (how each band
 * compares with the target), a teacher's band, the retest of one skill, the decision after Gates 3 and 4, and the
 * stop after two fails. What can be done next is always spelled out.
 */
import type React from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Button, Card, Select, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { examPath } from '@/features/exams/examRoutes';
import { ApiRequestError, errorMessage } from '@/shared/http';
import { formatDay } from '@/shared/roadmapApi';
import { formatBand, GATE_TARGETS, ieltsPathApi, type GateSkill, type GateView, type PathSkill } from '@/shared/ieltsPathApi';
import { SkillRow } from './SkillRow';
import './ieltsPath.css';

const MANUAL_BANDS = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

const TeacherBand: React.FC<{ gate: number; skill: 'writing' | 'speaking'; row: GateSkill; onChange: () => void }> = ({ gate, skill, row, onChange }) => {
  const { t } = useI18n();
  const g = t.ieltsPath.gates;
  const [value, setValue] = useState(row.band ?? 5);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = async (band: number | null) => {
    setBusy(true);
    setFailed(false);
    try {
      await ieltsPathApi.setManualBand(gate, skill, band);
      onChange();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ipath__teacher">
      <label>
        <span className="create__muted">
          {g.teacher.label}: {t.ielts.components[skill]}
        </span>
        <Select value={value} onChange={(e) => setValue(Number(e.target.value))}>
          {MANUAL_BANDS.map((band) => (
            <option key={band} value={band}>
              {formatBand(band)}
            </option>
          ))}
        </Select>
      </label>
      <Button size="sm" variant="secondary" onClick={() => void save(value)} disabled={busy}>
        {g.teacher.set}
      </Button>
      {row.manual && (
        <Button size="sm" variant="ghost" onClick={() => void save(null)} disabled={busy}>
          {g.teacher.clear}
        </Button>
      )}
      {failed && <span className="create__muted">{g.teacher.error}</span>}
    </div>
  );
};

export const GatePanel: React.FC<{ view: GateView; reload: () => void }> = ({ view, reload }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const p = t.ieltsPath;
  const g = p.gates;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = GATE_TARGETS[view.gate];
  const retaking = view.status === 'finished' && view.outcome === 'fail' && view.startBlock === null;
  const showResult = view.status === 'finished' && !retaking;
  const canStart = view.startBlock === null || view.status === 'in_progress';
  const skills: GateSkill[] = retaking ? view.skills.map((s) => ({ ...s, status: 'todo', sessionId: null, band: null, manual: false, correct: null, total: null })) : view.skills;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiRequestError && e.code === 'gate_not_ready' ? g.notReady : errorMessage(e, t) || g.startError);
    } finally {
      setBusy(false);
    }
  };
  const start = (skill: PathSkill) =>
    run(async () => {
      const { sessionId } = await ieltsPathApi.startSkill(view.gate, skill);
      navigate(examPath(sessionId));
    });
  const openRetest = () =>
    run(async () => {
      const { sessionId } = await ieltsPathApi.startRetest(view.gate);
      navigate(examPath(sessionId));
    });
  const decide = (choice: 'accept' | 'decline') =>
    run(async () => {
      await ieltsPathApi.decide(view.gate, choice);
      reload();
    });
  const replan = () =>
    run(async () => {
      await ieltsPathApi.replan();
      reload();
    });

  const weakNames = (view.evaluation?.weak ?? []).map((skill) => t.ielts.components[skill]).join(', ');
  const blockMessage = view.startBlock && view.status !== 'in_progress' && view.startBlock !== 'cleared' && view.startBlock !== 'stopped' ? g.blocks[view.startBlock] : null;

  return (
    <Card padding="lg" className="ipath__gate">
      <div className="ipath__gate-head">
        <h2>{g.title(view.gate)}</h2>
        <Tag tone="neutral">{p.phaseName(view.gate)}</Tag>
        {view.version === 'B' && <Tag tone="notice">{g.versionB}</Tag>}
      </div>
      <p className="create__muted">{g.targets(formatBand(targets.lr), formatBand(targets.ws))}</p>

      {error && <Banner tone="warning">{error}</Banner>}
      {view.stopped && (
        <Banner
          tone="warning"
          action={
            <Link to={ROUTES.IELTS_PATH_START} className="stage__more">
              {g.stopped.change}
            </Link>
          }
        >
          <strong>{g.stopped.title}</strong> {g.stopped.body}
        </Banner>
      )}
      {view.stopped && (
        <Button variant="secondary" onClick={() => void replan()} disabled={busy}>
          {g.stopped.again}
        </Button>
      )}
      {blockMessage && (
        <Banner
          tone="info"
          action={
            view.startBlock === 'steps-left' ? (
              <Link to={ROUTES.HOME} className="stage__more">
                {g.goToday}
              </Link>
            ) : undefined
          }
        >
          {blockMessage}
        </Banner>
      )}

      {showResult && view.evaluation && view.outcome && (
        <div className="ipath__result">
          <Tag tone={view.outcome === 'pass' ? 'brand' : view.outcome === 'conditional' ? 'notice' : 'hard'}>{(view.outcome === 'pass' ? '✓ ' : '') + g.outcome[view.outcome]}</Tag>
          <p>{view.outcome === 'conditional' ? g.outcomeBody.conditional(weakNames) : g.outcomeBody[view.outcome]}</p>
          <table className="ipath__table">
            <thead>
              <tr>
                <th>{g.tableSkill}</th>
                <th>{g.tableBand}</th>
                <th>{g.tableTarget}</th>
                <th>{g.tableShort}</th>
              </tr>
            </thead>
            <tbody>
              {view.evaluation.skills.map((row) => (
                <tr key={row.skill}>
                  <th scope="row">
                    {t.ielts.components[row.skill]}
                    {view.skills.find((s) => s.skill === row.skill)?.manual && <> <Tag tone="neutral">{g.teacher.tag}</Tag></>}
                  </th>
                  <td>{formatBand(row.band)}</td>
                  <td>{formatBand(row.target)}</td>
                  <td>{row.short > 0 ? formatBand(row.short) : `✓ ${g.reached}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details className="ipath__teacher-box">
            <summary>{g.teacher.label}</summary>
            <p className="create__muted">{g.teacher.hint}</p>
            {(['writing', 'speaking'] as const).map((skill) => {
              const row = view.skills.find((s) => s.skill === skill);
              return row ? <TeacherBand key={`${skill}-${row.band}-${row.manual}`} gate={view.gate} skill={skill} row={row} onChange={reload} /> : null;
            })}
          </details>
        </div>
      )}

      {view.retest && showResult && (
        <div className="ipath__retest">
          <strong>{g.retest.title(t.ielts.components[view.retest.skill])}</strong>
          <p className="create__muted">
            {view.retest.status === 'locked'
              ? g.retest.locked(formatDay(view.retest.availableFrom))
              : view.retest.status === 'due'
                ? g.retest.due
                : view.retest.status === 'grading'
                  ? g.retest.grading
                  : view.retest.status === 'failed'
                    ? g.retest.failed
                    : view.retest.status === 'done' && view.retest.band !== null
                      ? g.retest.done(formatBand(view.retest.band))
                      : g.retest.due}
          </p>
          {view.retest.status !== 'locked' && view.retest.status !== 'done' && (
            <Button variant="secondary" onClick={() => void openRetest()} disabled={busy}>
              {view.retest.sessionId ? g.retest.resume : g.retest.start}
            </Button>
          )}
        </div>
      )}

      {view.decision && showResult && (
        <div className="ipath__decision">
          {view.decision.kind === 'move-exam' ? (
            <>
              <strong>{g.decision.moveTitle}</strong>
              <p>{g.decision.moveBody(formatDay(view.decision.earliest), formatDay(view.decision.latest))}</p>
            </>
          ) : (
            <>
              <strong>{g.decision.lowerTitle}</strong>
              <p>{g.decision.lowerBody}</p>
            </>
          )}
          {view.decision.choice ? (
            <p className="create__muted">{view.decision.choice === 'accept' ? g.decision.accepted : g.decision.declined}</p>
          ) : (
            <div className="ipath__decision-actions">
              <Button onClick={() => void decide('accept')} disabled={busy}>
                {view.decision.kind === 'move-exam' ? g.decision.moveAccept(formatDay(view.decision.earliest)) : g.decision.lowerAccept}
              </Button>
              <Button variant="ghost" onClick={() => void decide('decline')} disabled={busy}>
                {view.decision.kind === 'move-exam' ? g.decision.moveDecline : g.decision.lowerDecline}
              </Button>
            </div>
          )}
        </div>
      )}

      {!showResult && !view.stopped && (
        <>
          {retaking ? (
            <>
              <strong>{g.retakeTitle}</strong>
              <p className="create__muted">{g.retakeBody}</p>
            </>
          ) : (
            <p className="create__muted">{g.about}</p>
          )}
          <ul className="ipath__skills">
            {skills.map((skill) => (
              <SkillRow
                key={skill.skill}
                skill={skill}
                finished={!canStart}
                busy={busy || !canStart}
                onStart={() => void start(skill.skill)}
                onSkip={() => undefined}
                onOpen={() => skill.sessionId && navigate(examPath(skill.sessionId))}
              />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
};
