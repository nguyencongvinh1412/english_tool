/**
 * Journey: what a learner has covered and how far that is from their goal.
 * Words and grammar points are "mastered" once their review interval reaches three weeks (the same rule as the
 * vocabulary and grammar pages), "learning" while they are being reviewed, and "new" otherwise. Coverage is counted
 * for the levels up to the goal; nothing here predicts an exam score.
 */
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts, examSessions, grammarProgress, progressSnapshots, srsCards, vocabItems, type User } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { GRAMMAR_CLUSTERS, GRAMMAR_POINTS } from '../grammar/map.js';
import { recentMistakes } from '../grammar/mistakes.js';
import { masteryOf } from '../grammar/practice.js';
import { MASTERED_DAYS } from '../vocab/srs.js';
import { CEFR_ORDER, JLPT_ORDER, levelsUpTo, targetCefr } from './levels.js';

export type StudyLanguage = 'en' | 'ja';

const HISTORY_DAYS = 90;
const RECENT_EXAMS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MAX_STEPS = 4;

export interface LevelProgress {
  level: string;
  /** Japanese levels are counted separately for kanji and words */
  kind?: string;
  total: number;
  seen: number;
  mastered: number;
}

export interface SnapshotCounts {
  vocabSeen: number;
  vocabMastered: number;
  grammarSeen: number;
  grammarGood: number;
  grammarMastered: number;
}

export type PathStep =
  | { type: 'review-words'; count: number }
  | { type: 'review-grammar'; count: number }
  | { type: 'fix-mistakes'; pointId: string; count: number }
  | { type: 'learn-words'; level: string; remaining: number }
  | { type: 'learn-grammar'; pointId: string; level: string };

const sum = (rows: { total: number; seen: number; mastered: number }[]) =>
  rows.reduce((n, r) => ({ total: n.total + r.total, seen: n.seen + r.seen, mastered: n.mastered + r.mastered }), { total: 0, seen: 0, mastered: 0 });

const isMastered = sql`(${srsCards.state} = 'review' and ${srsCards.intervalDays} >= ${MASTERED_DAYS})`;

/**
 * Words (English) or kanji and words (Japanese) per level, with how many the learner met and mastered
 */
export async function vocabByLevel(userId: string, language: StudyLanguage): Promise<LevelProgress[]> {
  const mine = and(eq(srsCards.itemId, vocabItems.id), eq(srsCards.userId, userId));
  const rows = await db
    .select({
      level: vocabItems.level,
      kind: vocabItems.kind,
      total: sql<number>`count(*)::int`,
      seen: sql<number>`count(${srsCards.itemId})::int`,
      mastered: sql<number>`count(*) filter (where ${isMastered})::int`,
    })
    .from(vocabItems)
    .leftJoin(srsCards, mine)
    .where(and(eq(vocabItems.language, language), sql`${vocabItems.level} <> ''`))
    .groupBy(vocabItems.level, vocabItems.kind);

  const order: readonly string[] = language === 'en' ? CEFR_ORDER : JLPT_ORDER;
  const result: LevelProgress[] = rows.map((r) => ({ level: r.level, ...(language === 'ja' && { kind: r.kind }), total: r.total, seen: r.seen, mastered: r.mastered }));
  return result.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || (a.kind ?? '').localeCompare(b.kind ?? ''));
}

interface GrammarState {
  total: number;
  counts: { none: number; learning: number; good: number; mastered: number };
  clusters: { id: string; title: { en: string; vi: string }; total: number; practised: number; good: number; mastered: number }[];
  due: number;
  rows: Map<string, { mastery: string; dueAt: Date }>;
}

/**
 * Mastery of the 80 grammar points, overall and per cluster
 */
