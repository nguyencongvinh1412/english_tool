/**
 * RoadmapSettingsTab
 * The Roadmap's parameters: study hours per level, how plans are split and estimated, and the checkpoint thresholds.
 * Changes apply to plans made from now on; roadmaps that exist keep the plan they were made with.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Card } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { apiFetch, errorMessage } from '@/shared/http';
import './admin.css';

interface PlanSettings {
  hoursPerLevel: Record<string, number>;
  withinLevelFactor: number;
  examPrepHours: number;
  splitFromWeeks: number;
  uncertainty: { measured: number; self: number };
  vocabShare: number;
  grammarShare: number;
  sessionsPerWeek: number;
  skillGapShare: number;
  skillWeights: Record<WeightGoal, Record<WeightKey, number>>;
}

const WEIGHT_GOALS = ['toeic', 'ielts', 'jlpt', 'cefr'] as const;
type WeightGoal = (typeof WEIGHT_GOALS)[number];
const WEIGHT_KEYS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary'] as const;
type WeightKey = (typeof WEIGHT_KEYS)[number];
interface Thresholds {
  unlock: number;
  passOverall: number;
  passMinSkill: number;
}
interface Impact {
  totalHours: number;
  etaFrom: string;
  etaTo: string;
  feasibility: string;
  stages: number;
}
interface Preview {
  sample: { targetScore: number; fromLevel: string; targetLevel: string; hoursPerWeek: number; deadline: string };
  current: Impact;
  proposed: Impact;
}
interface Payload {
  plan: PlanSettings;
  checkpoint: Thresholds;
  defaults: { plan: PlanSettings; checkpoint: Thresholds };
  customised: boolean;
}

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const JLPT = ['N5', 'N4', 'N3', 'N2', 'N1'];

/** A labelled number box; `percent` shows a 0-1 value as 0-100 */
const NumberField: React.FC<{ label: string; hint?: string; value: number; onChange: (value: number) => void; percent?: boolean; step?: number }> = ({ label, hint, value, onChange, percent, step = 1 }) => (
  <label className="roadmap-set__field">
    <span>{label}</span>
    <input
      className="input"
      type="number"
      inputMode="decimal"
      step={percent ? 1 : step}
      value={percent ? Math.round(value * 100) : value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(percent ? n / 100 : n);
      }}
    />
    {hint && <small>{hint}</small>}
  </label>
);

