/**
 * AppStatus
 * Two quiet notices at the top of the page: the device is offline, and a new version of the app is ready
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Banner, Button } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { applyUpdate, UPDATE_EVENT } from '@/shared/pwa';
import { pendingReviews, PENDING_EVENT } from '@/shared/offlineCache';
import { vocabApi } from '@/shared/vocabApi';

export const AppStatus: React.FC = () => {
  const { t } = useI18n();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [update, setUpdate] = useState(false);
  const [pending, setPending] = useState(() => pendingReviews().length);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void vocabApi.flushReviews();
    };
    const count = () => setPending(pendingReviews().length);
    // Reviews left from an earlier visit are sent as soon as the app opens with a connection
    if (navigator.onLine) void vocabApi.flushReviews();
    const off = () => setOnline(false);
    const ready = () => setUpdate(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener(UPDATE_EVENT, ready);
    window.addEventListener(PENDING_EVENT, count);
    return () => {
      window.removeEventListener(PENDING_EVENT, count);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener(UPDATE_EVENT, ready);
    };
  }, []);

  return (
    <>
      {!online && <Banner tone="warning">{t.pwa.offline}</Banner>}
      {pending > 0 && <Banner tone="info">{t.pwa.pendingReviews(pending)}</Banner>}
      {update && (
        <Banner tone="info">
          {t.pwa.updateReady}{' '}
          <Button size="sm" variant="secondary" onClick={applyUpdate}>
            {t.pwa.reload}
          </Button>
        </Banner>
      )}
    </>
  );
};
