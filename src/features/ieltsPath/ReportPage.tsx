/**
 * ReportPage
 * The progress report of the IELTS path on one page: goal and exam date, how far through the syllabus, bands against
 * the targets, the gates, what to work on, and how the AI's writing and speaking bands compare with a teacher's.
 * Printable (the browser's print dialog saves it as PDF).
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorState, Skeleton } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { formatBand, ieltsPathApi, PATH_SKILLS, type PathReport } from '@/shared/ieltsPathApi';
import './ieltsPath.css';

const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}`;

export const ReportPage: React.FC = () => {
  const { t } = useI18n();
  const p = t.ieltsPath;
  const r = p.report;
  const [report, setReport] = useState<PathReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    ieltsPathApi
      .report()
      .then((result) => active && setReport(result.report))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed)
    return (
      <ErrorState
        title={r.loadError}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {p.retry}
          </Button>
        }
      />
    );
  if (!report) return <Skeleton height={160} label={t.common.loading} />;

  const focus = (['writing', 'speaking'] as const).flatMap((skill) => {
    const criterion = report.focus[skill];
    return criterion ? [r.focus(t.ielts.components[skill], criterion.name, formatBand(criterion.band))] : [];
  });
  const calibrated = (['writing', 'speaking'] as const).flatMap((skill) => {
    const diff = report.calibration.meanDiff[skill];
    return diff === null ? [] : [r.calibration(t.ielts.components[skill], signed(diff), report.calibration.pairs.filter((x) => x.skill === skill).length)];
  });

  return (
    <div className="report">
      <header className="errbook__head">
        <h1>{r.title}</h1>
        <p className="create__muted">{r.intro}</p>
        <p className="create__muted">{r.generated(report.generatedOn)}</p>
        <div className="report__actions">
          <Button variant="secondary" onClick={() => window.print()}>
            {r.print}
          </Button>
          <Link to={ROUTES.IELTS_PATH} className="stage__more">
            {r.back}
          </Link>
        </div>
      </header>

      <Card padding="lg">
        <h2>{r.goalTitle}</h2>
        <p>{r.goal(formatBand(report.overallTarget))}</p>
        <p className="create__muted">{report.examDate ? r.exam(report.examDate, report.daysToExam) : r.noExam}</p>
      </Card>

      <Card padding="lg">
        <h2>{r.progressTitle}</h2>
        <p>{r.progress(report.progress.done, report.progress.total, report.progress.percent)}</p>
        {report.position && <p className="create__muted">{r.position(report.position.phase, report.position.week, report.position.day)}</p>}
        <p className="create__muted">{report.behind.alert ? r.behind(report.behind.days) : r.onTime}</p>
        {report.eta && <p className="create__muted">{r.eta(report.eta.from, report.eta.to)}</p>}
      </Card>

      <Card padding="lg">
        <h2>{r.bandsTitle}</h2>
        <table className="report__table">
          <thead>
            <tr>
              <th>{r.colSkill}</th>
              <th>{r.colTarget}</th>
              <th>{r.colGate}</th>
              <th>{r.colPractice}</th>
            </tr>
          </thead>
          <tbody>
            {PATH_SKILLS.map((skill) => {
              const row = report.bands[skill];
              return (
                <tr key={skill}>
                  <td>{t.ielts.components[skill]}</td>
                  <td>{formatBand(row.target)}</td>
                  <td>{row.gate === null ? r.none : formatBand(row.gate)}</td>
                  <td>{row.practice === null ? r.none : formatBand(row.practice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card padding="lg">
        <h2>{r.gatesTitle}</h2>
        {report.gates.length === 0 ? (
          <p className="create__muted">{r.noGates}</p>
        ) : (
          <ul className="report__list">
            {report.gates.map((g) => (
              <li key={g.gate}>
                <strong>{r.gate(g.gate)}</strong>: {r.outcome[g.outcome ?? 'open'] ?? r.outcome.open}, {r.tries(g.tries)}
                {g.bands && ` (${[g.bands.listening, g.bands.reading, g.bands.writing, g.bands.speaking].map((b) => (b === null ? '-' : formatBand(b))).join(' / ')})`}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="lg">
        <h2>{r.focusTitle}</h2>
        {focus.length === 0 ? (
          <p className="create__muted">{r.noFocus}</p>
        ) : (
          <ul className="report__list">
            {focus.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="lg">
        <h2>{r.calibrationTitle}</h2>
        {calibrated.length === 0 ? (
          <p className="create__muted">{r.calibrationNone}</p>
        ) : (
          <>
            <ul className="report__list">
              {calibrated.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="create__muted">{r.calibrationHint}</p>
          </>
        )}
      </Card>
    </div>
  );
};
