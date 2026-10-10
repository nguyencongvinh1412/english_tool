/**
 * ExamSessionPage
 * Focused, full-screen test runner (timer, autosave, navigator, submit) and the result review
 */
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Banner, Button, Card, Icon, Modal, ProgressBar, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { apiFetch, errorMessage } from '@/shared/http';
import { groupQuestionIds, type ExamSession, type ToeicPart } from '@/shared/examApi';
import { ROUTES } from '@/app/routes';
import { LocaleToggle } from '@/app/LocaleToggle';
import { ExamGroupView } from './ExamGroupView';
import { IeltsSessionScreen } from './IeltsSession';
import type { IeltsSession } from '@/shared/ieltsApi';
import { formatClock, useExamRunner } from './useExamRunner';
import './exams.css';

interface FlatGroup {
  part: ToeicPart;
  section: 'listening' | 'reading';
  group: ExamSession['sections'][number]['groups'][number];
  firstNumber: number;
  questionIds: string[];
}

/**
 * Groups in test order with their question numbers
 */
function flatten(session: ExamSession): FlatGroup[] {
  let number = 1;
  return session.sections.flatMap((section) =>
    section.groups.map((group) => {
      const questionIds = groupQuestionIds(section.part, group);
      const flat = { part: section.part, section: section.section, group, firstNumber: group.payload.startNumber ?? number, questionIds };
      number += questionIds.length;
      return flat;
    })
  );
}

/**
 * Test runner for an in-progress session
 */
