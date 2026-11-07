/**
 * Saved daily tasks of a roadmap. Today is built from live signals; with a roadmap those tasks are stored the first
 * time the day is opened, and a learning task nobody finished is moved forward (at most a few, for a few days)
 * instead of vanishing. Reviews are never carried: their counts are always rebuilt from what is due now.
 */
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { roadmapTasks, type RoadmapTask } from '../db/schema.js';
import { addDays } from './plan.js';
import type { TodayTask } from '../progress/today.js';

/** Task types that make sense to do tomorrow when they were skipped today */
const ROLLABLE = new Set<TodayTask['type']>(['learn-grammar', 'practice-skill', 'learn-words']);
export const ROLL_WINDOW_DAYS = 3;
export const MAX_ROLLED = 2;

/** What a task is about, so a rolled task is not added when today already has the same thing */
export function taskIdentity(task: TodayTask): string {
  switch (task.type) {
    case 'learn-grammar':
    case 'fix-mistakes':
      return `${task.type}:${task.pointId}`;
    case 'practice-skill':
      return `${task.type}:${task.skill}`;
    case 'learn-words':
      return `${task.type}:${task.level}`;
    default:
      return task.type;
  }
}

/** Unfinished rollable tasks from earlier days, newest first, without repeats of today's tasks */
export function pickCarryOver<T extends { task: TodayTask }>(previous: T[], today: TodayTask[], max = MAX_ROLLED): T[] {
  const taken = new Set(today.map(taskIdentity));
  const picked: T[] = [];
  for (const row of previous) {
    if (picked.length >= max) break;
    const identity = taskIdentity(row.task);
    if (!ROLLABLE.has(row.task.type) || taken.has(identity)) continue;
    taken.add(identity);
    picked.push(row);
  }
  return picked;
}

const RANK: Record<TodayTask['type'], number> = { 'review-words': 0, 'review-grammar': 1, 'fix-mistakes': 2, 'learn-grammar': 4, 'practice-skill': 5, 'learn-deep-word': 5, 'learn-words': 6 };

/** Review first, then what was carried over, then the rest (BR-08) */
export const byPriority = (a: TodayTask, b: TodayTask): number => {
  const rank = (t: TodayTask) => (t.rolledFrom ? 3 : RANK[t.type]);
  return rank(a) - rank(b);
};

/**
 * Today's stored tasks for a roadmap. The first call of the day carries over and stores the day's tasks; every
 * call marks finished tasks done using the live check.
 */
export async function syncTodayTasks(roadmapId: string, userId: string, day: string, drafts: TodayTask[], isDone: (task: TodayTask) => boolean): Promise<TodayTask[]> {
  return db.transaction(async (tx) => {
    const forDay = () => tx.select().from(roadmapTasks).where(and(eq(roadmapTasks.roadmapId, roadmapId), eq(roadmapTasks.day, day))).orderBy(asc(roadmapTasks.createdAt));
    let rows = await forDay();

    // Focus tasks (from a remedial week or a weekly suggestion) can be stored ahead of time; they do not mean the day was set up
    if (!rows.some((row) => !row.taskKey.startsWith('focus-'))) {
      const earlier = await tx
        .select()
        .from(roadmapTasks)
        .where(and(eq(roadmapTasks.roadmapId, roadmapId), eq(roadmapTasks.status, 'todo'), lt(roadmapTasks.day, day), gte(roadmapTasks.day, addDays(day, -ROLL_WINDOW_DAYS))))
        .orderBy(sql`${roadmapTasks.day} desc`);
      for (const row of pickCarryOver(earlier.map((r) => ({ ...r, task: r.task as TodayTask })), drafts)) {
        await tx.update(roadmapTasks).set({ day, rolledFrom: row.rolledFrom ?? row.day }).where(eq(roadmapTasks.id, row.id));
      }
      await tx
        .insert(roadmapTasks)
        .values(drafts.map((task) => ({ roadmapId, userId, day, taskKey: task.id, task })))
        .onConflictDoNothing();
      rows = await forDay();
    }

    const finished = rows.filter((row) => row.status === 'todo' && isDone(row.task as TodayTask));
    for (const row of finished) await tx.update(roadmapTasks).set({ status: 'done', doneAt: new Date() }).where(eq(roadmapTasks.id, row.id));
    const finishedIds = new Set(finished.map((r) => r.id));

    return rows
      .map((row: RoadmapTask) => ({ ...(row.task as TodayTask), done: row.status === 'done' || finishedIds.has(row.id), rolledFrom: row.rolledFrom ?? undefined }))
      .sort(byPriority);
  });
}
