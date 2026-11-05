/**
 * Today: a short, ordered list of what to do now, fitted to the minutes the learner has.
 * Built on the same signals as the progress page (due reviews, repeated mistakes, uncovered levels, the least
 * practised skill). There is no stored plan yet: the list is recomputed on every request and "done" comes from what
 * the learner did today. Due reviews always come first and are never dropped (BR-08).
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts, grammarProgress, srsCards, vocabItems, type User } from '../db/schema.js';
import { activeRoadmap } from '../roadmap/service.js';
import { syncTodayTasks } from '../roadmap/tasks.js';
import { quotaDay } from '../services/aiAccess.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { recentMistakes } from '../grammar/mistakes.js';
import { CEFR_ORDER, JLPT_ORDER, levelsUpTo } from './levels.js';
import { goalOf, grammarState, vocabByLevel, type StudyLanguage } from './journey.js';

export const TODAY_BUDGETS = [10, 20, 45] as const;
export type TodayBudget = (typeof TODAY_BUDGETS)[number];

type Skill = 'listening' | 'reading' | 'speaking' | 'writing';
const SKILLS: Skill[] = ['listening', 'reading', 'writing', 'speaking'];
/** Skills that need the AI to score them */
const AI_SKILLS = new Set<Skill>(['speaking', 'writing']);
const SKILL_MINUTES: Record<Skill, number> = { listening: 15, reading: 12, writing: 15, speaking: 8 };
const MIN_SHORT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type TodayTask = {
  id: string;
  minutes: number;
  /** Shortened to fit a small time budget */
  shortened?: boolean;
  done: boolean;
  needsAi?: boolean;
  /** Day it was first planned, when it was carried over from an earlier day */
  rolledFrom?: string;
} & (
  | { type: 'review-words'; count: number }
  | { type: 'review-grammar'; count: number }
  | { type: 'fix-mistakes'; pointId: string; count: number }
  | { type: 'learn-grammar'; pointId: string; level: string }
  | { type: 'practice-skill'; skill: Skill }
  | { type: 'learn-words'; level: string; remaining: number }
);

/**
 * Fits tasks (already in priority order) into a budget. The first is always kept; a later one that does not fully
 * fit is shortened when at least MIN_SHORT minutes remain, otherwise left for another day.
 */
