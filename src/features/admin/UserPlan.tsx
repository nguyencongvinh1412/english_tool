/**
 * UserPlan
 * A learner's plan in the edit-user dialog: what they have now, give a plan for some days
 * (after a bank transfer, a trial or a referral), end it, and the history
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Banner, Button, Field, Select, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { billingApi, type PlanId, type Subscription } from '@/shared/billingApi';

/** Common periods of the prepaid plans */
const PERIODS = [
  { days: 30, key: 'month' },
  { days: 90, key: 'quarter' },
  { days: 365, key: 'year' },
] as const;

export const UserPlan: React.FC<{ userId: string }> = ({ userId }) => {
  const { t, formatDate } = useI18n();
  const a = t.billing.admin;
  const [history, setHistory] = useState<Subscription[] | null>(null);
  const [planId, setPlanId] = useState<PlanId>('plus');
  const [days, setDays] = useState('90');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setHistory((await billingApi.subscriptions(userId)).subscriptions);
    } catch (err) {
      setError(err);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setNote('');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now();
  const active = history?.find((s) => !s.cancelledAt && Date.parse(s.endsAt) > now && Date.parse(s.startsAt) <= now);

  return (
    <fieldset className="admin-models user-plan">
      <legend className="field__label">{a.userPlan}</legend>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      <p>
        {active ? (
          <>
            <Badge tone="success">{active.planId}</Badge> {t.billing.endsOn(formatDate(active.endsAt))}{' '}
            <Button size="sm" variant="ghost" onClick={() => void act(() => billingApi.cancel(active.id))} disabled={busy}>
              {a.cancel}
            </Button>
          </>
        ) : (
          <Badge tone="neutral">free</Badge>
        )}
      </p>

      <div className="admin-form__row">
        <Field label={a.grantTitle}>
          {(id) => (
            <Select id={id} value={planId} onChange={(e) => setPlanId(e.target.value as PlanId)}>
              <option value="plus">Plus</option>
              <option value="pro">Pro</option>
            </Select>
          )}
        </Field>
        <Field label={a.grantDays}>
          {(id) => <TextInput id={id} type="number" min={1} max={3660} value={days} onChange={(e) => setDays(e.target.value)} />}
        </Field>
      </div>
      <div className="user-plan__periods">
        {PERIODS.map((p) => (
          <Button key={p.key} size="sm" variant="ghost" onClick={() => setDays(String(p.days))}>
            {t.billing.periodsLong[p.key]}
          </Button>
        ))}
      </div>
      <Field label={a.grantNote}>{(id) => <TextInput id={id} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />}</Field>
      <Button
        icon="plus"
        onClick={() => void act(() => billingApi.grant(userId, { planId, days: Number(days), source: 'admin', note: note.trim() || undefined }))}
        loading={busy}
        disabled={!(Number(days) >= 1)}
      >
        {a.grantButton}
      </Button>

      {history && history.length > 0 && (
        <div className="user-plan__history">
          <strong>{a.grantHistory}</strong>
          <ul>
            {history.slice(0, 6).map((s) => (
              <li key={s.id}>
                {s.planId} · {formatDate(s.startsAt)} → {formatDate(s.endsAt)} · {s.source}
                {s.cancelledAt ? ` · ${a.cancelled}` : ''}
                {s.note ? ` · ${s.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
};
