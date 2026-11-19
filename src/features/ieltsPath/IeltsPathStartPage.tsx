/**
 * IeltsPathStartPage
 * Two steps: the target (an overall band that fills a goal for each skill, which can be adjusted), then the exam
 * date and the time per day. Creating the path leads straight to Gate 0.
 */
import type React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner, Button, Card, Field, Select, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/shared/http';
import {
  BAND_CHOICES,
  DAILY_MINUTE_CHOICES,
  formatBand,
  ieltsPathApi,
  MAX_DAILY_MINUTES,
  MIN_DAILY_MINUTES,
  OVERALL_CHOICES,
  overallOf,
  PATH_SKILLS,
  profileFor,
  type Bands,
  WEEKEND_MINUTE_CHOICES,
} from '@/shared/ieltsPathApi';
import '@/features/roadmap/roadmap.css';
import './ieltsPath.css';

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);
const REST_CHOICES: { key: 'restNone' | 'restSunday' | 'restSaturday'; days: number[] }[] = [
  { key: 'restNone', days: [] },
  { key: 'restSunday', days: [0] },
  { key: 'restSaturday', days: [6] },
];

export const IeltsPathStartPage: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const p = t.ieltsPath;

  const [step, setStep] = useState(1);
  const [overall, setOverall] = useState<number>(6.5);
  const [targets, setTargets] = useState<Bands>(profileFor(6.5));
  const [noExamDate, setNoExamDate] = useState(false);
  const [examDate, setExamDate] = useState(addDays(todayIso(), 180));
  const [minutes, setMinutes] = useState<number>(180);
  const [custom, setCustom] = useState(false);
  const [weekend, setWeekend] = useState<number | null>(null);
  const [restDays, setRestDays] = useState<number[]>([0]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computed = overallOf(targets);
  const inRange = computed >= 4.5 && computed <= 7;
  const dateOk = noExamDate || examDate > todayIso();
  const minutesOk = minutes >= MIN_DAILY_MINUTES && minutes <= MAX_DAILY_MINUTES;

  const pickOverall = (band: number) => {
    setOverall(band);
    setTargets(profileFor(band));
  };

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await ieltsPathApi.create({ bandTargets: targets, examDate: noExamDate ? null : examDate, dailyMinutes: minutes, weekendMinutes: weekend, restDays });
      navigate(ROUTES.IELTS_PATH);
    } catch (e) {
      setError(errorMessage(e, t) || p.createError);
      setCreating(false);
    }
  };

  const canContinue = step === 1 ? inRange : dateOk && minutesOk;
  const back = () => (step === 1 ? navigate(ROUTES.IELTS_PATH) : setStep(1));

  return (
    <div className="create">
      <header className="create__head">
        <h1>{p.startTitle}</h1>
        <p className="create__step">
          {p.stepOf(step)} · {p.steps[step - 1]}
        </p>
        <ol className="create__dots" aria-hidden="true">
          {p.steps.map((name, i) => (
            <li key={name} className={i + 1 <= step ? 'create__dot create__dot--on' : 'create__dot'} />
          ))}
        </ol>
      </header>

      <Card padding="lg" className="create__card ipath__form">
        {step === 1 && (
          <>
            <h2>{p.targetTitle}</h2>
            <div className="create__choices" role="radiogroup" aria-label={p.overallLabel}>
              {OVERALL_CHOICES.map((band) => (
                <button key={band} type="button" role="radio" aria-checked={overall === band && computed === band} className={`create__choice ${overall === band && computed === band ? 'create__choice--on' : ''}`} onClick={() => pickOverall(band)}>
                  {overall === band && computed === band ? '✓ ' : ''}
                  {formatBand(band)}
                </button>
              ))}
            </div>
            <p className="create__muted">{p.targetHint}</p>
            <fieldset className="create__minimums">
              <legend>{p.skillGoals}</legend>
              {PATH_SKILLS.map((skill) => (
                <Field key={skill} label={t.ielts.components[skill]}>
                  {(id) => (
                    <Select id={id} value={targets[skill]} onChange={(e) => setTargets({ ...targets, [skill]: Number(e.target.value) })}>
                      {BAND_CHOICES.map((band) => (
                        <option key={band} value={band}>
                          {formatBand(band)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ))}
            </fieldset>
            <p className={inRange ? 'ipath__overall' : 'ipath__overall ipath__overall--bad'} role="status">
              {inRange ? p.overallNow(formatBand(computed)) : p.outOfRange}
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <h2>{p.timeTitle}</h2>
            <Field label={p.examDateLabel} error={!dateOk ? p.examDateLabel : undefined}>
              {(id) => <TextInput id={id} type="date" min={addDays(todayIso(), 1)} value={examDate} disabled={noExamDate} onChange={(e) => setExamDate(e.target.value)} />}
            </Field>
            <label className="create__check">
              <input type="checkbox" checked={noExamDate} onChange={(e) => setNoExamDate(e.target.checked)} />
              {p.noExamDate}
            </label>

            <fieldset className="create__minimums">
              <legend>{p.dailyLabel}</legend>
              <div className="create__choices" role="radiogroup" aria-label={p.dailyLabel}>
                {DAILY_MINUTE_CHOICES.map((n) => {
                  const on = !custom && minutes === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`create__choice ${on ? 'create__choice--on' : ''}`}
                      onClick={() => {
                        setCustom(false);
                        setMinutes(n);
                      }}
                    >
                      {on ? '✓ ' : ''}
                      {p.minutes(n)}
                    </button>
                  );
                })}
                <button type="button" role="radio" aria-checked={custom} className={`create__choice ${custom ? 'create__choice--on' : ''}`} onClick={() => setCustom(true)}>
                  {custom ? '✓ ' : ''}
                  {p.otherMinutes}
                </button>
              </div>
              {custom && (
                <Field label={p.customMinutes} error={!minutesOk ? p.customMinutes : undefined}>
                  {(id) => <TextInput id={id} inputMode="numeric" value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value.replace(/\D/g, '')) || 0)} />}
                </Field>
              )}
              <p className="create__muted">{p.dailyHint}</p>
            </fieldset>

            <fieldset className="create__minimums">
              <legend>{p.weekendLabel}</legend>
              <div className="create__choices" role="radiogroup" aria-label={p.weekendLabel}>
                {[null, ...WEEKEND_MINUTE_CHOICES].map((n) => {
                  const on = weekend === n;
                  return (
                    <button key={n ?? 'same'} type="button" role="radio" aria-checked={on} className={`create__choice ${on ? 'create__choice--on' : ''}`} onClick={() => setWeekend(n)}>
                      {on ? '✓ ' : ''}
                      {n === null ? p.weekendSame : p.minutes(n)}
                    </button>
                  );
                })}
              </div>
              <p className="create__muted">{p.weekendHint}</p>
            </fieldset>

            <fieldset className="create__minimums">
              <legend>{p.restLabel}</legend>
              <div className="create__choices" role="radiogroup" aria-label={p.restLabel}>
                {REST_CHOICES.map((choice) => {
                  const on = JSON.stringify(restDays) === JSON.stringify(choice.days);
                  return (
                    <button key={choice.key} type="button" role="radio" aria-checked={on} className={`create__choice ${on ? 'create__choice--on' : ''}`} onClick={() => setRestDays(choice.days)}>
                      {on ? '✓ ' : ''}
                      {p[choice.key]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {error && <Banner tone="warning">{error}</Banner>}
          </>
        )}

        <div className="create__actions">
          <Button variant="ghost" onClick={back}>
            {step === 1 ? p.cancel : p.back}
          </Button>
          {step === 1 ? (
            <Button size="lg" onClick={() => setStep(2)} disabled={!canContinue}>
              {p.next}
            </Button>
          ) : (
            <Button size="lg" onClick={() => void create()} loading={creating} disabled={!canContinue || creating}>
              {creating ? p.creating : p.create}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