export function fitToBudget(drafts: TodayTask[], budget: number): { tasks: TodayTask[]; carried: number } {
  const tasks: TodayTask[] = [];
  let left = budget;
  for (const draft of drafts) {
    if (tasks.length === 0) {
      const minutes = Math.min(draft.minutes, budget);
      tasks.push({ ...draft, minutes, shortened: minutes < draft.minutes || undefined });
      left -= minutes;
    } else if (draft.minutes <= left) {
      tasks.push(draft);
      left -= draft.minutes;
    } else if (left >= MIN_SHORT) {
      tasks.push({ ...draft, minutes: left, shortened: true });
      left = 0;
    }
  }
  return { tasks, carried: drafts.length - tasks.length };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export async function buildToday(user: User, budget: TodayBudget, language: StudyLanguage = user.studyLanguage) {
  const day = quotaDay();
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const goal = goalOf(user, language);
  const order: readonly string[] = language === 'en' ? CEFR_ORDER : JLPT_ORDER;
  const roadmap = await activeRoadmap(user.id, language);
  // With a roadmap, new words and grammar come from the levels of its stages, not from A1 upwards
  const covered = roadmap ? [...new Set((roadmap.stages as { level: string }[]).map((s) => s.level))] : levelsUpTo(order, goal.targetLevel);

  const [levels, grammar, mistakes, dueWords, bySkill, doneToday, grammarToday, lastActive] = await Promise.all([
    vocabByLevel(user.id, language),
    language === 'en' ? grammarState(user.id) : Promise.resolve(null),
    language === 'en' ? recentMistakes(user.id) : Promise.resolve([]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(and(eq(srsCards.userId, user.id), eq(vocabItems.language, language), lte(srsCards.dueAt, new Date()))),
    db
      .select({ skill: attempts.skill, n: sql<number>`count(*)::int` })
      .from(attempts)
      .where(and(eq(attempts.userId, user.id), eq(attempts.language, language), gte(attempts.completedAt, weekAgo)))
      .groupBy(attempts.skill),
    db
      .select({ activity: attempts.activity, skill: attempts.skill })
      .from(attempts)
      .where(and(eq(attempts.userId, user.id), eq(attempts.language, language), eq(attempts.day, day))),
    language === 'en'
      ? db.select({ n: sql<number>`count(*)::int` }).from(grammarProgress).where(and(eq(grammarProgress.userId, user.id), gte(grammarProgress.practicedAt, new Date(`${day}T00:00:00+07:00`))))
      : Promise.resolve([{ n: 0 }]),
    db
      .select({ day: sql<string | null>`max(${attempts.day})::text` })
      .from(attempts)
      .where(and(eq(attempts.userId, user.id), eq(attempts.language, language))),
  ]);

  const vocabToday = doneToday.some((a) => a.activity === 'en-vocab' || a.activity === 'vocab');
  const grammarDone = grammarToday[0].n > 0;
  const skillDone = (s: Skill) => doneToday.some((a) => a.skill === s);

  const drafts: TodayTask[] = [];
  const dueCount = dueWords[0].n;
  if (dueCount > 0) drafts.push({ id: 'review-words', type: 'review-words', count: dueCount, minutes: clamp(Math.ceil(dueCount / 4), 3, 10), done: vocabToday });
  if (grammar && grammar.due > 0) drafts.push({ id: 'review-grammar', type: 'review-grammar', count: grammar.due, minutes: clamp(grammar.due * 2, 5, 10), done: grammarDone });
  const urgent = mistakes.find((m) => m.urgent);
  if (urgent) drafts.push({ id: `fix-${urgent.pointId}`, type: 'fix-mistakes', pointId: urgent.pointId, count: urgent.count, minutes: 8, done: grammarDone });

  const nextPoint = grammar ? GRAMMAR_POINTS.filter((p) => covered.includes(p.cefr)).find((p) => !grammar.rows.has(p.id)) : undefined;
  if (nextPoint) drafts.push({ id: `grammar-${nextPoint.id}`, type: 'learn-grammar', pointId: nextPoint.id, level: nextPoint.cefr, minutes: 12, done: grammarDone });

  // The skill practised least this week; ties keep the order listening, reading, writing, speaking
  const count = (s: Skill) => bySkill.find((r) => r.skill === s)?.n ?? 0;
  const weakest = [...SKILLS].sort((a, b) => count(a) - count(b))[0];
  drafts.push({ id: `skill-${weakest}`, type: 'practice-skill', skill: weakest, minutes: SKILL_MINUTES[weakest], done: skillDone(weakest), needsAi: AI_SKILLS.has(weakest) || undefined });

  const gap = covered
    .map((level) => {
      const rows = levels.filter((l) => l.level === level);
      return { level, total: rows.reduce((n, r) => n + r.total, 0), seen: rows.reduce((n, r) => n + r.seen, 0) };
    })
    .find((l) => l.total > 0 && l.seen < l.total);
  if (gap) drafts.push({ id: `words-${gap.level}`, type: 'learn-words', level: gap.level, remaining: gap.total - gap.seen, minutes: 6, done: vocabToday });

  // With a roadmap the day's tasks are stored, so an unfinished learning task can move to tomorrow
  const isDone = (task: TodayTask) => {
    switch (task.type) {
      case 'review-words':
      case 'learn-words':
        return vocabToday;
      case 'practice-skill':
        return skillDone(task.skill);
      default:
        return grammarDone;
    }
  };
  const planned = roadmap ? await syncTodayTasks(roadmap.id, user.id, day, drafts, isDone) : drafts;

  const { tasks, carried } = fitToBudget(planned, budget);

  // Away for a week or more: Today offers a gentler way back (FR-RM-53)
  const lastDay = lastActive[0]?.day ?? roadmap?.startDate ?? null;
  const daysAway = lastDay ? Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${lastDay}T00:00:00Z`)) / 86_400_000) : 0;

  return {
    language,
    budget,
    totalMinutes: tasks.reduce((n, t) => n + t.minutes, 0),
    doneMinutes: tasks.filter((t) => t.done).reduce((n, t) => n + t.minutes, 0),
    tasks,
    carried,
    /** Tasks moved here from earlier days */
    rolled: tasks.filter((t) => t.rolledFrom).length,
    welcomeBack: roadmap && daysAway >= 7 ? { days: daysAway } : null,
    goal,
  };
}
