/**
 * PricingPage
 * The plans, what each includes, how many AI credits are left, and how to pay (prepaid plans,
 * paid by transfer and activated by an admin)
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, Modal, PageHeader, ProgressBar, Segmented, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { billingApi, formatVnd, type PlanId, type PricingInfo, type PublicPlan } from '@/shared/billingApi';
import './billing.css';

type Period = 'month' | 'quarter' | 'year';
const MONTHS: Record<Period, number> = { month: 1, quarter: 3, year: 12 };

/** What a plan includes, as short lines */
function useFeatures(plan: PublicPlan): { text: string; included: boolean }[] {
  const { t } = useI18n();
  const writing = plan.limits.weeklyWriting;
  const speaking = plan.limits.weeklySpeaking;
  return [
    { text: t.billing.features.core, included: true },
    { text: t.billing.features.credits(plan.monthlyCredits), included: true },
    { text: writing === null ? t.billing.features.scoringUnlimited : t.billing.features.scoringWeekly(writing, speaking ?? writing), included: true },
    { text: t.billing.features.fullTests, included: plan.limits.fullTests },
    { text: t.billing.features.models(plan.models.length), included: true },
  ];
}

const PlanCard: React.FC<{ plan: PublicPlan; current: boolean; period: Period; onChoose: () => void }> = ({ plan, current, period, onChoose }) => {
  const { t } = useI18n();
  const features = useFeatures(plan);
  const price = plan.priceVnd?.[period];
  const monthly = price ? Math.round(price / MONTHS[period] / 1000) * 1000 : null;
  return (
    <Card padding="lg" className={`plan ${plan.id === 'plus' ? 'plan--featured' : ''} ${current ? 'plan--current' : ''}`}>
      {plan.id === 'plus' && <span className="plan__ribbon">{t.billing.popular}</span>}
      <h2 className="plan__name">{plan.name}</h2>
      <p className="plan__price">
        {price === undefined ? t.billing.free : formatVnd(price)}
        {price !== undefined && <small> / {t.billing.periods[period]}</small>}
      </p>
      <p className="plan__monthly">{monthly && period !== 'month' ? t.billing.perMonth(formatVnd(monthly)) : ' '}</p>
      <ul className="plan__features">
        {features.map((feature) => (
          <li key={feature.text} className={feature.included ? '' : 'plan__feature--off'}>
            <Icon name={feature.included ? 'check' : 'x'} size={16} /> {feature.text}
          </li>
        ))}
      </ul>
      {current ? (
        <Badge tone="success" icon="check">
          {t.billing.currentPlan}
        </Badge>
      ) : plan.priceVnd ? (
        <Button variant={plan.id === 'plus' ? 'primary' : 'secondary'} onClick={onChoose}>
          {t.billing.choose(plan.name)}
        </Button>
      ) : null}
    </Card>
  );
};

export const PricingPage: React.FC = () => {
  const { t, formatDate } = useI18n();
  const [info, setInfo] = useState<PricingInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [period, setPeriod] = useState<Period>('quarter');
  const [choice, setChoice] = useState<PublicPlan | null>(null);

  useEffect(() => {
    billingApi.plans().then(setInfo).catch(setError);
  }, []);

  if (error !== null) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!info) return <Spinner size={30} label={t.common.loading} />;

  const { current } = info;
  const meter = (label: string, used: number, limit: number | null) =>
    limit === null ? null : (
      <div className="plan-meter">
        <span>{label}</span>
        <ProgressBar value={(used / Math.max(1, limit)) * 100} tone={used / limit >= 0.9 ? 'danger' : 'reading'} size="sm" label={label} />
        <span>
          {Math.round(used)}/{limit}
        </span>
      </div>
    );

  return (
    <div className="pricing">
      <PageHeader eyebrow={t.nav.pricing} title={t.billing.title} description={t.billing.intro} />

      <Card padding="lg" className="pricing-status">
        <div>
          <h2>{t.billing.yourPlan(info.plans.find((p) => p.id === current.planId)?.name ?? current.planId)}</h2>
          <p>
            {current.endsAt ? t.billing.endsOn(formatDate(current.endsAt)) : current.planId === 'free' ? t.billing.freeForever : ''}
            {!current.enforced && ` ${t.billing.openNow}`}
          </p>
        </div>
        <div className="pricing-status__meters">
          {meter(t.billing.creditsToday, current.credits.day.used, current.credits.day.limit)}
          {meter(t.billing.creditsMonth, current.credits.month.used, current.credits.month.limit)}
        </div>
      </Card>

      <div className="pricing__period">
        <Segmented<Period>
          label={t.billing.period}
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: t.billing.periods.month, tone: 'reading' },
            { value: 'quarter', label: t.billing.periodsLong.quarter, tone: 'reading' },
            { value: 'year', label: t.billing.periodsLong.year, tone: 'reading' },
          ]}
        />
      </div>

      <div className="plans">
        {info.plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} current={plan.id === current.planId} period={period} onChoose={() => setChoice(plan)} />
        ))}
      </div>

      <p className="pricing__note">{t.billing.creditsNote}</p>

      <Modal
        open={choice !== null}
        title={choice ? t.billing.choose(choice.name) : ''}
        onClose={() => setChoice(null)}
        closeLabel={t.common.close}
        footer={<Button onClick={() => setChoice(null)}>{t.common.close}</Button>}
      >
        {choice && (
          <div className="pricing-pay">
            <p>
              <strong>{choice.name}</strong> · {t.billing.periodsLong[period === 'month' ? 'month' : period]}:{' '}
              <strong>{choice.priceVnd ? formatVnd(choice.priceVnd[period]) : ''}</strong>
            </p>
            {info.paymentInstructions ? <p className="pricing-pay__text">{info.paymentInstructions}</p> : <p>{t.billing.noInstructions}</p>}
            <p className="pricing__note">{t.billing.afterPaying}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export type { PlanId };