export const RoadmapSettingsTab: React.FC = () => {
  const { t, formatDate } = useI18n();
  const r = t.roadmapAdmin;
  const [data, setData] = useState<Payload | null>(null);
  const [plan, setPlan] = useState<PlanSettings | null>(null);
  const [checkpoint, setCheckpoint] = useState<Thresholds | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const planKey = useRef('');
  const [weightGoal, setWeightGoal] = useState<WeightGoal>('toeic');

  const load = (payload: Payload) => {
    setData(payload);
    setPlan(payload.plan);
    setCheckpoint(payload.checkpoint);
  };

  useEffect(() => {
    apiFetch<Payload>('/api/admin/roadmap/settings').then(load).catch(setError);
  }, []);

  const send = async (body: object, done: string) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/api/admin/roadmap/settings', { method: 'PUT', json: body });
      load(await apiFetch<Payload>('/api/admin/roadmap/settings'));
      setMessage(done);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  // The effect of the edited numbers on a typical plan, shortly after the last change
  useEffect(() => {
    if (!plan) return;
    const key = JSON.stringify(plan);
    if (key === planKey.current) return;
    const id = setTimeout(() => {
      planKey.current = key;
      apiFetch<Preview>('/api/admin/roadmap/settings/preview', { method: 'POST', json: { plan } })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(id);
  }, [plan]);

  if (!data || !plan || !checkpoint) return error !== null ? <Banner tone="danger">{errorMessage(error, t)}</Banner> : null;

  const weights = plan.skillWeights[weightGoal];
  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);
  const weightsValid = WEIGHT_GOALS.every((goal) => Object.values(plan.skillWeights[goal]).reduce((a, b) => a + b, 0) === 100);
  const setWeight = (key: WeightKey, value: number) => set('skillWeights', { ...plan.skillWeights, [weightGoal]: { ...weights, [key]: Math.max(0, Math.min(100, Math.round(value))) } });
  const dirty = JSON.stringify({ plan, checkpoint }) !== JSON.stringify({ plan: data.plan, checkpoint: data.checkpoint });
  const set = <K extends keyof PlanSettings>(key: K, value: PlanSettings[K]) => setPlan({ ...plan, [key]: value });
  const hours = (level: string) => (
    <NumberField key={level} label={level} value={plan.hoursPerLevel[level]} hint={r.defaultIs(data.defaults.plan.hoursPerLevel[level])} onChange={(v) => set('hoursPerLevel', { ...plan.hoursPerLevel, [level]: v })} />
  );

  const row = (label: string, now: string, next: string) => (
    <div className="roadmap-impact__row">
      <span>{label}</span>
      <span>
        {now} → <strong>{next}</strong>
      </span>
    </div>
  );
  const range = (i: Impact) => `${formatDate(i.etaFrom)} – ${formatDate(i.etaTo)}`;

  return (
    <div className="roadmap-set">
      <header className="roadmap-set__head">
        <div>
          <h1>{r.title}</h1>
          <p>{r.intro}</p>
        </div>
        <div className="roadmap-set__actions">
          <Button variant="ghost" disabled={saving || !data.customised} onClick={() => void send({ reset: true }, r.resetDone)}>
            {r.reset}
          </Button>
          <Button loading={saving} disabled={!dirty || !weightsValid} onClick={() => void send({ plan, checkpoint }, r.saved)}>
            {r.save}
          </Button>
        </div>
      </header>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {message && !dirty && <Banner tone="success">{message}</Banner>}
      {data.customised && <Banner tone="info">{r.customised}</Banner>}

      <div className="roadmap-set__layout">
        <div className="roadmap-set__forms">
      <Card padding="lg">
        <h2>{r.hoursTitle}</h2>
        <p className="grammar__hint">{r.hoursNote}</p>
        <div className="roadmap-set__grid">{CEFR.map(hours)}</div>
        <div className="roadmap-set__grid">{JLPT.map(hours)}</div>
      </Card>

      <Card padding="lg">
        <h2>{r.weightsTitle(r.goals[weightGoal])}</h2>
        <p className="grammar__hint">{r.weightsNote}</p>
        <div className="tool-chips" role="group" aria-label={r.weightsGoal}>
          {WEIGHT_GOALS.map((goal) => (
            <button key={goal} type="button" className={`tool-chip ${goal === weightGoal ? 'tool-chip--on' : ''}`} aria-pressed={goal === weightGoal} onClick={() => setWeightGoal(goal)}>
              {r.goals[goal]}
            </button>
          ))}
        </div>
        <div className="roadmap-weights">
          {WEIGHT_KEYS.map((key) => (
            <div key={key} className="roadmap-weights__row">
              <span>{r.weightKeys[key]}</span>
              <span className="roadmap-weights__bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, weights[key])}%` }} />
              </span>
              <label className="roadmap-weights__input">
                <input className="input" type="number" min={0} max={100} step={1} aria-label={r.weightKeys[key]} value={weights[key]} onChange={(e) => Number.isFinite(Number(e.target.value)) && setWeight(key, Number(e.target.value))} />
                <span aria-hidden="true">%</span>
              </label>
            </div>
          ))}
          <div className="roadmap-weights__row roadmap-weights__row--total">
            <strong>{r.weightsTotal}</strong>
            <span />
            <span className={weightTotal === 100 ? '' : 'roadmap-weights__bad'}>
              <strong>{weightTotal} %</strong> {weightTotal === 100 ? `✓ ${r.weightsEnough}` : `○ ${r.weightsMustBe100}`}
            </span>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <h2>{r.planTitle}</h2>
        <div className="roadmap-set__grid">
          <NumberField label={r.within} hint={r.withinHint} value={plan.withinLevelFactor} percent onChange={(v) => set('withinLevelFactor', v)} />
          <NumberField label={r.examPrep} hint={r.examPrepHint} value={plan.examPrepHours} onChange={(v) => set('examPrepHours', v)} />
          <NumberField label={r.split} hint={r.splitHint} value={plan.splitFromWeeks} onChange={(v) => set('splitFromWeeks', v)} />
          <NumberField label={r.sessions} value={plan.sessionsPerWeek} onChange={(v) => set('sessionsPerWeek', v)} />
          <NumberField label={r.vocabShare} hint={r.shareHint} value={plan.vocabShare} percent onChange={(v) => set('vocabShare', v)} />
          <NumberField label={r.grammarShare} hint={r.shareHint} value={plan.grammarShare} percent onChange={(v) => set('grammarShare', v)} />
          <NumberField label={r.skillGap} hint={r.skillGapHint} value={plan.skillGapShare} percent onChange={(v) => set('skillGapShare', v)} />
          <NumberField label={r.uncertaintyMeasured} hint={r.uncertaintyHint} value={plan.uncertainty.measured} percent onChange={(v) => set('uncertainty', { ...plan.uncertainty, measured: v })} />
          <NumberField label={r.uncertaintySelf} hint={r.uncertaintyHint} value={plan.uncertainty.self} percent onChange={(v) => set('uncertainty', { ...plan.uncertainty, self: v })} />
        </div>
      </Card>

      <Card padding="lg">
        <h2>{r.checkpointTitle}</h2>
        <div className="roadmap-set__grid">
          <NumberField label={r.unlock} hint={r.unlockHint} value={checkpoint.unlock} percent onChange={(v) => setCheckpoint({ ...checkpoint, unlock: v })} />
          <NumberField label={r.passOverall} hint={r.passOverallHint} value={checkpoint.passOverall} percent onChange={(v) => setCheckpoint({ ...checkpoint, passOverall: v })} />
          <NumberField label={r.passMinSkill} hint={r.passMinSkillHint} value={checkpoint.passMinSkill} percent onChange={(v) => setCheckpoint({ ...checkpoint, passMinSkill: v })} />
        </div>
      </Card>

        </div>

        <aside className="roadmap-impact" aria-label={r.impactTitle}>
          <Card padding="lg">
            <h2>{r.impactTitle}</h2>
            {preview ? (
              <>
                <p className="grammar__hint">{r.sample(preview.sample.targetScore, preview.sample.fromLevel, preview.sample.hoursPerWeek)}</p>
                {row(r.impactHours, `${preview.current.totalHours}`, `${preview.proposed.totalHours}`)}
                {row(r.impactDates, range(preview.current), range(preview.proposed))}
                {row(r.impactFeasible, r.feasibility[preview.current.feasibility] ?? preview.current.feasibility, r.feasibility[preview.proposed.feasibility] ?? preview.proposed.feasibility)}
                {row(r.impactStages, `${preview.current.stages}`, `${preview.proposed.stages}`)}
              </>
            ) : (
              <p className="grammar__hint">{r.impactPending}</p>
            )}
          </Card>
          <p className="roadmap-impact__note">{r.appliesLater}</p>
        </aside>
      </div>
    </div>
  );
};
