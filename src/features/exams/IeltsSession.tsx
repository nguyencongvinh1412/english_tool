/**
 * IeltsSession
 * IELTS test runner (component tabs, timer, autosave, navigator) and the result with
 * band estimates, AI-graded writing and speaking, and the answer review
 */
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Card, Modal, ProgressBar, Spinner, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { errorMessage } from '@/shared/http';
import { essayId, groupAnswerIds, ieltsApi, type IeltsComponent, type IeltsGroup, type IeltsResult, type IeltsSession } from '@/shared/ieltsApi';
import { BandFeedback } from '@/features/practice/BandFeedback';
import { WritingPromptCard, WritingReview } from '@/features/writing/WritingReview';
import { ListeningPanel, ReadingPanel, SpeakingPanel, WritingPanel } from './IeltsPanels';
import { ExamBar, ExamFooter, ResultBar, ResultFooter, ResultRows, type ResultRow } from './ExamChrome';
import { useExamRunner } from './useExamRunner';
import './ielts.css';

/** Poll interval while the AI examiner grades writing and speaking */
const GRADING_POLL_MS = 3000;

interface FlatGroup {
  component: IeltsComponent;
  group: IeltsGroup;
  /** Position inside its component (Section 2, Passage 3, Task 1) */
  position: number;
  /** Number of the first objective question within the component */
  firstNumber: number;
  answerIds: string[];
}

/**
 * Groups in test order with their numbering
 */
function flatten(session: IeltsSession): FlatGroup[] {
  return session.sections.flatMap((section) => {
    let number = 1;
    return section.groups.map((group, position) => {
      const answerIds = groupAnswerIds(group);
      const flat = { component: section.component, group, position, firstNumber: number, answerIds };
      number += answerIds.length;
      return flat;
    });
  });
}

/**
 * "Section 2", "Passage 1", "Task 1" or "Parts 1-3"
 */
function useGroupLabel() {
  const { t } = useI18n();
  return (g: FlatGroup) => {
    if (g.group.kind === 'ielts-listening') return t.ielts.sectionName(g.group.payload.section);
    if (g.group.kind === 'ielts-reading') return t.ielts.passageName(g.position + 1);
    if (g.group.kind === 'writing-prompt') return t.ielts.taskName(g.group.payload.taskType === 'ielts-task1' ? 1 : 2);
    return t.ielts.speakingParts;
  };
}

/**
 * The panel for one group, while taking the test or in the review
 */
const GroupPanel: React.FC<{
  g: FlatGroup;
  answers: Record<string, number | string>;
  flags: string[];
  review: boolean;
  playOnce?: boolean;
  played?: boolean;
  onPlayed?: () => void;
  onAnswer?: (id: string, value: number | string) => void;
  onToggleFlag?: (id: string) => void;
  onFinish?: () => void;
  submitting?: boolean;
}> = ({ g, answers, flags, review, playOnce = false, played = false, onPlayed, onAnswer, onToggleFlag, onFinish, submitting }) => {
  const shared = { groupId: g.group.id, firstNumber: g.firstNumber, answers, flags, review, onAnswer, onToggleFlag };
  switch (g.group.kind) {
    case 'ielts-listening':
      return <ListeningPanel {...shared} payload={g.group.payload} playOnce={playOnce} played={played} onPlayed={() => onPlayed?.()} />;
    case 'ielts-reading':
      return <ReadingPanel {...shared} payload={g.group.payload} />;
    case 'writing-prompt':
      return (
        <WritingPanel
          groupId={g.group.id}
          payload={g.group.payload}
          value={String(answers[essayId(g.group.id)] ?? '')}
          review={review}
          onChange={(value) => onAnswer?.(essayId(g.group.id), value)}
        />
      );
    default:
      return <SpeakingPanel groupId={g.group.id} payload={g.group.payload} answers={answers} review={review} onAnswer={onAnswer} onFinish={onFinish} submitting={submitting} />;
  }
};

