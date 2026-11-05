/**
 * Notifications in the app (FR-RM-61): at most one reminder a day, a nudge when a stage's checkpoint is close, and
 * a note when the week's review is ready. They are made when the learner opens the app (no background job), each
 * once, and the learner can switch each kind off.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts, notificationPrefs, notifications, type User } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { activeRoadmap, roadmapView } from '../roadmap/service.js';
import { lastFullWeek } from '../roadmap/weekly.js';
import { checkpointThresholds } from '../roadmap/checkpoints.js';

export interface Prefs {
  dailyReminder: boolean;
  reminderTime: string;
  checkpointAlert: boolean;
  weeklySummary: boolean;
}

export const DEFAULT_PREFS: Prefs = { dailyReminder: true, reminderTime: '20:00', checkpointAlert: true, weeklySummary: true };

/** How far below the unlock mark a stage must be to count as "close" */
const CLOSE_BY = 0.1;

export async function getPrefs(userId: string): Promise<Prefs> {
  const [row] = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).limit(1);
  return row ? { dailyReminder: row.dailyReminder, reminderTime: row.reminderTime, checkpointAlert: row.checkpointAlert, weeklySummary: row.weeklySummary } : DEFAULT_PREFS;
}

export async function setPrefs(userId: string, prefs: Prefs): Promise<void> {
  await db
    .insert(notificationPrefs)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set: { ...prefs, updatedAt: new Date() } });
}

async function add(userId: string, kind: string, dedupeKey: string, params: Record<string, unknown>): Promise<void> {
  await db.insert(notifications).values({ userId, kind, dedupeKey, params }).onConflictDoNothing();
}

/**
 * Makes the notifications that are due now. `localTime` is the learner's clock ("HH:MM"), since the server does not
 * know their time zone.
 */
export async function refreshNotifications(user: User, localTime: string, today = quotaDay()): Promise<void> {
  const prefs = await getPrefs(user.id);

  if (prefs.dailyReminder && localTime >= prefs.reminderTime) {
    const [studied] = await db.select({ n: sql<number>`count(*)::int` }).from(attempts).where(and(eq(attempts.userId, user.id), eq(attempts.day, today)));
    if (studied.n === 0) await add(user.id, 'reminder', `reminder:${today}`, { time: prefs.reminderTime });
  }

  const roadmap = await activeRoadmap(user.id, user.studyLanguage);
  if (!roadmap) return;

  if (prefs.weeklySummary) {
    const week = lastFullWeek(today);
    await add(user.id, 'weekly', `weekly:${week.start}`, week);
  }

  if (prefs.checkpointAlert) {
    const view = await roadmapView(user, roadmap);
    const index = view.progress.current;
    const stage = view.progress.stages[index];
    const { unlock } = await checkpointThresholds();
    const level = (view.roadmap.stages[index] as { level?: string } | undefined)?.level;
    if (stage && level && stage.passed !== true && stage.progress >= unlock - CLOSE_BY && stage.progress < unlock) {
      await add(user.id, 'checkpoint', `checkpoint:${roadmap.id}:${index}`, { level, percent: Math.round(stage.progress * 100) });
    }
  }
}

export async function listNotifications(userId: string, limit = 30) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

/** Marks the given notifications (or all of them) as read */
export async function markRead(userId: string, ids?: string[]): Promise<void> {
  const where = ids ? and(eq(notifications.userId, userId), inArray(notifications.id, ids), isNull(notifications.readAt)) : and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}
