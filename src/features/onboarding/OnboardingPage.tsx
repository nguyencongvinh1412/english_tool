/**
 * OnboardingPage
 * One step after sign-up: learning goal, self-rated level, target score
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
import { CEFR_LEVELS, type CefrLevel, type ExamGoal } from '@/shared/types';
import './onboarding.css';

/** Valid target score range per exam */
const SCORE_RANGE: Record<Exclude<ExamGoal, 'none'>, { min: number; max: number; step: number }> = {
  toeic: { min: 10, max: 990, step: 5 },
  ielts: { min: 1, max: 9, step: 0.5 },
};

export const OnboardingPage: React.FC = () => {
  const { t } = useI18n();
  const { updateProfile } = useAuth();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [goal, setGoal] = useState<ExamGoal | null>(user.targetExam === 'none' ? null : user.targetExam);
  const [level, setLevel] = useState<CefrLevel | null>(user.cefrLevel);
  const [score, setScore] = useState(user.targetScore?.toString() ?? '');
  const [error, setError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);

  const range = goal && goal !== 'none' ? SCORE_RANGE[goal] : null;
  const scoreValue = score === '' ? null : Number(score);
  const scoreValid = !range || scoreValue === null || (scoreValue >= range.min && scoreValue <= range.max);

  const save = async (skip: boolean): Promise<void> => {
    setIsSaving(true);
    setError(null);

    try {
      await updateProfile(
        skip
          ? { onboarded: true }
          : {
              onboarded: true,
              targetExam: goal ?? 'none',
              cefrLevel: level,
              targetScore: range ? scoreValue : null,
            }
      );
      navigate(ROUTES.HOME, { replace: true });
    } catch (err) {
      setError(err);
      setIsSaving(false);
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding__topbar">
        <Logo />
        <LocaleToggle />
      </div>

      <main className="onboarding__card reveal">
        <p className="page-head__eyebrow">{t.onboarding.eyebrow}</p>
        <h1 className="onboarding__title">{t.onboarding.title(user.displayName)}</h1>
        <p className="onboarding__subtitle">{t.onboarding.subtitle}</p>

        <div className="onboarding__sections">
          <ChoiceCards<ExamGoal>
            name="goal"
            legend={t.onboarding.goalLegend}
            value={goal}
            onChange={(next) => {
              setGoal(next);
              setScore('');
            }}
            options={[
              { value: 'none', icon: 'chat', tone: 'speaking', ...t.onboarding.goals.none },
              { value: 'toeic', icon: 'target', tone: 'exam', ...t.onboarding.goals.toeic },
              { value: 'ielts', icon: 'exam', tone: 'writing', ...t.onboarding.goals.ielts },
            ]}
          />

          <ChoiceCards<CefrLevel>
            name="level"
            legend={t.onboarding.levelLegend}
            value={level}
            onChange={setLevel}
            options={CEFR_LEVELS.map((cefr) => ({
              value: cefr,
              label: cefr,
              description: t.onboarding.levels[cefr],
              tone: 'brand',
            }))}
          />

          {range && (
            <Field
              label={t.onboarding.targetScore}
              hint={goal === 'toeic' ? t.onboarding.targetScoreHintToeic : t.onboarding.targetScoreHintIelts}
              error={scoreValid ? undefined : goal === 'toeic' ? t.onboarding.targetScoreHintToeic : t.onboarding.targetScoreHintIelts}
            >
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="number"
                  inputMode="decimal"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={score}
                  onChange={(event) => setScore(event.target.value)}
                  style={{ maxWidth: 180 }}
                />
              )}
            </Field>
          )}

          {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
        </div>

        <div className="onboarding__actions">
          <Button variant="ghost" onClick={() => save(true)} disabled={isSaving}>
            {t.onboarding.skip}
          </Button>
          <Button size="lg" onClick={() => save(false)} loading={isSaving} disabled={!goal || !level || !scoreValid}>
            {t.onboarding.finish}
          </Button>
        </div>
      </main>
    </div>
  );
};
