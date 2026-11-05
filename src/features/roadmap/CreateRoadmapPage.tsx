/**
 * CreateRoadmapPage
 * Four steps: goal, deadline, weekly time, preview. The preview shows the stages, an expected date range and
 * whether it fits the deadline; if it does not, two one-tap fixes (a later deadline, or more hours a week).
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Button, Card, ErrorState, Field, Select, Skeleton, Tag, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { CEFR_LEVELS, JLPT_LEVELS } from '@/shared/types';
import { formatDay, formatRange, roadmapApi, type GoalType, type RoadmapGoal, type RoadmapPreview } from '@/shared/roadmapApi';
import { StageList } from './StageList';
import './roadmap.css';

const HOUR_CHOICES = [3, 5, 8, 12];
/** Lowest result that can be asked for in each skill */
const MIN_CHOICES = { ielts: ['5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0'], toeic: ['250', '300', '350', '400', '450'] } as const;
const MIN_SKILLS = { ielts: ['listening', 'reading', 'writing', 'speaking'], toeic: ['listening', 'reading'] } as const;
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);

export const CreateRoadmapPage: React.FC = () => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const language = user.studyLanguage;
  const goalChoices: GoalType[] = language === 'ja' ? ['jlpt'] : ['toeic', 'ielts', 'cefr'];

  const [step, setStep] = useState(1);
  const [goalType, setGoalType] = useState<GoalType>(language === 'ja' ? 'jlpt' : user.targetExam === 'ielts' ? 'ielts' : user.targetExam === 'toeic' ? 'toeic' : 'cefr');
  const [score, setScore] = useState(user.targetScore ? String(user.targetScore) : '');
  const [targetLevel, setTargetLevel] = useState(language === 'ja' ? (user.jaTargetLevel ?? 'N3') : 'B2');
  const [fromLevel, setFromLevel] = useState(language === 'ja' ? '' : (user.cefrLevel ?? ''));
  const [noDeadline, setNoDeadline] = useState(false);
  const [deadline, setDeadline] = useState(addDays(todayIso(), 120));
  const [hours, setHours] = useState(5);
  const [minimums, setMinimums] = useState<Record<string, string>>({});
  // Offered from the learner's study data; kept as "derived" only while they leave it unchanged
  const [derived, setDerived] = useState<{ level: string; source: 'measured' | 'derived' } | null>(null);
  const [fromTouched, setFromTouched] = useState(false);

  const [preview, setPreview] = useState<RoadmapPreview | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  const usesScore = goalType === 'toeic' || goalType === 'ielts';
  const usesMinimums = usesScore;
  const goal: RoadmapGoal = {
    language,
    goalType,
    targetScore: usesScore ? Number(score) : null,
    targetLevel: usesScore ? null : targetLevel,
    fromLevel,
    levelSource: derived !== null && !fromTouched && fromLevel === derived.level ? derived.source : 'self',
    hoursPerWeek: hours,
    deadline: noDeadline ? null : deadline,
    minSkillLevels: Object.fromEntries(Object.entries(minimums).filter(([skill, value]) => value !== '' && usesMinimums && (MIN_SKILLS[goalType as 'ielts' | 'toeic'] as readonly string[]).includes(skill))),
  };
  const scoreOk = !usesScore || (Number(score) > 0 && (goalType === 'toeic' ? Number(score) <= 990 : Number(score) <= 9));
  const deadlineOk = noDeadline || deadline > todayIso();
  const goalKey = JSON.stringify(goal);

  useEffect(() => {
    if (language !== 'en') return;
    roadmapApi
      .derivedLevel()
      .then(({ level, source }) => {
        if (level === null) return;
        setDerived({ level, source: source ?? 'derived' });
        // A level test result always wins; a guess from study data only fills an empty choice
        if (source === 'measured' || !user.cefrLevel) setFromLevel(level);
      })
      .catch(() => {});
  }, [language, user.cefrLevel]);

  // The preview is worked out on the last step, and again whenever a fix changes the goal
  useEffect(() => {
    if (step !== 4 || !scoreOk || !deadlineOk) return;
    let active = true;
    roadmapApi
      .preview(JSON.parse(goalKey) as RoadmapGoal)
      .then((result) => active && (setPreview(result), setFailed(false)))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [step, goalKey, scoreOk, deadlineOk]);

  const create = async () => {
    setCreating(true);
    setCreateFailed(false);
    try {
      await roadmapApi.create(goal);
      navigate(ROUTES.ROADMAP);
    } catch {
      setCreateFailed(true);
      setCreating(false);
    }
  };

  const levels = language === 'ja' ? JLPT_LEVELS : CEFR_LEVELS;
  const canContinue = step === 1 ? scoreOk : step === 2 ? deadlineOk : true;
  const back = () => (step === 1 ? navigate(ROUTES.ROADMAP) : setStep(step - 1));
  const feasibility = preview?.plan.feasibility;

  return (
    <div className="create">
      <header className="create__head">
        <h1>{t.roadmapNew.title}</h1>
        <p className="create__step">{t.roadmapNew.stepOf(step)} · {t.roadmapNew.steps[step - 1]}</p>
        <ol className="create__dots" aria-hidden="true">
          {t.roadmapNew.steps.map((name, i) => (
            <li key={name} className={i + 1 <= step ? 'create__dot create__dot--on' : 'create__dot'} />
          ))}
        </ol>
      </header>

      <div className="create__grid">
        <Card padding="lg" className="create__card">
          {step === 1 && (
            <>
              <h2>{t.roadmapNew.goalTitle}</h2>
              <div className="create__choices" role="radiogroup" aria-label={t.roadmapNew.goalTitle}>
                {goalChoices.map((choice) => (
                  <button key={choice} type="button" role="radio" aria-checked={goalType === choice} className={`create__choice ${goalType === choice ? 'create__choice--on' : ''}`} onClick={() => setGoalType(choice)}>
                    {goalType === choice ? '✓ ' : ''}
                    {t.roadmapNew.goals[choice]}
                  </button>
                ))}
              </div>
              {usesScore ? (
                <Field label={t.roadmapNew.scoreLabel[goalType as 'toeic' | 'ielts']} error={score !== '' && !scoreOk ? t.roadmapNew.needScore : undefined}>
                  {(id, describedBy) => <TextInput id={id} aria-describedby={describedBy} inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} />}
                </Field>
              ) : (
                <Field label={t.roadmapNew.levelLabel}>
                  {(id) => (
                    <Select id={id} value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)}>
                      {levels.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              {usesMinimums && (
                <fieldset className="create__minimums">
                  <legend>{t.roadmapNew.minTitle}</legend>
                  <p className="create__muted">{t.roadmapNew.minHint}</p>
                  {MIN_SKILLS[goalType as 'ielts' | 'toeic'].map((skill) => (
                    <Field key={skill} label={t.today.kinds[skill]}>
                      {(id) => (
                        <Select id={id} value={minimums[skill] ?? ''} onChange={(e) => setMinimums({ ...minimums, [skill]: e.target.value })}>
                          <option value="">{t.roadmapNew.noMin}</option>
                          {MIN_CHOICES[goalType as 'ielts' | 'toeic'].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ))}
                </fieldset>
              )}
              <Field label={t.roadmapNew.startLabel}>
                {(id) => (
                  <Select
                    id={id}
                    value={fromLevel}
                    onChange={(e) => {
                      setFromLevel(e.target.value);
                      setFromTouched(true);
                    }}
                  >
                    <option value="">{t.roadmapNew.beginner}</option>
                    {levels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {derived !== null && !fromTouched && fromLevel === derived.level && <p className="create__muted">{derived.source === 'measured' ? t.roadmapNew.measuredNote : t.roadmapNew.derivedNote}</p>}
            </>
          )}

          {step === 2 && (
            <>
              <h2>{t.roadmapNew.deadlineTitle}</h2>
              <Field label={t.roadmapNew.deadlineLabel} error={!deadlineOk ? t.roadmapNew.deadlineLabel : undefined}>
                {(id) => <TextInput id={id} type="date" min={addDays(todayIso(), 1)} value={deadline} disabled={noDeadline} onChange={(e) => setDeadline(e.target.value)} />}
              </Field>
              <label className="create__check">
                <input type="checkbox" checked={noDeadline} onChange={(e) => setNoDeadline(e.target.checked)} />
                {t.roadmapNew.noDeadline}
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <h2>{t.roadmapNew.hoursTitle}</h2>
              <div className="create__choices" role="radiogroup" aria-label={t.roadmapNew.hoursTitle}>
                {HOUR_CHOICES.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={hours === n} className={`create__choice ${hours === n ? 'create__choice--on' : ''}`} onClick={() => setHours(n)}>
                    {hours === n ? '✓ ' : ''}
                    {t.roadmapNew.hours(n)}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2>{t.roadmapNew.previewTitle}</h2>
              {failed ? (
                <ErrorState title={t.roadmapNew.previewError} />
              ) : !preview ? (
                <Skeleton height={120} label={t.roadmapNew.previewing} />
              ) : (
                <>
                  <p className="create__eta">{t.roadmapNew.expected(formatRange(preview.plan.etaFrom, preview.plan.etaTo))}</p>
                  <p className="create__muted">
                    {t.roadmapNew.hoursNeeded(preview.plan.totalHours)}
                    {!noDeadline && ` · ${t.roadmapNew.deadlineNote(formatDay(deadline))}`}
                  </p>
                  {feasibility && <Tag tone={feasibility === 'ok' ? 'brand' : feasibility === 'tight' ? 'notice' : 'hard'}>{(feasibility === 'ok' ? '✓ ' : feasibility === 'tight' ? '◐ ' : '! ') + t.roadmapNew.feasibility[feasibility]}</Tag>}
                  {preview.plan.fixes && (
                    <div className="create__fixes">
                      <strong>{t.roadmapNew.fixTitle}</strong>
                      <Button variant="secondary" onClick={() => setDeadline(preview.plan.fixes!.laterDeadline)}>
                        {t.roadmapNew.fixDeadline(formatDay(preview.plan.fixes.laterDeadline))}
                      </Button>
                      <Button variant="secondary" onClick={() => setHours(Math.min(40, preview.plan.fixes!.hoursPerWeek))}>
                        {t.roadmapNew.fixHours(preview.plan.fixes.hoursPerWeek)}
                      </Button>
                    </div>
                  )}
                  <p className="create__muted">{t.roadmapNew.estimate}</p>
                </>
              )}
              {createFailed && <Banner tone="warning">{t.roadmapNew.createError}</Banner>}
            </>
          )}

          <div className="create__actions">
            <Button variant="ghost" onClick={back}>
              {step === 1 ? t.roadmapNew.cancel : t.roadmapNew.back}
            </Button>
            {step < 4 ? (
              <Button size="lg" onClick={() => setStep(step + 1)} disabled={!canContinue}>
                {t.roadmapNew.next}
              </Button>
            ) : (
              <Button size="lg" onClick={() => void create()} loading={creating} disabled={!preview || creating}>
                {creating ? t.roadmapNew.creating : t.roadmapNew.create}
              </Button>
            )}
          </div>
        </Card>

        {step === 4 && preview && (
          <aside className="create__aside">
            <StageList stages={preview.stages} />
          </aside>
        )}
      </div>
      <Link to={ROUTES.ROADMAP} className="visually-hidden">
        {t.roadmapNew.cancel}
      </Link>
    </div>
  );
};