export async function grammarState(userId: string): Promise<GrammarState> {
  const progress = await db.select().from(grammarProgress).where(eq(grammarProgress.userId, userId));
  const rows = new Map(progress.map((p) => [p.pointId, { mastery: masteryOf(p.intervalDays), dueAt: p.dueAt }]));
  const now = Date.now();
  const counts = { none: 0, learning: 0, good: 0, mastered: 0 };
  for (const point of GRAMMAR_POINTS) counts[(rows.get(point.id)?.mastery ?? 'none') as keyof typeof counts]++;

  const clusters = GRAMMAR_CLUSTERS.map((cluster) => {
    const points = GRAMMAR_POINTS.filter((p) => p.cluster === cluster.id);
    const state = (id: string) => rows.get(id)?.mastery;
    return {
      id: cluster.id,
      title: cluster.title,
      total: points.length,
      practised: points.filter((p) => state(p.id)).length,
      good: points.filter((p) => state(p.id) === 'good' || state(p.id) === 'mastered').length,
      mastered: points.filter((p) => state(p.id) === 'mastered').length,
    };
  });
  return { total: GRAMMAR_POINTS.length, counts, clusters, due: [...rows.values()].filter((r) => r.dueAt.getTime() <= now).length, rows };
}

/**
 * Totals for the trend charts
 */
export async function snapshotCounts(userId: string, language: StudyLanguage): Promise<SnapshotCounts> {
  const [vocab] = await db
    .select({ seen: sql<number>`count(*)::int`, mastered: sql<number>`count(*) filter (where ${isMastered})::int` })
    .from(srsCards)
    .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
    .where(and(eq(srsCards.userId, userId), eq(vocabItems.language, language)));

  const grammar =
    language === 'en'
      ? (await db.select({ intervalDays: grammarProgress.intervalDays }).from(grammarProgress).where(eq(grammarProgress.userId, userId))).map((r) => masteryOf(r.intervalDays))
      : [];
  return {
    vocabSeen: vocab.seen,
    vocabMastered: vocab.mastered,
    grammarSeen: grammar.length,
    grammarGood: grammar.filter((m) => m === 'good' || m === 'mastered').length,
    grammarMastered: grammar.filter((m) => m === 'mastered').length,
  };
}

/**
 * Stores today's totals for a learner (one row per day, overwritten as they study)
 */
export async function recordSnapshot(userId: string, language: StudyLanguage): Promise<void> {
  const data = await snapshotCounts(userId, language);
  await db
    .insert(progressSnapshots)
    .values({ userId, language, day: quotaDay(), data })
    .onConflictDoUpdate({ target: [progressSnapshots.userId, progressSnapshots.language, progressSnapshots.day], set: { data } });
}

/**
 * Finished mock tests with a total score, newest first
 */
async function examScores(userId: string, language: StudyLanguage) {
  const exams = language === 'ja' ? (['jlpt'] as const) : (['toeic', 'ielts'] as const);
  const rows = await db
    .select({ id: examSessions.id, exam: examSessions.exam, mode: examSessions.mode, at: examSessions.submittedAt, result: examSessions.result })
    .from(examSessions)
    .where(and(eq(examSessions.userId, userId), eq(examSessions.status, 'submitted'), sql`${examSessions.exam} in (${sql.join(exams.map((e) => sql`${e}`), sql`, `)})`))
    .orderBy(desc(examSessions.submittedAt))
    .limit(RECENT_EXAMS * 2);

  return rows
    .map((row) => {
      const r = (row.result ?? {}) as { totalScaled?: number | null; overall?: number | null; total?: number | null; passMark?: number; passed?: boolean | null };
      const score = row.exam === 'toeic' ? r.totalScaled : row.exam === 'ielts' ? r.overall : r.total;
      const max = row.exam === 'toeic' ? 990 : row.exam === 'ielts' ? 9 : 180;
      return { id: row.id, exam: row.exam, mode: row.mode, at: row.at, score: score ?? null, max, passed: row.exam === 'jlpt' ? (r.passed ?? null) : null };
    })
    .filter((row) => row.score !== null)
    .slice(0, RECENT_EXAMS);
}

/**
 * The learner's goal, in the terms of the language they study
 */
function goalOf(user: User, language: StudyLanguage) {
  if (language === 'ja') {
    return { kind: user.jaTargetLevel ? ('jlpt' as const) : ('none' as const), targetScore: null, targetLevel: user.jaTargetLevel, currentLevel: null };
  }
  const targetLevel = targetCefr(user.targetExam === 'jlpt' ? 'none' : user.targetExam, user.targetScore, user.cefrLevel);
  const kind = user.targetExam === 'toeic' || user.targetExam === 'ielts' ? user.targetExam : user.cefrLevel ? ('cefr' as const) : ('none' as const);
  return { kind, targetScore: user.targetScore, targetLevel, currentLevel: user.cefrLevel };
}

