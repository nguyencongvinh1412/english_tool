/**
 * UpgradeListener
 * Opens an upgrade prompt whenever the server says a plan limit was reached
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { PLAN_LIMIT_EVENT } from '@/shared/http';

export const UpgradeListener: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const onLimit = (event: Event) => setCode((event as CustomEvent<{ code: string }>).detail.code);
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, onLimit);
  }, []);

  const text = code ? ((t.billing.limitReached as Record<string, { title: string; body: string }>)[code] ?? t.billing.limitReached.credits_exhausted) : null;
  return (
    <Modal
      open={code !== null}
      title={text?.title ?? ''}
      onClose={() => setCode(null)}
      closeLabel={t.common.close}
      footer={
        <>
          <Button variant="ghost" onClick={() => setCode(null)}>
            {t.billing.notNow}
          </Button>
          <Button
            icon="sparkles"
            onClick={() => {
              setCode(null);
              navigate(ROUTES.PRICING);
            }}
          >
            {t.billing.seePlans}
          </Button>
        </>
      }
    >
      <p>{text?.body}</p>
    </Modal>
  );
};
