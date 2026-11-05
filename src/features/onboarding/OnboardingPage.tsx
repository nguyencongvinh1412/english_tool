/**
 * OnboardingPage
 * Four steps after sign-up: language, goal, an optional level test, then a roadmap built from them. Every step can be
 * skipped; skipping uses defaults (English, no exam).
 */
import type React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner, Button, ChoiceCards, Field, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth, useCurrentUser } from '@/app/AuthProvider';
import { Logo } from '@/app/AppShell';
import { LocaleToggle } from '@/app/LocaleToggle';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/shared/http';
import { roadmapApi, type RoadmapGoal } from '@/shared/roadmapApi';
import { CEFR_LEVELS, JLPT_LEVELS, type CefrLevel, type ExamGoal, type JlptLevel, type StudyLanguage } from '@/shared/types';
import './onboarding.css';

/** Valid target score range per exam */
const SCORE_RANGE: Record<Exclude<ExamGoal, 'none'>, { min: number; max: number; step: number }> = {
  toeic: { min: 10, max: 990, step: 5 },
  ielts: { min: 1, max: 9, step: 0.5 },
};
const HOURS = [3, 5, 8, 12];
const STEPS = 4;

export const OnboardingPage: React.FC = () => {
  const { t } = useI18n();
  const { updateProfile } = useAuth();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [language, setLanguage] = useState<StudyLanguage>(user.studyLanguage);
  const [jaLevel, setJaLevel] = useState<JlptLevel | null>(user.jaTargetLevel);
  const [goal, setGoal] = useState<ExamGoal | null>(user.targetExam === 'none' ? null : user.targetExam);
  const [level, setLevel] = useState<CefrLevel | null>(user.cefrLevel);
  const [score, setScore] = useState(user.targetScore?.toString() ?? '');
  const [hours, setHours] = useState(5);
  const [error, setError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);

  const range = goal && goal !== 'none' ? SCORE_RANGE[goal] : null;
  const scoreValue = score === '' ? null : Number(score);
  const scoreValid = !range || scoreValue === null || (scoreValue >= range.min && scoreValue <= range.max);
  const goalReady = language === 'ja' ? Boolean(jaLevel) : Boolean(goal && level && scoreValid && (!range || scoreValue !== null));

  /** The roadmap goal that matches what was chosen */
  const roadmapGoal = (): RoadmapGoal => {
    if (language === 'ja') return { language: 'ja', goalType: 'jlpt', targetLevel: jaLevel, fromLevel: '', hoursPerWeek: hours };
    if (goal === 'toeic' || goal === 'ielts') return { language: 'en', goalType: goal, targetScore: scoreValue, fromLevel: level ?? '', hoursPerWeek: hours };
    const above = level ? CEFR_LEVELS[Math.min(CEFR_LEVELS.indexOf(level) + 1, CEFR_LEVELS.length - 1)] : 'B1';
    return { language: 'en', goalType: 'cefr', targetLevel: above, fromLevel: level ?? '', hoursPerWeek: hours };
  };

  const saveProfile = (skip: boolean) =>
    updateProfile(
      skip
        ? { onboarded: true, studyLanguage: language }
        : language === 'ja'
          ? { onboarded: true, studyLanguage: 'ja', jaTargetLevel: jaLevel }
          : { onboarded: true, studyLanguage: 'en', targetExam: goal ?? 'none', cefrLevel: level, targetScore: range ? scoreValue : null }
    );

  /** Finish: save the profile, and unless the roadmap is skipped, build it; then go to Today */
  const finish = async (withRoadmap: boolean, skipAll = false): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      await saveProfile(skipAll);
      if (withRoadmap && !skipAll) await roadmapApi.create(roadmapGoal());
      navigate(ROUTES.HOME, { replace: true });
    } catch (err) {
      setError(err);
      setIsSaving(false);
    }
  };

  const n = t.onboardingNew;
  const title = step === 1 ? n.languageTitle : step === 2 ? n.goalTitle : step === 3 ? n.testTitle : n.timeTitle;

  /** Take the level test now: save the profile first, then the test leads on to the roadmap */
  const takeTest = async (): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      await saveProfile(false);
      navigate(ROUTES.PLACEMENT, { replace: true });
    } catch (err) {
      setError(err);
      setIsSaving(false);
    }
  };

  return (
    <div className="onboarding">
      <aside className="onboarding__aside">
        <Logo />
        <div className="onboarding__pitch">
          <h2>{n.tagline}</h2>
          <p>{n.taglineBody}</p>
        </div>
      </aside>

      <main className="onboarding__main">
        <div className="onboarding__topbar">
          <span className="onboarding__aside-logo">
            <Logo />
          </span>
          <LocaleToggle />
        </div>

        <div className="onboarding__panel">
          <div className="onboarding__progress">
            <span>{n.stepOf(step, STEPS)}</span>
            {step < 3 && (
              <button type="button" className="onboarding__skip" onClick={() => void finish(false, true)} disabled={isSaving}>
                {n.skip}
              </button>
            )}
          </div>
          <ol className="onboarding__bars" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <li key={i} className={i + 1 <= step ? 'onboarding__bar onboarding__bar--on' : 'onboarding__bar'} />
            ))}
          </ol>

          <h1 className="onboarding__title">{title}</h1>

          {step === 1 && (
            <ChoiceCards<StudyLanguage>
              name="language"
              legend={n.languageTitle}
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'en', icon: 'globe', tone: 'brand', label: n.languages.en[0], description: n.languages.en[1] },
                { value: 'ja', icon: 'type', tone: 'writing', label: n.languages.ja[0], description: n.languages.ja[1] },
              ]}
            />
          )}

          {step === 2 &&
            (language === 'ja' ? (
              <ChoiceCards<JlptLevel>
                name="jlpt"
                legend={t.japanese.levelLegend}
                value={jaLevel}
                onChange={setJaLevel}
                options={JLPT_LEVELS.map((jlpt) => ({ value: jlpt, label: jlpt, description: t.japanese.levels[jlpt], tone: 'writing' }))}
              />
            ) : (
              <>
                <ChoiceCards<ExamGoal>
                  name="goal"
                  legend={t.onboarding.goalLegend}
                  value={goal}
                  onChange={(next) => {
                    setGoal(next);
                    setScore('');
                  }}
                  options={[
                    { value: 'toeic', icon: 'target', tone: 'exam', ...t.onboarding.goals.toeic },
                    { value: 'ielts', icon: 'exam', tone: 'writing', ...t.onboarding.goals.ielts },
                    { value: 'none', icon: 'chat', tone: 'speaking', ...t.onboarding.goals.none },
                  ]}
                />
                <ChoiceCards<CefrLevel>
                  name="level"
                  legend={t.onboarding.levelLegend}
                  value={level}
                  onChange={setLevel}
                  options={CEFR_LEVELS.map((cefr) => ({ value: cefr, label: cefr, description: t.onboarding.levels[cefr], tone: 'brand' }))}
                />
                {range && (
                  <Field
                    label={t.onboarding.targetScore}
                    hint={goal === 'toeic' ? t.onboarding.targetScoreHintToeic : t.onboarding.targetScoreHintIelts}
                    error={scoreValid ? undefined : goal === 'toeic' ? t.onboarding.targetScoreHintToeic : t.onboarding.targetScoreHintIelts}
                  >
                    {(id, describedBy) => (
                      <TextInput id={id} aria-describedby={describedBy} type="number" inputMode="decimal" min={range.min} max={range.max} step={range.step} value={score} onChange={(e) => setScore(e.target.value)} style={{ maxWidth: 180 }} />
                    )}
                  </Field>
                )}
              </>
            ))}

          {step === 3 && <p className="onboarding__note">{n.testBody}</p>}

          {step === 4 && (
            <>
              <p className="onboarding__note">{n.timeIntro}</p>
              <div className="onboarding__hours" role="radiogroup" aria-label={n.timeIntro}>
                {HOURS.map((h) => (
                  <button key={h} type="button" role="radio" aria-checked={hours === h} className={`onboarding__hour ${hours === h ? 'onboarding__hour--on' : ''}`} onClick={() => setHours(h)}>
                    {hours === h ? '✓ ' : ''}
                    {t.roadmapNew.hours(h)}
                  </button>
                ))}
              </div>
            </>
          )}

          {error !== null && <Banner tone="warning">{errorMessage(error, t)}</Banner>}

          <div className="onboarding__actions">
            {step > 1 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={isSaving}>
                {t.roadmapNew.back}
              </Button>
            ) : (
              <span />
            )}
            {step === 3 ? (
              language === 'en' ? (
                <Button size="lg" onClick={() => void takeTest()} loading={isSaving}>
                  {n.takeTest}
                </Button>
              ) : (
                <Button size="lg" onClick={() => setStep(4)}>
                  {t.roadmapNew.next}
                </Button>
              )
            ) : step < STEPS ? (
              <Button size="lg" onClick={() => setStep(step + 1)} disabled={step === 2 && !goalReady}>
                {t.roadmapNew.next}
              </Button>
            ) : (
              <Button size="lg" onClick={() => void finish(true)} loading={isSaving}>
                {isSaving ? n.finishing : n.finish}
              </Button>
            )}
          </div>
          {step === 3 && language === 'en' && (
            <Button variant="ghost" onClick={() => setStep(4)} disabled={isSaving}>
              {n.skipTest}
            </Button>
          )}
          {step === STEPS && (
            <Button variant="ghost" onClick={() => void finish(false)} disabled={isSaving}>
              {n.noRoadmap}
            </Button>
          )}
          {step === 1 && <p className="onboarding__note">{n.skipNote}</p>}
        </div>
      </main>
    </div>
  );
};
