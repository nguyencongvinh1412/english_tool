/**
 * Weekly review of a roadmap: what the learner did in the last full week (Monday to Sunday) against what the
 * current stage asks of a week, which skill went best and which fell behind, and at most one suggestion.
 * Numbers only: no AI wording. The suggestion, when applied, becomes focus tasks in the days ahead.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts, grammarProgress, roadmapTasks, srsCards, vocabItems, type Roadmap } from '../db/schema.js';
import type { TodayTask } from '../progress/today.js';
import { quotaDay } from '../services/aiAccess.js';
import { addDays, type SkillName, type Stage } from './plan.js';

const SKILLS: SkillName[] = ['listening', 'reading', 'writing', 'speaking'];
const AI_SKILLS = new Set<SkillName>(['writing', 'speaking']);
const FOCUS_DAYS = [1, 3];

export interface WeeklyTarget {
  kind: 'words' | 'grammar' | 'sessions';
  skill?: SkillName;
  have: number;
  goal: number;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  studyDays: number;
  plannedDays: number;
  /** Minutes studied, from recorded durations; null when none were recorded */
  minutes: number | null;
  plannedMinutes: number;
  targets: WeeklyTarget[];
  /** Share of the weekly targets met, 0 to 100 */
  percent: number;
  best: SkillName | null;
  weak: SkillName | null;
  suggestion: { skill: SkillName; minutes: number; days: number } | null;
}

/** Monday and Sunday of the last full week before `today` (ISO dates) */
export function lastFullWeek(today: string): { start: string; end: string } {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const sinceMonday = (dow + 6) % 7;
  const thisMonday = addDays(today, -sinceMonday);
  return { start: addDays(thisMonday, -7), end: addDays(thisMonday, -1) };
}

/** What a week of the stage asks for: its targets divided over its weeks, rounded up */
export function weeklyGoals(stage: Stage): { words: number; grammar: number; sessions: Partial<Record<SkillName, number>> } {
  const weeks = Math.max(1, stage.weeks);
  const o = stage.objectives;
  return {
    words: Math.ceil(o.vocabMastered / weeks),
    grammar: Math.ceil(o.grammarGood / weeks),
    sessions: Object.fromEntries(Object.entries(o.sessions).map(([skill, n]) => [skill, Math.ceil((n ?? 0) / weeks)])),
  };
}

/** Pure part: combine goals and counts into the review */
export function summarize(
  stage: Stage,
  done: { words: number; grammar: number; sessions: Partial<Record<SkillName, number>> },
  base: Pick<WeeklyReview, 'weekStart' | 'weekEnd' | 'studyDays' | 'plannedDays' | 'minutes' | 'plannedMinutes'>
): WeeklyReview {
  const goals = weeklyGoals(stage);
  const targets: WeeklyTarget[] = [];
  if (goals.words > 0) targets.push({ kind: 'words', have: done.words, goal: goals.words });
  if (goals.grammar > 0) targets.push({ kind: 'grammar', have: done.grammar, goal: goals.grammar });
  const ratios: { skill: SkillName; ratio: number }[] = [];
  for (const skill of SKILLS) {
    const goal = goals.sessions[skill] ?? 0;
    if (goal <= 0) continue;
    const have = done.sessions[skill] ?? 0;
    targets.push({ kind: 'sessions', skill, have, goal });
    ratios.push({ skill, ratio: have / goal });
  }
  const percent = targets.length ? Math.round((targets.reduce((n, t) => n + Math.min(1, t.have / t.goal), 0) / targets.length) * 100) : 0;
  // Ties go to the earlier skill in the usual order (listening, reading, writing, speaking)
  const top = Math.max(0, ...ratios.map((r) => r.ratio));
  const best = top > 0 ? (ratios.find((r) => r.ratio === top)?.skill ?? null) : null;
  const bottom = ratios.length ? Math.min(...ratios.map((r) => r.ratio)) : 1;
  const lowest = ratios.find((r) => r.ratio === bottom);
  const weak = lowest && bottom < 1 && lowest.skill !== best ? lowest.skill : null;
  return { ...base, targets, percent, best, weak, suggestion: weak ? { skill: weak, minutes: 15, days: FOCUS_DAYS.length } : null };
}

/** The review of the last full week, or null when there is nothing to review yet (roadmap too new) or no level stage */
export async function buildWeekly(userId: string, roadmap: Roadmap, currentStage: number, today = quotaDay()): Promise<WeeklyReview | null> {
  const { start, end } = lastFullWeek(today);
  if (roadmap.startDate > end) return null;
  const stage = (roadmap.stages as Stage[])[currentStage];
  if (!stage) return null;
  const language = roadmap.language as 'en' | 'ja';
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${addDays(end, 1)}T00:00:00Z`);

  const [rows, newWords, grammar] = await Promise.all([
    db
      .select({ day: attempts.day, skill: attempts.skill, seconds: attempts.durationSec })
      .from(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.language, language), gte(attempts.day, start), lte(attempts.day, end))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(and(eq(srsCards.userId, userId), eq(vocabItems.language, language), gte(srsCards.introducedAt, from), lte(srsCards.introducedAt, to))),
    language === 'en'
      ? db.select({ n: sql<number>`count(*)::int` }).from(grammarProgress).where(and(eq(grammarProgress.userId, userId), gte(grammarProgress.practicedAt, from), lte(grammarProgress.practicedAt, to)))
      : Promise.resolve([{ n: 0 }]),
  ]);

  const sessions: Partial<Record<SkillName, number>> = {};
  for (const r of rows) sessions[r.skill as SkillName] = (sessions[r.skill as SkillName] ?? 0) + 1;
  const seconds = rows.reduce((n, r) => n + (r.seconds ?? 0), 0);
  return summarize(
    stage,
    { words: newWords[0].n, grammar: grammar[0].n, sessions },
    {
      weekStart: start,
      weekEnd: end,
      studyDays: new Set(rows.map((r) => r.day)).size,
      plannedDays: Math.max(1, 7 - roadmap.restDays.length),
      minutes: seconds > 0 ? Math.round(seconds / 60) : null,
      plannedMinutes: Math.round(roadmap.hoursPerWeek * 60),
    }
  );
}

/** Applies the suggestion: a focus task for the skill on two of the next days. Returns how many were added. */
export async function applySuggestion(userId: string, roadmap: Roadmap, skill: SkillName, today = quotaDay()): Promise<number> {
  let added = 0;
  for (const offset of FOCUS_DAYS) {
    const task: TodayTask = { id: `focus-${skill}`, type: 'practice-skill', skill, minutes: 15, done: false, needsAi: AI_SKILLS.has(skill) || undefined };
    const rows = await db
      .insert(roadmapTasks)
      .values({ roadmapId: roadmap.id, userId, day: addDays(today, offset), taskKey: `focus-${skill}`, task })
      .onConflictDoNothing()
      .returning({ id: roadmapTasks.id });
    added += rows.length;
  }
  return added;
}