/**
 * Everything the progress page shows
 */
export async function buildJourney(user: User, language: StudyLanguage = user.studyLanguage) {
  const goal = goalOf(user, language);
  const order: readonly string[] = language === 'en' ? CEFR_ORDER : JLPT_ORDER;
  const covered = levelsUpTo(order, goal.targetLevel);
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const today = quotaDay();
  const historyStart = quotaDay(new Date(Date.now() - HISTORY_DAYS * DAY_MS));
  const weekStart = new Date(`${today}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const [levels, grammar, exams, history, newWords, practisedWeek, studyDays, dueWords, mistakes] = await Promise.all([
    vocabByLevel(user.id, language),
    language === 'en' ? grammarState(user.id) : Promise.resolve(null),
    examScores(user.id, language),
    db
      .select({ day: progressSnapshots.day, data: progressSnapshots.data })
      .from(progressSnapshots)
      .where(and(eq(progressSnapshots.userId, user.id), eq(progressSnapshots.language, language), gte(progressSnapshots.day, historyStart)))
      .orderBy(asc(progressSnapshots.day)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(and(eq(srsCards.userId, user.id), eq(vocabItems.language, language), gte(srsCards.introducedAt, weekAgo))),
    language === 'en'
      ? db.select({ n: sql<number>`count(*)::int` }).from(grammarProgress).where(and(eq(grammarProgress.userId, user.id), gte(grammarProgress.practicedAt, weekAgo)))
      : Promise.resolve([{ n: 0 }]),
    db
      .selectDistinct({ day: attempts.day })
      .from(attempts)
      .where(and(eq(attempts.userId, user.id), eq(attempts.language, language), gte(attempts.day, weekStart.toISOString().slice(0, 10)))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(and(eq(srsCards.userId, user.id), eq(vocabItems.language, language), lte(srsCards.dueAt, new Date()))),
    language === 'en' ? recentMistakes(user.id) : Promise.resolve([]),
  ]);

  // Coverage of the levels up to the goal
  const inScope = levels.filter((l) => covered.includes(l.level));
  const vocabGoal = sum(inScope);
  const grammarScope = grammar ? GRAMMAR_POINTS.filter((p) => covered.includes(p.cefr)) : [];
  const grammarGoal = {
    total: grammarScope.length,
    seen: grammarScope.filter((p) => grammar?.rows.has(p.id)).length,
    mastered: grammarScope.filter((p) => grammar?.rows.get(p.id)?.mastery === 'mastered').length,
    good: grammarScope.filter((p) => ['good', 'mastered'].includes(grammar?.rows.get(p.id)?.mastery ?? '')).length,
  };

  // What to do next, most useful first
  const steps: PathStep[] = [];
  if (dueWords[0].n > 0) steps.push({ type: 'review-words', count: dueWords[0].n });
  if (grammar && grammar.due > 0) steps.push({ type: 'review-grammar', count: grammar.due });
  const urgent = mistakes.find((m) => m.urgent);
  if (urgent) steps.push({ type: 'fix-mistakes', pointId: urgent.pointId, count: urgent.count });
  const gap = covered.map((level) => ({ level, ...sum(levels.filter((l) => l.level === level)) })).find((l) => l.total > 0 && l.seen < l.total);
  if (gap) steps.push({ type: 'learn-words', level: gap.level, remaining: gap.total - gap.seen });
  const nextPoint = grammarScope.find((p) => !grammar?.rows.has(p.id));
  if (nextPoint) steps.push({ type: 'learn-grammar', pointId: nextPoint.id, level: nextPoint.cefr });

  return {
    language,
    goal,
    /** Levels counted towards the goal */
    covered,
    vocab: { levels, totals: sum(levels), goal: vocabGoal },
    grammar: grammar && {
      total: grammar.total,
      counts: grammar.counts,
      clusters: grammar.clusters,
      due: grammar.due,
      goal: grammarGoal,
      weak: mistakes.slice(0, 5).map((m) => ({ pointId: m.pointId, count: m.count, urgent: m.urgent })),
    },
    exams,
    week: { newWords: newWords[0].n, grammarPractised: practisedWeek[0].n, studyDays: studyDays.length },
    steps: steps.slice(0, MAX_STEPS),
    history: history.map((h) => ({ day: h.day, ...(h.data as SnapshotCounts) })),
  };
}
