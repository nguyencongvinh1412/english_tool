/**
 * NotificationChip
 * A bell in the top bar that opens the notification centre; the number of unread ones is written out (not colour only)
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { notificationsApi } from '@/shared/notificationsApi';
import { ROUTES } from './routes';
import '@/features/me/notifications.css';

/** Look for news again this often while the app stays open */
const REFRESH_MS = 5 * 60 * 1000;

export const NotificationChip: React.FC = () => {
  const { t } = useI18n();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = () => notificationsApi.list().then((result) => setUnread(result.unread)).catch(() => undefined);
    void load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener('app:notifications', load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('app:notifications', load);
    };
  }, []);

  return (
    <Link to={ROUTES.ME_NOTIFICATIONS} className="chip chip--plain notif-chip" aria-label={unread > 0 ? t.notifications.chipUnread(unread) : t.notifications.title}>
      <Icon name="alert" size={16} />
      {unread > 0 && <span className="notif-chip__badge">{unread}</span>}
    </Link>
  );
};
