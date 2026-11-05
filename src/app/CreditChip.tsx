/**
 * CreditChip
 * AI credits left in words a learner can use ("about 40 Writing checks"); amber and calm when they run out
 */
import type React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { tasksLeft } from '@/shared/billingApi';
import { useCurrentUser } from './AuthProvider';
import { ROUTES } from './routes';

export const CreditChip: React.FC = () => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const checks = tasksLeft(user.credits, 'writing');
  // Plans not enforced: nothing to show
  if (checks === null) return null;
  const out = checks <= 0;
  return (
    <Link to={ROUTES.ME_PLAN} className={`chip ${out ? 'chip--notice' : 'chip--brand'}`}>
      <Icon name="bolt" size={16} />
      <span className="chip__text">{out ? t.today.creditsOut : t.today.creditsChip(checks)}</span>
    </Link>
  );
};
