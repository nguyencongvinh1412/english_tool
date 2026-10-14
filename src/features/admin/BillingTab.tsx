/**
 * BillingTab
 * Plans for the admin: turn limits on, edit each plan and its prices, write the payment instructions,
 * and choose the AI source (the proxy or the providers' official APIs, with keys saved encrypted)
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, Field, Modal, Segmented, Spinner, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { billingApi, type AdminPlan, type AiSettings, type ProviderId } from '@/shared/billingApi';
import { useAsync } from './useAsync';

const num = (value: string): number | null => (value.trim() === '' ? null : Number(value));

/**
 * One plan's editable fields
 */
const PlanEditor: React.FC<{ plan: AdminPlan; paid?: number; onSaved: () => void }> = ({ plan, paid, onSaved }) => {
  const { t } = useI18n();
  const toast = useToast();
  const a = t.billing.admin;
  const [form, setForm] = useState({
    name: plan.name,
    monthlyCredits: String(plan.monthlyCredits),
    dailyCredits: String(plan.dailyCredits),
    models: plan.models.join(', '),
    weeklyWriting: plan.limits.weeklyWriting?.toString() ?? '',
    weeklySpeaking: plan.limits.weeklySpeaking?.toString() ?? '',
    fullTests: plan.limits.fullTests,
    importedTests: plan.limits.importedTests,
    month: String(plan.priceVnd?.month ?? ''),
    quarter: String(plan.priceVnd?.quarter ?? ''),
    year: String(plan.priceVnd?.year ?? ''),
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await billingApi.savePlan(plan.id, {
        name: form.name,
        monthlyCredits: Number(form.monthlyCredits),
        dailyCredits: Number(form.dailyCredits),
        models: form.models.split(',').map((m) => m.trim()).filter(Boolean),
        limits: { weeklyWriting: num(form.weeklyWriting), weeklySpeaking: num(form.weeklySpeaking), fullTests: form.fullTests, importedTests: form.importedTests },
        priceVnd: plan.id === 'free' ? null : { month: Number(form.month), quarter: Number(form.quarter), year: Number(form.year) },
      });
      toast(t.imports.saved, 'success');
      onSaved();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg" className="billing-plan">
      <h3>
        {plan.name} <Badge tone="neutral">{plan.id}</Badge>
        {paid !== undefined && <Badge tone="success">{a.paid(paid)}</Badge>}
      </h3>
      <div className="billing-grid">
        <Field label={a.planName}>{(id) => <TextInput id={id} value={form.name} onChange={set('name')} />}</Field>
        <Field label={a.monthly}>{(id) => <TextInput id={id} type="number" min={0} value={form.monthlyCredits} onChange={set('monthlyCredits')} />}</Field>
        <Field label={a.daily}>{(id) => <TextInput id={id} type="number" min={0} value={form.dailyCredits} onChange={set('dailyCredits')} />}</Field>
        <Field label={a.models}>{(id) => <TextInput id={id} value={form.models} onChange={set('models')} />}</Field>
        <Field label={a.writingWeek}>{(id) => <TextInput id={id} type="number" min={0} value={form.weeklyWriting} onChange={set('weeklyWriting')} />}</Field>
        <Field label={a.speakingWeek}>{(id) => <TextInput id={id} type="number" min={0} value={form.weeklySpeaking} onChange={set('weeklySpeaking')} />}</Field>
        {plan.id !== 'free' && (
          <>
            <Field label={a.priceMonth}>{(id) => <TextInput id={id} type="number" min={0} value={form.month} onChange={set('month')} />}</Field>
            <Field label={a.priceQuarter}>{(id) => <TextInput id={id} type="number" min={0} value={form.quarter} onChange={set('quarter')} />}</Field>
            <Field label={a.priceYear}>{(id) => <TextInput id={id} type="number" min={0} value={form.year} onChange={set('year')} />}</Field>
          </>
        )}
      </div>
      <div className="billing-checks">
        <label>
          <input type="checkbox" checked={form.fullTests} onChange={set('fullTests')} /> {a.fullTests}
        </label>
        <label>
          <input type="checkbox" checked={form.importedTests} onChange={set('importedTests')} /> {a.importedTests}
        </label>
      </div>
      <Button onClick={() => void save()} loading={busy}>
        {a.savePlan}
      </Button>
    </Card>
  );
};

/**
 * AI source and keys
 */
const AiSourceCard: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const a = t.billing.admin;
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [keys, setKeys] = useState<Record<ProviderId, string>>({ anthropic: '', gemini: '' });
  const [testModel, setTestModel] = useState('claude-haiku-5-5');
  const [test, setTest] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    billingApi.aiSettings().then(setSettings).catch(setError);
  }, []);

  const apply = async (update: Parameters<typeof billingApi.saveAiSettings>[0], key: string) => {
    setBusy(key);
    setError(null);
    try {
      setSettings(await billingApi.saveAiSettings(update));
      setKeys({ anthropic: '', gemini: '' });
      toast(t.imports.saved, 'success');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const runTest = async () => {
    setBusy('test');
    setTest(null);
    try {
      const result = await billingApi.testAi(testModel.trim());
      setTest(result.ok ? a.testOk(result.ms) : (result.error ?? t.errors.generic));
    } catch (err) {
      setTest(errorMessage(err, t));
    } finally {
      setBusy(null);
    }
  };

  if (!settings) return error !== null ? <Banner tone="danger">{errorMessage(error, t)}</Banner> : <Spinner size={24} label={t.common.loading} />;

  const providers: { id: ProviderId; label: string }[] = [
    { id: 'anthropic', label: 'Anthropic (Claude)' },
    { id: 'gemini', label: 'Google (Gemini)' },
  ];

  return (
    <Card padding="lg" className="billing-plan">
      <h3>{a.aiSourceTitle}</h3>
      <p className="admin__intro">{a.aiSourceBody}</p>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      <Segmented<AiSettings['mode']>
        label={a.aiSourceTitle}
        value={settings.mode}
        onChange={(mode) => void apply({ mode }, 'mode')}
        options={[
          { value: 'proxy', label: a.modes.proxy, tone: 'exam' },
          { value: 'official', label: a.modes.official, tone: 'reading' },
        ]}
      />
      {settings.mode === 'proxy' && !settings.proxyConfigured && <Banner tone="warning">{a.proxyMissing}</Banner>}

      {settings.mode === 'official' && (
        <div className="billing-keys">
          {!settings.canStoreKeys && <Banner tone="info">{a.keyNoSecret}</Banner>}
          {providers.map((provider) => {
            const info = settings.keys[provider.id];
            return (
              <div key={provider.id} className="billing-key">
                <strong>{provider.label}</strong>
                <span className="billing-key__state">{info.source ? a.keySaved(info.last4 ?? '', info.source) : a.keyMissing}</span>
                {settings.canStoreKeys && (
                  <div className="billing-key__form">
                    <TextInput
                      type="password"
                      autoComplete="off"
                      aria-label={provider.label}
                      placeholder={a.keyPlaceholder}
                      value={keys[provider.id]}
                      onChange={(e) => setKeys((k) => ({ ...k, [provider.id]: e.target.value }))}
                    />
                    <Button size="sm" onClick={() => void apply({ keys: { [provider.id]: keys[provider.id] } }, provider.id)} disabled={!keys[provider.id].trim()} loading={busy === provider.id}>
                      {a.saveSettings}
                    </Button>
                    {info.source === 'admin' && (
                      <Button size="sm" variant="ghost" icon="trash" onClick={() => void apply({ keys: { [provider.id]: '' } }, `rm-${provider.id}`)} loading={busy === `rm-${provider.id}`}>
                        {a.removeKey}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <p className="admin__intro">{a.keyHelp}</p>
        </div>
      )}

      <div className="billing-key__form">
        <TextInput aria-label={a.testModel} value={testModel} onChange={(e) => setTestModel(e.target.value)} />
        <Button size="sm" variant="secondary" icon="bolt" onClick={() => void runTest()} loading={busy === 'test'}>
          {a.testButton}
        </Button>
        {test && <span className="billing-key__state">{test}</span>}
      </div>
    </Card>
  );
};

export const BillingTab: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const a = t.billing.admin;
  const { data, error, isLoading, reload } = useAsync(() => billingApi.admin());
  const [instructions, setInstructions] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (isLoading && !data) return <Spinner size={28} label={t.common.loading} />;
  if (error) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!data) return null;

  const setEnforce = async (enforce: boolean) => {
    try {
      await billingApi.saveSettings({ enforce });
      setConfirming(false);
      await reload();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    }
  };
  const saveInstructions = async (value: string) => {
    try {
      await billingApi.saveSettings({ paymentInstructions: value });
      toast(t.imports.saved, 'success');
      setInstructions(null);
      await reload();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    }
  };

  return (
    <div className="billing-admin">
      <Card padding="lg" className="billing-plan">
        <div className="admin__toolbar admin__toolbar--between">
          <div>
            <h3>
              {a.enforceTitle} <Badge tone={data.enforce ? 'success' : 'neutral'}>{data.enforce ? a.on : a.off}</Badge>
            </h3>
            <p className="admin__intro">{a.enforceBody}</p>
            <p className="admin__intro">{a.monthUsage(data.month.credits, data.month.requests)}</p>
          </div>
          <Button variant={data.enforce ? 'secondary' : 'primary'} onClick={() => (data.enforce ? void setEnforce(false) : setConfirming(true))}>
            {data.enforce ? a.turnOff : a.turnOn}
          </Button>
        </div>
      </Card>

      <AiSourceCard />

      <Card padding="lg" className="billing-plan">
        <h3>{a.instructions}</h3>
        <p className="admin__intro">{a.instructionsHint}</p>
        <textarea className="input billing-instructions" rows={5} value={instructions ?? data.paymentInstructions} onChange={(e) => setInstructions(e.target.value)} aria-label={a.instructions} />
        <Button onClick={() => void saveInstructions(instructions ?? data.paymentInstructions)} disabled={instructions === null}>
          {a.saveSettings}
        </Button>
      </Card>

      {data.plans.map((plan) => (
        <PlanEditor key={plan.id} plan={plan} paid={plan.id === 'free' ? undefined : (data.paidUsers[plan.id] ?? 0)} onSaved={() => void reload()} />
      ))}

      <Modal
        open={confirming}
        title={a.enforceTitle}
        onClose={() => setConfirming(false)}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => void setEnforce(true)}>{a.enforceTitle}</Button>
          </>
        }
      >
        <p>{a.enforceConfirm}</p>
      </Modal>
    </div>
  );
};
