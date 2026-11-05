/**
 * Notifications API client and types (mirrors server/notifications)
 */
import { apiFetch } from './http';

export interface AppNotification {
  id: string;
  kind: 'reminder' | 'checkpoint' | 'weekly';
  params: Record<string, string | number>;
  read: boolean;
  createdAt: string;
}

export interface NotificationSettings {
  dailyReminder: boolean;
  reminderTime: string;
  checkpointAlert: boolean;
  weeklySummary: boolean;
}

/** The learner's clock as "HH:MM": the server cannot know their time zone */
export const localClock = (): string => new Date().toTimeString().slice(0, 5);

export const notificationsApi = {
  list: () => apiFetch<{ unread: number; notifications: AppNotification[] }>(`/api/notifications?time=${localClock()}`),
  markRead: (ids?: string[]) => apiFetch<void>('/api/notifications/read', { method: 'POST', json: { ids } }),
  settings: () => apiFetch<{ settings: NotificationSettings }>('/api/notifications/settings').then((r) => r.settings),
  saveSettings: (settings: NotificationSettings) => apiFetch<{ settings: NotificationSettings }>('/api/notifications/settings', { method: 'PUT', json: settings }).then((r) => r.settings),
};
