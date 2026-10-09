/**
 * Progress
 * XP rules, streaks and the per-user summary shown on the dashboard and profile
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts } from '../db/schema.js';
import { quotaDay } from './aiAccess.js';

/** Which skill each activity trains; the server decides, not the client */
export const ACTIVITY_SKILLS = {
  dictation: 'listening',
  'listening-quiz': 'listening',
  'reading-quiz': 'reading',
  pronunciation: 'speaking',
  conversation: 'speaking',
  scenario: 'speaking',
  'speaking-ielts': 'speaking',
  'writing-task': 'writing',
} as const;

export type Activity = keyof typeof ACTIVITY_SKILLS;
export type Skill = (typeof ACTIVITY_SKILLS)[Activity];

const ALL_SKILLS = ['listening', 'reading', 'speaking', 'writing'] as const;

/** XP for finishing any activity */
export const XP_COMPLETE = 10;
/** Bonus XP for scoring at least XP_BONUS_THRESHOLD of the maximum */
export const XP_BONUS = 5;
const XP_BONUS_THRESHOLD = 0.8;

/** Days shown in the weekly bar chart and the activity heatmap */
const WEEK_DAYS = 7;
const HEATMAP_DAYS = 84;
const RECENT_LIMIT = 8;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * XP earned for one attempt
 * @param score - Score achieved, if the activity is scored
 * @param maxScore - Maximum possible score
 */
export function computeXp(score: number | null | undefined, maxScore: number | null | undefined): number {
  const hasScore = score !== null && score !== undefined && maxScore && maxScore > 0;
  return XP_COMPLETE + (hasScore && score / maxScore >= XP_BONUS_THRESHOLD ? XP_BONUS : 0);
}

/**
 * Converts a YYYY-MM-DD string to a day number for arithmetic
 */
function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / MS_PER_DAY);
}

/**
 * Formats a day number back to YYYY-MM-DD
 */
function dayString(dayNum: number): string {
  return new Date(dayNum * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Current and best streak from the days a user practiced
 * The current streak stays alive until the end of the day after the last practice
 *
 * @param days - Distinct practice days (YYYY-MM-DD), any order
 * @param today - Today in the streak time zone
 */
export function computeStreak(days: string[], today: string): { current: number; best: number; activeToday: boolean } {
  const sorted = [...new Set(days)].map(dayNumber).sort((a, b) => a - b);
  const todayNum = dayNumber(today);

  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  const last = sorted[sorted.length - 1];
  const activeToday = last === todayNum;
  // Streak is broken if the last practice was before yesterday
  const current = last !== undefined && last >= todayNum - 1 ? run : 0;

  return { current, best, activeToday };
}

/**
 * Everything the dashboard and profile need about a user's progress
 */
export async function getProgressSummary(userId: string) {
  const today = quotaDay();
  const todayNum = dayNumber(today);
  const heatmapStart = dayString(todayNum - (HEATMAP_DAYS - 1));

  const [totals] = await db
    .select({
      xpTotal: sql<number>`coalesce(sum(${attempts.xp}), 0)::int`,
      attemptsTotal: sql<number>`count(*)::int`,
    })
    .from(attempts)
    .where(eq(attempts.userId, userId));

  const dayRows = await db
    .selectDistinct({ day: attempts.day })
    .from(attempts)
    .where(eq(attempts.userId, userId));

  const dailyRows = await db
    .select({
      day: attempts.day,
      xp: sql<number>`sum(${attempts.xp})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), gte(attempts.day, heatmapStart)))
    .groupBy(attempts.day);

  const skillRows = await db
    .select({
      skill: attempts.skill,
      count: sql<number>`count(*)::int`,
      xp: sql<number>`sum(${attempts.xp})::int`,
      // Average percentage over scored attempts only
      avgPercent: sql<number | null>`round(avg(case when ${attempts.maxScore} > 0 then ${attempts.score} / ${attempts.maxScore} * 100 end))::int`,
      lastAt: sql<string | null>`max(${attempts.completedAt})`,
    })
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .groupBy(attempts.skill);

  const recent = await db
    .select()
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.completedAt))
    .limit(RECENT_LIMIT);

  const daily = new Map(dailyRows.map((row) => [row.day, row]));
  const byDay = (offset: number) => {
    const day = dayString(todayNum - offset);
    return { day, xp: daily.get(day)?.xp ?? 0, count: daily.get(day)?.count ?? 0 };
  };

  return {
    today,
    xpTotal: totals.xpTotal,
    xpToday: daily.get(today)?.xp ?? 0,
    attemptsTotal: totals.attemptsTotal,
    streak: computeStreak(
      dayRows.map((row) => row.day),
      today
    ),
    week: Array.from({ length: WEEK_DAYS }, (_, i) => byDay(WEEK_DAYS - 1 - i)),
    heatmap: Array.from({ length: HEATMAP_DAYS }, (_, i) => byDay(HEATMAP_DAYS - 1 - i)),
    skills: Object.fromEntries(
      ALL_SKILLS.map((name) => {
        const row = skillRows.find((r) => r.skill === name);
        return [name, { attempts: row?.count ?? 0, xp: row?.xp ?? 0, avgPercent: row?.avgPercent ?? null, lastAt: row?.lastAt ?? null }];
      })
    ),
    recent: recent.map(toPublicAttempt),
  };
}

export interface AttemptInput {
  activity: Activity;
  contentRef?: string | null;
  title?: string | null;
  score?: number | null;
  maxScore?: number | null;
  durationSec?: number | null;
  details?: Record<string, unknown> | null;
  /** Carried-over legacy scores earn no XP */
  imported?: boolean;
}

/**
 * Stores a finished activity with server-derived skill, XP and day
 */
export async function recordAttempt(userId: string, input: AttemptInput) {
  const xp = input.imported ? 0 : computeXp(input.score, input.maxScore);

  const [attempt] = await db
    .insert(attempts)
    .values({
      userId,
      activity: input.activity,
      skill: ACTIVITY_SKILLS[input.activity],
      contentRef: input.contentRef ?? null,
      title: input.title ?? null,
      score: input.score ?? null,
      maxScore: input.maxScore ?? null,
      durationSec: input.durationSec ?? null,
      details: input.imported ? { ...(input.details ?? {}), imported: true } : (input.details ?? null),
      xp,
      day: quotaDay(),
    })
    .returning();

  return { attempt: toPublicAttempt(attempt), xpEarned: xp };
}

/**
 * Attempt fields sent to the client
 */
export function toPublicAttempt(attempt: typeof attempts.$inferSelect) {
  return {
    id: attempt.id,
    activity: attempt.activity,
    skill: attempt.skill,
    contentRef: attempt.contentRef,
    title: attempt.title,
    score: attempt.score,
    maxScore: attempt.maxScore,
    durationSec: attempt.durationSec,
    xp: attempt.xp,
    completedAt: attempt.completedAt,
  };
}