const ExamRunner: React.FC<{ session: ExamSession; onSubmitted: (session: ExamSession) => void }> = ({ session, onSubmitted }) => {
  const { t } = useI18n();
  const groups = useMemo(() => flatten(session), [session]);
  const allIds = useMemo(() => groups.flatMap((g) => g.questionIds), [groups]);
  const { answers, flags, answer, toggleFlag, saveState, secondsLeft, submit: submitNow, isSubmitting, error } = useExamRunner<number, ExamSession>(
    session,
    onSubmitted
  );
  // Remember the current group across reloads of this tab
  const positionKey = `english-tool:exam-position:${session.id}`;
  const [index, setIndex] = useState(() => {
    try {
      const saved = Number(sessionStorage.getItem(positionKey));
      return Number.isInteger(saved) && saved > 0 && saved < groups.length ? saved : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(positionKey, String(index));
    } catch {
      // Storage unavailable; position resets on reload
    }
  }, [positionKey, index]);
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const current = groups[index];
  const unanswered = allIds.filter((id) => answers[id] === undefined).length;

  const submit = () => {
    setConfirmOpen(false);
    void submitNow();
  };

  const goTo = (groupIndex: number, questionId?: string) => {
    setIndex(groupIndex);
    requestAnimationFrame(() => {
      const target = questionId ? document.getElementById(`q-${questionId}`) : null;
      (target ?? document.querySelector('.exam-main'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const saveLabel = { idle: '', saving: t.exams.saving, saved: t.exams.saved, error: t.exams.saveFailed }[saveState];
  const lowTime = secondsLeft < 5 * 60;

  return (
    <div className="exam-shell">
      <header className="exam-bar">
        <Link to={ROUTES.EXAMS} className="exam-bar__back" aria-label={t.exams.backToExams}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <div className="exam-bar__title">
          <strong>TOEIC · {session.title ?? t.exams.modeLabel[session.mode]}</strong>
          <span>
            {t.exams.partName(current.part)} · {t.exams.partTitles[current.part]}
          </span>
        </div>
        <span className={`exam-bar__save exam-bar__save--${saveState}`} aria-live="polite">
          {saveLabel}
        </span>
        <span className={`exam-timer ${lowTime ? 'exam-timer--low' : ''}`} role="timer" aria-label={t.exams.timeLeft}>
          <Icon name="target" size={18} />
          {formatClock(secondsLeft)}
        </span>
        <LocaleToggle />
        <Button variant="exam" size="sm" onClick={() => setConfirmOpen(true)} disabled={isSubmitting}>
          {isSubmitting ? t.exams.submitting : t.exams.submit}
        </Button>
      </header>

      <div className="exam-body">
        <main className="exam-main">
          {secondsLeft === 0 && <Banner tone="warning">{t.exams.timeUp}</Banner>}
          {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

          <ProgressBar value={((allIds.length - unanswered) / allIds.length) * 100} tone="exam" size="sm" label={t.exams.answered} />

          <Card padding="lg" className="exam-card" key={current.group.id}>
            <ExamGroupView
              part={current.part}
              group={current.group}
              firstNumber={current.firstNumber}
              answers={answers}
              flags={flags}
              playOnce={session.mode !== 'part'}
              played={played.has(current.group.id)}
              onPlayed={() => setPlayed((prev) => new Set(prev).add(current.group.id))}
              onAnswer={answer}
              onToggleFlag={toggleFlag}
            />
          </Card>

          <div className="exam-pager">
            <Button variant="secondary" icon="arrowLeft" onClick={() => goTo(index - 1)} disabled={index === 0}>
              {t.exams.prev}
            </Button>
            <span className="exam-pager__pos">
              {index + 1} / {groups.length}
            </span>
            {index < groups.length - 1 ? (
              <Button variant="exam" icon="chevronRight" onClick={() => goTo(index + 1)}>
                {t.exams.next}
              </Button>
            ) : (
              <Button variant="exam" icon="check" onClick={() => setConfirmOpen(true)} disabled={isSubmitting}>
                {t.exams.submit}
              </Button>
            )}
          </div>
        </main>

        <aside className="exam-nav" aria-label={t.exams.navigator}>
          <p className="exam-nav__title">{t.exams.navigator}</p>
          <p className="exam-nav__legend">
            <span className="exam-dot exam-dot--answered" /> {t.exams.answered}
            <span className="exam-dot exam-dot--flagged" /> {t.exams.flagged}
          </p>
          {session.sections.map((section) => (
            <div key={section.part} className="exam-nav__part">
              <p className="exam-nav__part-name">{t.exams.partName(section.part)}</p>
              <div className="exam-nav__grid">
                {groups
                  .map((g, gi) => ({ g, gi }))
                  .filter(({ g }) => g.part === section.part)
                  .flatMap(({ g, gi }) =>
                    g.questionIds.map((id, qi) => (
                      <button
                        key={id}
                        type="button"
                        className={`exam-num ${answers[id] !== undefined ? 'exam-num--answered' : ''} ${flags.includes(id) ? 'exam-num--flagged' : ''} ${gi === index ? 'exam-num--current' : ''}`}
                        onClick={() => goTo(gi, id)}
                        aria-label={t.exams.question(g.firstNumber + qi)}
                      >
                        {g.firstNumber + qi}
                      </button>
                    ))
                  )}
              </div>
            </div>
          ))}
        </aside>
      </div>

      <Modal
        open={confirmOpen}
        title={t.exams.submitTitle}
        onClose={() => setConfirmOpen(false)}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t.exams.keepWorking}
            </Button>
            <Button variant="exam" onClick={submit} loading={isSubmitting}>
              {t.exams.submitConfirm}
            </Button>
          </>
        }
      >
        <p>{t.exams.submitBody(unanswered)}</p>
      </Modal>
    </div>
  );
};

/**
 * Scores and review after submit
 */
const ExamResultView: React.FC<{ session: ExamSession }> = ({ session }) => {
  const { t } = useI18n();
  const groups = useMemo(() => flatten(session), [session]);
  const result = session.result;
  if (!result) return null;

  return (
    <div className="exam-shell exam-shell--result">
      <header className="exam-bar">
        <Link to={ROUTES.EXAMS} className="exam-bar__back" aria-label={t.exams.backToExams}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <div className="exam-bar__title">
          <strong>TOEIC · {session.title ?? t.exams.modeLabel[session.mode]}</strong>
          <span>{t.exams.resultTitle}</span>
        </div>
        <LocaleToggle />
      </header>

      <main className="exam-result">
        <Card padding="lg" className="exam-score reveal">
          {result.totalScaled !== null && (
            <div className="exam-score__total">
              <span className="exam-score__label">{t.exams.estimate}</span>
              <span className="exam-score__value">{result.totalScaled}</span>
              <span className="exam-score__scale">/ 990</span>
            </div>
          )}
          <div className="exam-score__sections">
            {(['listening', 'reading'] as const).map((name) => {
              const section = result.sections[name];
              if (!section) return null;
              return (
                <div key={name} className={`exam-score__section exam-score__section--${name}`}>
                  <span className="exam-score__label">{name === 'listening' ? t.exams.listening : t.exams.reading}</span>
                  <span className="exam-score__value exam-score__value--sm">{section.scaled}</span>
                  <span className="exam-score__raw">{t.exams.raw(section.correct, section.total)}</span>
                </div>
              );
            })}
          </div>
          <p className="exam-score__note">{t.exams.estimateNote}</p>
        </Card>

        <Card padding="lg">
          <h2 className="exams__section-title">{t.exams.byPartTitle}</h2>
          <ul className="exam-part-bars">
            {result.parts.map((part) => (
              <li key={part.part}>
                <span className="exam-part-bars__name">
                  {t.exams.partName(part.part)} · {t.exams.partTitles[part.part]}
                </span>
                <ProgressBar value={part.total ? (part.correct / part.total) * 100 : 0} tone={part.section === 'listening' ? 'listening' : 'reading'} size="sm" label={t.exams.partName(part.part)} />
                <span className="exam-part-bars__raw">
                  {part.correct}/{part.total}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <h2 className="exams__section-title">{t.exams.review}</h2>
        {groups.map((g) => (
          <Card key={g.group.id} padding="lg" className="exam-card">
            <p className="exam-review__part">
              {t.exams.partName(g.part)} · {t.exams.partTitles[g.part]}
            </p>
            <ExamGroupView part={g.part} group={g.group} firstNumber={g.firstNumber} answers={session.answers} flags={[]} review />
          </Card>
        ))}

        <Link to={ROUTES.EXAMS} className="btn btn--exam btn--md exam-result__back">
          <Icon name="arrowLeft" size={20} />
          <span>{t.exams.backToExams}</span>
        </Link>
      </main>
    </div>
  );
};

export const ExamSessionPage: React.FC = () => {
  const { t } = useI18n();
  const { sessionId = '' } = useParams();
  const [session, setSession] = useState<ExamSession | IeltsSession | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<{ session: ExamSession | IeltsSession }>(`/api/exams/sessions/${sessionId}`)
      .then(({ session: loaded }) => setSession(loaded))
      .catch(setError);
  }, [sessionId]);

  if (error !== null) {
    return (
      <div className="exam-shell exam-shell--center">
        <Banner tone="danger">{errorMessage(error, t)}</Banner>
        <Link to={ROUTES.EXAMS}>{t.exams.backToExams}</Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="exam-shell exam-shell--center">
        <Spinner size={36} label={t.common.loading} />
      </div>
    );
  }

  if (session.exam === 'ielts') return <IeltsSessionScreen session={session} onChange={setSession} />;

  return session.status === 'submitted' ? (
    <ExamResultView session={session} />
  ) : (
    <ExamRunner session={session} onSubmitted={setSession} />
  );
};