/**
 * Test runner for an in-progress session
 */
const IeltsRunner: React.FC<{ session: IeltsSession; onSubmitted: (session: IeltsSession) => void }> = ({ session, onSubmitted }) => {
  const { t } = useI18n();
  const groupLabel = useGroupLabel();
  const groups = useMemo(() => flatten(session), [session]);
  const allIds = useMemo(() => groups.flatMap((g) => g.answerIds), [groups]);
  const { answers, flags, answer, toggleFlag, saveState, secondsLeft, submit, isSubmitting, error } = useExamRunner<number | string, IeltsSession>(
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
  const components = session.sections.map((s) => s.component);

  const goTo = (groupIndex: number, questionId?: string) => {
    setIndex(groupIndex);
    requestAnimationFrame(() => {
      const target = questionId ? document.getElementById(`q-${questionId}`) : null;
      (target ?? document.querySelector('.exam-main'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };


  return (
    <div className="exam-shell">
      <ExamBar
        title={`IELTS · ${t.ielts.modeLabel[session.mode]}`}
        subtitle={`${t.ielts.components[current.component]} · ${groupLabel(current)}`}
        saveState={saveState}
        secondsLeft={secondsLeft}
      />

      {components.length > 1 && (
        <nav className="ielts-tabs" aria-label={t.ielts.componentsLabel}>
          {components.map((component) => {
            const first = groups.findIndex((g) => g.component === component);
            const ids = groups.filter((g) => g.component === component).flatMap((g) => g.answerIds);
            const done = ids.filter((id) => answers[id] !== undefined).length;
            return (
              <button
                key={component}
                type="button"
                className={`ielts-tab ielts-tab--${component} ${current.component === component ? 'ielts-tab--on' : ''}`}
                onClick={() => goTo(first)}
                aria-current={current.component === component ? 'step' : undefined}
              >
                {t.ielts.components[component]}
                <span className="ielts-tab__count">
                  {done}/{ids.length}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="exam-body">
        <main className="exam-main">
          {secondsLeft === 0 && <Banner tone="warning">{t.exams.timeUp}</Banner>}
          {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
          <ProgressBar value={((allIds.length - unanswered) / allIds.length) * 100} tone="exam" size="sm" label={t.exams.answered} />

          <Card padding="lg" className="exam-card" key={current.group.id}>
            <h2 className="ielts-group-title">
              {t.ielts.components[current.component]} · {groupLabel(current)}
            </h2>
            <GroupPanel
              g={current}
              answers={answers}
              flags={flags}
              review={false}
              playOnce={session.mode !== 'part'}
              played={played.has(current.group.id)}
              onPlayed={() => setPlayed((prev) => new Set(prev).add(current.group.id))}
              onAnswer={answer}
              onToggleFlag={toggleFlag}
              onFinish={() => setConfirmOpen(true)}
              submitting={isSubmitting}
            />
          </Card>

          {current.component !== 'speaking' && <ExamFooter index={index} total={groups.length} onPrev={() => goTo(index - 1)} onNext={() => goTo(index + 1)} onSubmit={() => setConfirmOpen(true)} submitting={isSubmitting} />}
        </main>

        <aside className="exam-nav" aria-label={t.exams.navigator}>
          <Button variant="secondary" block onClick={() => setConfirmOpen(true)} disabled={isSubmitting}>
            {t.exams.submitFromNav}
          </Button>
          <p className="exam-nav__title">{t.exams.navigator}</p>
          <p className="exam-nav__legend">
            <span className="exam-dot exam-dot--answered" /> {t.exams.answered}
            <span className="exam-dot exam-dot--flagged" /> {t.exams.flagged}
          </p>
          {components.map((component) => (
            <div key={component} className="exam-nav__part">
              <p className="exam-nav__part-name">{t.ielts.components[component]}</p>
              <div className="exam-nav__grid">
                {groups
                  .map((g, gi) => ({ g, gi }))
                  .filter(({ g }) => g.component === component)
                  .flatMap(({ g, gi }) =>
                    g.answerIds.map((id, qi) => {
                      const label =
                        component === 'writing' ? `T${g.group.kind === 'writing-prompt' && g.group.payload.taskType === 'ielts-task1' ? 1 : 2}` : String(g.firstNumber + qi);
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`exam-num ${answers[id] !== undefined ? 'exam-num--answered' : ''} ${flags.includes(id) ? 'exam-num--flagged' : ''} ${gi === index ? 'exam-num--current' : ''}`}
                          onClick={() => goTo(gi, id)}
                          aria-label={component === 'writing' ? label : t.exams.question(g.firstNumber + qi)}
                        >
                          {label}
                        </button>
                      );
                    })
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
            <Button
              variant="exam"
              onClick={() => {
                setConfirmOpen(false);
                void submit();
              }}
              loading={isSubmitting}
            >
              {t.exams.submitConfirm}
            </Button>
          </>
        }
      >
        <p>{t.exams.submitBody(unanswered)}</p>
        {(components.includes('writing') || components.includes('speaking')) && <p>{t.ielts.submitGradingNote}</p>}
      </Modal>
    </div>
  );
};


/** One skill's bar in the result: its band against the learner's target, or the state of the AI grading */
function ieltsRow(
  component: IeltsComponent,
  result: IeltsResult,
  target: number | null,
  t: ReturnType<typeof useI18n>['t'],
  onRetry: () => void,
  retrying: boolean
): ResultRow {
  const entry = result[component];
  const base = { key: component, label: t.ielts.components[component], tone: component } as const;
  if (!entry) return { ...base, custom: <span className="result-row__note">—</span> };
  if ('status' in entry && entry.status === 'pending') {
    return {
      ...base,
      custom: (
        <span className="result-row__note">
          <Spinner size={16} /> {t.ielts.grading}
        </span>
      ),
    };
  }
  if ('status' in entry && entry.status === 'failed') {
    return {
      ...base,
      custom: (
        <span className="result-row__note">
          {t.ielts.gradingFailed}{' '}
          <Button size="sm" variant="secondary" onClick={onRetry} loading={retrying}>
            {t.ielts.retryGrading}
          </Button>
        </span>
      ),
    };
  }
  const band = entry.band ?? 0;
  return {
    ...base,
    value: band.toFixed(1),
    ratio: band / 9,
    mark: target !== null ? target / 9 : undefined,
    status: target === null ? undefined : band >= target ? 'met' : band >= target - 0.5 ? 'near' : 'below',
  };
}

/**
 * Result: bands (writing and speaking arrive when the AI has graded them) and the review
 */
const IeltsResultView: React.FC<{ session: IeltsSession; onUpdate: (session: IeltsSession) => void }> = ({ session, onUpdate }) => {
  const { t } = useI18n();
  const toast = useToast();
  const groupLabel = useGroupLabel();
  const groups = useMemo(() => flatten(session), [session]);
  const result = session.result!;
  const user = useCurrentUser();
  const target = user.targetExam === 'ielts' && user.targetScore ? user.targetScore : null;
  const [retrying, setRetrying] = useState(false);
  const [tab, setTab] = useState<IeltsComponent>(session.sections[0]?.component ?? 'listening');
  const pending = result.writing?.status === 'pending' || result.speaking?.status === 'pending';

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => {
      ieltsApi
        .get(session.id)
        .then(({ session: latest }) => onUpdate(latest))
        .catch(() => undefined);
    }, GRADING_POLL_MS);
    return () => clearInterval(id);
  }, [pending, session.id, onUpdate]);

  const retry = async (): Promise<void> => {
    setRetrying(true);
    try {
      onUpdate((await ieltsApi.grade(session.id)).session);
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setRetrying(false);
    }
  };

  const components = session.sections.map((s) => s.component);

  return (
    <div className="exam-shell">
      <ResultBar title={`${t.ielts.resultTitle} · IELTS ${t.ielts.modeLabel[session.mode]}`} date={session.submittedAt ?? session.startedAt} />

      <main className="exam-result">
        <Card padding="lg" className="result-score">
          <span className="result-score__label">{t.ielts.overall}</span>
          {result.overall !== null ? (
            <p className="result-score__big">
              <strong>{result.overall.toFixed(1)}</strong>
            </p>
          ) : (
            <p className="result-score__note">{pending ? t.ielts.grading : components.length < 4 ? t.ielts.overallPartial : '—'}</p>
          )}
          {target !== null && <p className="result-score__target">{t.exams.yourTarget(target.toFixed(1))}</p>}
          <p className="result-score__note">{t.ielts.bandNote}</p>
        </Card>

        <ResultRows legend={target !== null ? t.exams.tickLegend : undefined} rows={components.map((component) => ieltsRow(component, result, target, t, retry, retrying))} />

        <h2 className="exams__section-title" id="exam-review">
          {t.exams.review}
        </h2>
        {components.length > 1 && (
          <nav className="ielts-tabs ielts-tabs--inline" aria-label={t.ielts.componentsLabel}>
            {components.map((component) => (
              <button
                key={component}
                type="button"
                className={`ielts-tab ielts-tab--${component} ${tab === component ? 'ielts-tab--on' : ''}`}
                onClick={() => setTab(component)}
              >
                {t.ielts.components[component]}
              </button>
            ))}
          </nav>
        )}

        {groups
          .filter((g) => g.component === tab)
          .map((g) => {
            const writingTask = result.writing?.tasks.find((task) => task.groupId === g.group.id);
            const essay = String(session.answers[essayId(g.group.id)] ?? '');
            const title = (
              <h3 className="ielts-group-title">
                {t.ielts.components[g.component]} · {groupLabel(g)}
              </h3>
            );

            // Graded writing: task, band, then the corrected essay
            if (g.group.kind === 'writing-prompt' && writingTask?.feedback) {
              return (
                <div key={g.group.id} className="ielts-review-group">
                  {title}
                  <WritingPromptCard task={g.group.payload} />
                  <BandFeedback feedback={writingTask.feedback} tone="writing" note={t.ielts.bandNote} />
                  <WritingReview response={essay} feedback={writingTask.feedback} />
                </div>
              );
            }

            const speakingFeedback = g.component === 'speaking' ? result.speaking?.feedback : null;
            return (
              <div key={g.group.id} className="ielts-review-group">
                {speakingFeedback && <BandFeedback feedback={speakingFeedback} tone="speaking" note={t.ielts.bandNote} />}
                <Card padding="lg" className="exam-card">
                  {title}
                  <GroupPanel g={g} answers={session.answers} flags={[]} review />
                </Card>
                {speakingFeedback && (
                  <div className="ielts-answers">
                    {speakingFeedback.answers.map((a, i) => (
                      <Card key={i} padding="md" className="ielts-answer">
                        <p className="ielts-answer__q" lang="en">
                          {a.question}
                        </p>
                        <p>{a.comment}</p>
                        <p className="ielts-answer__better" lang="en">
                          <strong>{t.ieltsSpeaking.betterAnswer}:</strong> {a.betterAnswer}
                        </p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

      </main>
      <ResultFooter reviewId="exam-review" />
    </div>
  );
};

export const IeltsSessionScreen: React.FC<{ session: IeltsSession; onChange: (session: IeltsSession) => void }> = ({ session, onChange }) =>
  session.status === 'submitted' && session.result ? (
    <IeltsResultView session={session} onUpdate={onChange} />
  ) : (
    <IeltsRunner session={session} onSubmitted={onChange} />
  );
