/**
 * Notification routes: the centre (list, mark read) and what the learner wants to be reminded about
 */
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { getPrefs, listNotifications, markRead, refreshNotifications, setPrefs } from '../notifications/service.js';

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 20:00');
const prefsSchema = z.object({ dailyReminder: z.boolean(), reminderTime: timeOfDay, checkpointAlert: z.boolean(), weeklySummary: z.boolean() });
const listQuery = z.object({ time: timeOfDay.optional() });
const readSchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });

export function createNotificationsRouter(): Router {
  const router = Router();

  /**
   * GET /notifications?time=HH:MM - Makes what is due (by the learner's clock) and lists the latest
   */
  router.get('/notifications', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const { time } = listQuery.parse(req.query);
    if (time) await refreshNotifications(user, time);
    const rows = await listNotifications(user.id);
    res.json({
      unread: rows.filter((n) => !n.readAt).length,
      notifications: rows.map((n) => ({ id: n.id, kind: n.kind, params: n.params, read: Boolean(n.readAt), createdAt: n.createdAt })),
    });
  });

  /**
   * POST /notifications/read - Mark some (or all, with no ids) as read
   */
  router.post('/notifications/read', requireAuth, async (req, res) => {
    const { ids } = readSchema.parse(req.body ?? {});
    await markRead(currentUser(req).id, ids);
    res.status(204).end();
  });

  router.get('/notifications/settings', requireAuth, async (req, res) => {
    res.json({ settings: await getPrefs(currentUser(req).id) });
  });

  router.put('/notifications/settings', requireAuth, async (req, res) => {
    const prefs = prefsSchema.parse(req.body);
    await setPrefs(currentUser(req).id, prefs);
    res.json({ settings: prefs });
  });

  return router;
}
