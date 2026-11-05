/**
 * PlanPage
 * AI credits in plain terms ("about 40 Writing checks"), today's and this month's allowance, the AI model, what
 * each task costs, and the plans side by side. Payment is arranged by instructions (no gateway yet).
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Button, Card, Icon, Modal, ProgressBar, Skeleton, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { ModelPicker } from '@/app/ModelPicker';
import { ROUTES } from '@/app/routes';
import { billingApi, creditsLeft, CREDIT_COST, formatVnd, tasksLeft, type PricingInfo, type PublicPlan } from '@/shared/billingApi';
import { errorMessage } from '@/shared/http';
import './me.css';

const Usage: React.FC<{ label: string; used: number; limit: number | null }> = ({ label, used, limit }) => {
  const { t } = useI18n();
  if (limit === null) return null;
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  return (
    <div className="plan__usage">
      <div className="plan__usage-head">
        <span>{label}</span>
        <strong>{t.planPage.used(Math.round(used), limit)}</strong>
      </div>
      <ProgressBar value={pct} tone="brand" size="sm" label={label} />
    </div>
  );
};

export const PlanPage: React.FC = () => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const [info, setInfo] = useState<PricingInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [choice, setChoice] = useState<PublicPlan | null>(null);

  useEffect(() => {
    billingApi.plans().then(setInfo).catch(setError);
  }, []);

  const left = creditsLeft(user.credits);
  const writing = tasksLeft(user.credits, 'writing');
  const chat = left === null ? null : Math.floor(left / CREDIT_COST.chat);
  const out = left !== null && left <= 0;
  const current = info?.plans.find((plan) => plan.id === info.current.planId);
  const upgrade = info?.plans.find((plan) => plan.id === 'plus' && plan.priceVnd) ?? info?.plans.find((plan) => plan.priceVnd && plan.id !== current?.id);
  const costs: [string, number][] = [
    [t.planPage.costs.writing, CREDIT_COST.writing],
    [t.planPage.costs.speaking, CREDIT_COST.speaking],
    [t.planPage.costs.chat, CREDIT_COST.chat],
    [t.planPage.costs.weekly, 1],
  ];

  return (
    <div className="plan">
      <header className="plan__head">
        <Link to={ROUTES.ME} className="plan__back" aria-label={t.planPage.back}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <h1>{t.planPage.title}</h1>
      </header>

      {error !== null && <Banner tone="warning">{errorMessage(error, t)}</Banner>}

      <div className="plan__grid">
        <div className="plan__col">
          <Card className="plan__card">
            <div className="plan__kicker">
              <span>{t.planPage.kicker}</span>
              {current && <Tag>{t.planPage.planTag(current.name)}</Tag>}
            </div>
            {left === null ? (
              <p>{t.me.values.unlimited}</p>
            ) : (
              <>
                <strong className="plan__balance">{out ? t.planPage.balanceOut : t.planPage.balance(left)}</strong>
                <p>{out || writing === null || chat === null ? t.planPage.conversionOut : t.planPage.conversion(writing, chat)}</p>
                <Usage label={t.planPage.day} used={user.credits.day.used} limit={user.credits.day.limit} />
                <Usage label={t.planPage.month} used={user.credits.month.used} limit={user.credits.month.limit} />
                <p className="me__hint">{t.planPage.resetNote}</p>
              </>
            )}
          </Card>

          <Card className="plan__card">
            <h2>{t.planPage.modelTitle}</h2>
            <ModelPicker />
            <p className="me__hint">{t.planPage.modelHint}</p>
          </Card>

          <Card className="plan__card">
            <span className="plan__kicker">{t.planPage.costTitle}</span>
            <ul className="plan__costs">
              {costs.map(([label, credits]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>{t.planPage.costValue(String(credits).replace('.', ','))}</strong>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="plan__col">
          <span className="plan__kicker">{t.planPage.compare}</span>
          {!info && error === null && <Skeleton height={120} />}
          {info?.plans.map((plan) => {
            const isCurrent = plan.id === info.current.planId;
            return (
              <Card key={plan.id} className={`plan__option ${isCurrent ? 'plan__option--current' : ''}`}>
                <div className="plan__option-head">
                  <strong>{plan.name}</strong>
                  <span>{plan.priceVnd ? t.planPage.perMonth(formatVnd(plan.priceVnd.month)) : formatVnd(0)}</span>
                </div>
                <p>{t.planPage.descriptions[plan.id] ?? ''}</p>
                {isCurrent && <Tag tone="brand">✓ {t.planPage.currentBadge}</Tag>}
              </Card>
            );
          })}
          {upgrade && upgrade.id !== current?.id && (
            <Button size="lg" block onClick={() => setChoice(upgrade)}>
              {t.planPage.upgradeTo(upgrade.name)}
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={choice !== null}
        title={choice ? t.planPage.payTitle(choice.name) : ''}
        onClose={() => setChoice(null)}
        closeLabel={t.common.close}
        footer={<Button onClick={() => setChoice(null)}>{t.common.close}</Button>}
      >
        {choice && (
          <div className="pricing-pay">
            <p>
              <strong>{choice.name}</strong>
              {choice.priceVnd && <> · {t.billing.periods.month}: <strong>{formatVnd(choice.priceVnd.month)}</strong> · {t.billing.periodsLong.quarter}: <strong>{formatVnd(choice.priceVnd.quarter)}</strong> · {t.billing.periodsLong.year}: <strong>{formatVnd(choice.priceVnd.year)}</strong></>}
            </p>
            {info?.paymentInstructions ? <p className="pricing-pay__text">{info.paymentInstructions}</p> : <p>{t.billing.noInstructions}</p>}
            <p className="pricing__note">{t.billing.afterPaying}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};
