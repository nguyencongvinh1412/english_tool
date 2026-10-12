/**
 * JlptSession
 * Full-screen JLPT test runner (timer, autosave, navigator by 大問) and the result with
 * estimated scaled scores, sectional minimums and pass/fail
 */
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, Button, Card, Icon, Modal, ProgressBar } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { ensureJapaneseFont } from '@/shared/ja/furigana';
import { ROUTES } from '@/app/routes';
import { LocaleToggle } from '@/app/LocaleToggle';
import { jlptQuestionCount, type JlptGroup, type JlptSection, type JlptSession, type Mondai } from '@/shared/jlptApi';
import { JlptGroupView } from './JlptGroupView';
import { formatClock, useExamRunner } from './useExamRunner';
import './exams.css';
import './jlpt.css';

interface FlatGroup {
  mondai: Mondai;
  section: JlptSection;
  group: JlptGroup;
  firstNumber: number;
  questionIds: string[];
}

/**
 * Groups in test order with their question numbers
 */
function flatten(session: JlptSession): FlatGroup[] {
  let number = 1;
  return session.sections.flatMap((section) =>
    section.groups.map((group) => {
      const questionIds = Array.from({ length: jlptQuestionCount(group) }, (_, i) => `${group.id}:${i}`);
      const flat = { mondai: section.mondai, section: section.section, group, firstNumber: number, questionIds };
      number += questionIds.length;
      return flat;
    })
  );
}

const SECTION_TONE: Record<JlptSection, 'writing' | 'exam' | 'reading' | 'listening'> = {
  vocab: 'writing',
  grammar: 'exam',
  reading: 'reading',
  listening: 'listening',
};

