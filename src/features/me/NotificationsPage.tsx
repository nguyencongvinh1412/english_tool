/**
 * NotificationsPage
 * The notification centre (what is waiting, unread marked by a dot and the word "unread") and, on its own page, what
 * the learner wants to be reminded about. At most one reminder a day.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Button, EmptyState, Skeleton } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/shared/http';
import { notificationsApi, type AppNotification, type NotificationSettings } from '@/shared/notificationsApi';
import { ToolFooter, ToolHeader } from '@/features/grammar/ToolChrome';
import './notifications.css';

const TARGET: Record<AppNotification['kind'], string> = { reminder: ROUTES.HOME, checkpoint: ROUTES.ROADMAP, weekly: ROUTES.HOME };

export const NotificationsPage: React.FC = () => {
  const { t, formatDate } = useI18n();
  const n = t.notifications;
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    notificationsApi.list().then(({ notifications }) => setItems(notifications)).catch(setError);
  }, []);

  const unread = items?.filter((item) => !item.read).length ?? 0;

  const open = (item: AppNotification) => {
    if (!item.read) void notificationsApi.markRead([item.id]).then(() => window.dispatchEvent(new Event('app:notifications')));
    navigate(TARGET[item.kind]);
  };

  return (
    <div className="tool-page">
      <ToolHeader title={n.title} subtitle={items ? n.unread(unread) : undefined} back={ROUTES.ME} />
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {!items ? (
        error === null && <Skeleton height={96} />
      ) : items.length === 0 ? (
        <EmptyState icon="alert" title={n.empty}>
          {n.emptyNote}
        </EmptyState>
      ) : (
        <ul className="notif-list">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className="notif" onClick={() => open(item)}>
                <span className={`notif__dot ${item.read ? '' : 'notif__dot--on'}`} aria-hidden="true" />
                <span className="notif__body">
                  <strong>{n.kinds[item.kind].title}</strong>
                  <span>{n.kinds[item.kind].body(item.params)}</span>
                  {!item.read && <span className="visually-hidden">{n.unreadLabel}</span>}
                </span>
                <time className="notif__time" dateTime={item.createdAt}>
                  {formatDate(item.createdAt)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link to={ROUTES.ME_NOTIFICATION_SETTINGS} className="tool-footer__link">
        {n.settingsLink}
      </Link>
    </div>
  );
};

/** One on/off row */
const Toggle: React.FC<{ label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, hint, checked, onChange }) => (
  <label className="notif-toggle">
    <span>
      <strong>{label}</strong>
      {hint && <small>{hint}</small>}
    </span>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  </label>
);

export const NotificationSettingsPage: React.FC = () => {
  const { t } = useI18n();
  const n = t.notifications;
  const [saved, setSaved] = useState<NotificationSettings | null>(null);
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    notificationsApi
      .settings()
      .then((loaded) => {
        setSaved(loaded);
        setDraft(loaded);
      })
      .catch(setError);
  }, []);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const stored = await notificationsApi.saveSettings(draft);
      setSaved(stored);
      setDraft(stored);
      setMessage(n.saved);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <div className="tool-page">
      <ToolHeader title={n.settingsTitle} subtitle={n.settingsSub} back={ROUTES.ME_NOTIFICATIONS} />
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {message && !dirty && <Banner tone="success">{message}</Banner>}
      {!draft ? (
        error === null && <Skeleton height={160} />
      ) : (
        <div className="notif-settings">
          <Toggle label={n.dailyReminder} hint={n.dailyHint} checked={draft.dailyReminder} onChange={(dailyReminder) => setDraft({ ...draft, dailyReminder })} />
          <label className="notif-time">
            <span>{n.reminderTime}</span>
            <input type="time" className="input" value={draft.reminderTime} disabled={!draft.dailyReminder} onChange={(e) => e.target.value && setDraft({ ...draft, reminderTime: e.target.value })} />
          </label>
          <Toggle label={n.checkpointAlert} hint={n.checkpointHint} checked={draft.checkpointAlert} onChange={(checkpointAlert) => setDraft({ ...draft, checkpointAlert })} />
          <Toggle label={n.weeklySummary} hint={n.weeklyHint} checked={draft.weeklySummary} onChange={(weeklySummary) => setDraft({ ...draft, weeklySummary })} />
          <p className="grammar__hint">{n.limitNote}</p>
        </div>
      )}
      <ToolFooter>
        <Button size="lg" disabled={!dirty} loading={busy} onClick={() => void save()}>
          {n.save}
        </Button>
      </ToolFooter>
    </div>
  );
};
