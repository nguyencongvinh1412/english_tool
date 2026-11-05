/**
 * ExamChrome
 * The frame of every test session: the header (close with a confirm, title, "saved" state, countdown) and
 * the footer (one primary button, a quiet link to go back). Shared by TOEIC, IELTS and JLPT.
 */
import type React from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Icon, LinkButton, Modal, Tag, type TagTone } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { formatClock, type SaveState } from './useExamRunner';

/** Under this many seconds the clock turns amber (never red: UX4) */
const LOW_SECONDS = 5 * 60;

export const ExamBar: React.FC<{ title: React.ReactNode; subtitle: React.ReactNode; saveState: SaveState; secondsLeft: number }> = ({
  title,
  subtitle,
  saveState,
  secondsLeft,
}) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const save = { idle: '', saving: t.exams.saving, saved: t.exams.saved, error: t.exams.saveFailed }[saveState];

  return (
    <>
      <header className="exam-bar">
        <button type="button" className="exam-bar__back" aria-label={t.activity.close} onClick={() => setConfirming(true)}>
          <Icon name="x" size={20} />
        </button>
        <div className="exam-bar__title">
          <strong>{title}</strong>
          <span>
            {subtitle}
            {save && (
              <span className={`exam-bar__save exam-bar__save--${saveState}`} aria-live="polite">
                {' · '}
                {save}
              </span>
            )}
          </span>
        </div>
        <span className={`exam-timer ${secondsLeft < LOW_SECONDS ? 'exam-timer--low' : ''}`} role="timer" aria-label={t.exams.timeLeft}>
          <Icon name="target" size={16} />
          {formatClock(secondsLeft)}
        </span>
      </header>
      <Modal
        open={confirming}
        title={t.exams.exitTitle}
        onClose={() => setConfirming(false)}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => navigate(ROUTES.EXAMS)}>
              {t.exams.exitLeave}
            </Button>
            <Button onClick={() => setConfirming(false)}>{t.exams.keepWorking}</Button>
          </>
        }
      >
        <p>{t.exams.exitBody}</p>
      </Modal>
    </>
  );
};

/** Bottom of a session: next (or submit on the last step), and a quiet link back */
export const ExamFooter: React.FC<{
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitting: boolean;
}> = ({ index, total, onPrev, onNext, onSubmit, submitting }) => {
  const { t } = useI18n();
  const last = index >= total - 1;
  return (
    <div className="exam-footer">
      <span className="exam-footer__pos">{t.exams.step(index + 1, total)}</span>
      {last ? (
        <Button size="lg" icon="check" onClick={onSubmit} loading={submitting}>
          {t.exams.submit}
        </Button>
      ) : (
        <Button size="lg" onClick={onNext}>
          {t.exams.nextStep}
        </Button>
      )}
      {index > 0 && (
        <button type="button" className="exam-footer__link" onClick={onPrev}>
          {t.exams.prevStep}
        </button>
      )}
    </div>
  );
};

/** Header of a result page: back to the test list, the title and the date */
export const ResultBar: React.FC<{ title: React.ReactNode; date: string | null }> = ({ title, date }) => {
  const { t, formatDate } = useI18n();
  return (
    <header className="exam-bar">
      <Link to={ROUTES.EXAMS} className="exam-bar__back" aria-label={t.exams.backToExams}>
        <Icon name="arrowLeft" size={20} />
      </Link>
      <div className="exam-bar__title">
        <strong>{title}</strong>
        {date && <span>{formatDate(date)}</span>}
      </div>
    </header>
  );
};

export interface ResultRow {
  key: string;
  label: React.ReactNode;
  tone: TagTone;
  /** Text shown at the right ("6.5", "38 / 60") */
  value?: string;
  /** 0-1 length of the bar */
  ratio?: number;
  /** 0-1 position of the target tick */
  mark?: number;
  /** Against the target: met, near, or below (shown with a symbol, never by colour alone) */
  status?: 'met' | 'near' | 'below';
  /** Replaces the bar (grading in progress, grading failed) */
  custom?: React.ReactNode;
}

/** One bar per skill against its target (a black tick), with the verdict in words */
export const ResultRows: React.FC<{ rows: ResultRow[]; legend?: string }> = ({ rows, legend }) => {
  const { t } = useI18n();
  const verdict = { met: `✓ ${t.exams.targetMet}`, near: `◐ ${t.exams.targetNear}`, below: `○ ${t.exams.targetBelow}` };
  return (
    <section className="result-rows">
      {rows.map((row) => (
        <div key={row.key} className="result-row">
          <div className="result-row__head">
            <Tag tone={row.tone}>{row.label}</Tag>
            {row.value && <strong className="result-row__value">{row.value}</strong>}
            {row.status && <span className="result-row__status">{verdict[row.status]}</span>}
          </div>
          {row.custom ?? (
            <div className="result-row__track">
              <div className={`result-row__bar result-row__bar--${row.tone}`} style={{ width: `${Math.round(Math.min(1, row.ratio ?? 0) * 100)}%` }} />
              {row.mark !== undefined && <span className="result-row__mark" style={{ left: `${Math.round(row.mark * 100)}%` }} />}
            </div>
          )}
        </div>
      ))}
      {legend && <p className="result-rows__legend">{legend}</p>}
    </section>
  );
};

/** What to do after a result: one primary button and a quiet link to the answers */
export const ResultFooter: React.FC<{ reviewId: string }> = ({ reviewId }) => {
  const { t } = useI18n();
  return (
    <div className="exam-footer exam-footer--result">
      <LinkButton size="lg" to={ROUTES.ROADMAP}>
        {t.exams.nextActions}
      </LinkButton>
      <button type="button" className="exam-footer__link" onClick={() => document.getElementById(reviewId)?.scrollIntoView({ behavior: 'smooth' })}>
        {t.exams.seeAnswers}
      </button>
    </div>
  );
};