const Runner: React.FC<{ session: JlptSession; onSubmitted: (session: JlptSession) => void }> = ({ session, onSubmitted }) => {
  const { t } = useI18n();
  const groups = useMemo(() => flatten(session), [session]);
  const allIds = useMemo(() => groups.flatMap((g) => g.questionIds), [groups]);
  const { answers, flags, answer, toggleFlag, saveState, secondsLeft, submit: submitNow, isSubmitting, error } = useExamRunner<number, JlptSession>(
    session,
    onSubmitted
  );
  const positionKey = `english-tool:exam-position:${session.id}`;
  const [index, setIndex] = useState(() => {
    try {
      const saved = Number(sessionStorage.getItem(positionKey));
      return Number.isInteger(saved) && saved > 0 && saved < groups.length ? saved : 0;
    } catch {
      return 0;
    }
  });
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(positionKey, String(index));
    } catch {
      // Storage unavailable; position resets on reload
    }
  }, [positionKey, index]);

  const current = groups[index];
  const unanswered = allIds.filter((id) => answers[id] === undefined).length;
  const saveLabel = { idle: '', saving: t.exams.saving, saved: t.exams.saved, error: t.exams.saveFailed }[saveState];

  const goTo = (groupIndex: number, questionId?: string) => {
    setIndex(groupIndex);
    requestAnimationFrame(() => {
      const target = questionId ? document.getElementById(`q-${questionId}`) : null;
      (target ?? document.querySelector('.exam-main'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const submit = () => {
    setConfirmOpen(false);
    void submitNow();
  };

  return (
    <div className="exam-shell jlpt-shell">
      <header className="exam-bar">
        <Link to={ROUTES.EXAMS} className="exam-bar__back" aria-label={t.exams.backToExams}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <div className="exam-bar__title">
          <strong>
            JLPT {session.level} · {t.jlpt.modeLabel[session.mode]}
          </strong>
          <span>
            {t.jlpt.sections[current.section]} · <span lang="ja">{t.jlpt.mondai[current.mondai].title}</span>
          </span>
        </div>
        <span className={`exam-bar__save exam-bar__save--${saveState}`} aria-live="polite">
          {saveLabel}
        </span>
        <span className={`exam-timer ${secondsLeft < 5 * 60 ? 'exam-timer--low' : ''}`} role="timer" aria-label={t.exams.timeLeft}>
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
            <p className="jlpt-mondai-title">
              <Badge tone={SECTION_TONE[current.section]}>{t.jlpt.sections[current.section]}</Badge>
              <span lang="ja">{t.jlpt.mondai[current.mondai].title}</span>
            </p>
            <JlptGroupView
              mondai={current.mondai}
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
            <div key={section.mondai} className="exam-nav__part">
              <p className="exam-nav__part-name" lang="ja">
                {t.jlpt.mondai[section.mondai].title}
              </p>
              <div className="exam-nav__grid">
                {groups
                  .map((g, gi) => ({ g, gi }))
                  .filter(({ g }) => g.mondai === section.mondai)
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
 * Scores, pass/fail and the review
 */
const Result: React.FC<{ session: JlptSession }> = ({ session }) => {
  const { t } = useI18n();
  const groups = useMemo(() => flatten(session), [session]);
  const result = session.result;
  if (!result) return null;

  return (
    <div className="exam-shell exam-shell--result jlpt-shell">
      <header className="exam-bar">
        <Link to={ROUTES.EXAMS} className="exam-bar__back" aria-label={t.exams.backToExams}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <div className="exam-bar__title">
          <strong>
            JLPT {session.level} · {t.jlpt.modeLabel[session.mode]}
          </strong>
          <span>{t.exams.resultTitle}</span>
        </div>
        <LocaleToggle />
      </header>

      <main className="exam-result">
        <Card padding="lg" className="exam-score reveal">
          {result.total !== null && (
            <div className="exam-score__total">
              <span className="exam-score__label">{t.exams.estimate}</span>
              <span className="exam-score__value">{result.total}</span>
              <span className="exam-score__scale">/ 180</span>
              <span className={`jlpt-verdict jlpt-verdict--${result.passed ? 'pass' : 'fail'}`}>
                <Icon name={result.passed ? 'check' : 'x'} size={18} />
                {result.passed ? t.jlpt.passed : t.jlpt.failed}
              </span>
              <span className="jlpt-passmark">{t.jlpt.passMark(result.passMark)}</span>
            </div>
          )}
          <div className="exam-score__sections">
            {result.sections.map((section) => (
              <div key={section.id} className={`exam-score__section jlpt-score--${section.passedMinimum ? 'ok' : 'low'}`}>
                <span className="exam-score__label">{t.jlpt.scoreSections[section.id]}</span>
                <span className="exam-score__value exam-score__value--sm">
                  {section.scaled}
                  <small> / {section.max}</small>
                </span>
                <span className="exam-score__raw">{t.exams.raw(section.correct, section.total)}</span>
                <span className="jlpt-minimum">
                  {section.passedMinimum ? t.jlpt.minimumOk(section.minimum) : t.jlpt.minimumLow(section.minimum)}
                </span>
              </div>
            ))}
          </div>
          <p className="exam-score__note">{result.total === null ? t.jlpt.partialNote : t.jlpt.estimateNote}</p>
        </Card>

        <Card padding="lg">
          <h2 className="exams__section-title">{t.jlpt.byMondai}</h2>
          <ul className="exam-part-bars">
            {result.mondai.map((row) => (
              <li key={row.mondai}>
                <span className="exam-part-bars__name" lang="ja">
                  {t.jlpt.mondai[row.mondai].title}
                </span>
                <ProgressBar value={row.total ? (row.correct / row.total) * 100 : 0} tone={SECTION_TONE[row.section]} size="sm" label={t.jlpt.mondai[row.mondai].title} />
                <span className="exam-part-bars__raw">
                  {row.correct}/{row.total}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <h2 className="exams__section-title">{t.exams.review}</h2>
        {groups.map((g) => (
          <Card key={g.group.id} padding="lg" className="exam-card">
            <p className="jlpt-mondai-title">
              <Badge tone={SECTION_TONE[g.section]}>{t.jlpt.sections[g.section]}</Badge>
              <span lang="ja">{t.jlpt.mondai[g.mondai].title}</span>
            </p>
            <JlptGroupView mondai={g.mondai} group={g.group} firstNumber={g.firstNumber} answers={session.answers} flags={[]} review />
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

export const JlptSessionScreen: React.FC<{ session: JlptSession; onChange: (session: JlptSession) => void }> = ({ session, onChange }) => {
  useEffect(ensureJapaneseFont, []);
  return session.status === 'submitted' ? <Result session={session} /> : <Runner session={session} onSubmitted={onChange} />;
};
