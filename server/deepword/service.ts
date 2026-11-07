/**
 * Deep Word service: settings, the words a learner studies today, the queue and progress shapes sent to the client.
 */
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deepWordAttempts, deepWordPrefs, deepWordProgress, deepWordQueue, srsCards, vocabItems, wordBank, type DeepWordProgress, type User, type VocabItem } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { toPublicItem } from '../vocab/data.js';
import { computeStage, type Cells, type Evidence } from './stage.js';

/** Exercises where the learner produces the word; correct, unaided ones on separate days make a production cell "done" */
const PRODUCTION_KINDS = ['sentence', 'speak', 'paragraph', 'scenario', 'review-fix', 'review-cloze', 'review-recall'];

export const MAX_PER_DAY = 2;
/** Words in one review session; a longer backlog is split into short sessions */
export const REVIEW_SESSION = 5;
/** The queue is topped up to this many words */
export const QUEUE_TARGET = 4;
/** "Later" on the production stage is offered this many times; after that the word waits at "understood" */
export const MAX_DEFERRALS = 2;

export interface Profile {
  work?: string;
  interests?: string[];
  situations?: string[];
}

export interface Prefs {
  enabled: boolean;
  perDay: number;
  profile: Profile;
  profileSkipped: boolean;
}

export const DEFAULT_PREFS: Prefs = { enabled: false, perDay: 1, profile: {}, profileSkipped: false };

export async function prefsOf(userId: string): Promise<Prefs> {
  const [row] = await db.select().from(deepWordPrefs).where(eq(deepWordPrefs.userId, userId)).limit(1);
  if (!row) return DEFAULT_PREFS;
  return { enabled: row.enabled, perDay: row.perDay, profile: row.profile as Profile, profileSkipped: row.profileSkipped };
}

export const publicWord = (item: VocabItem) => toPublicItem(item);

export const cellsOf = (row: Pick<DeepWordProgress, 'formR' | 'formP' | 'meaningR' | 'meaningP' | 'useR' | 'useP'>): Cells => ({
  formR: row.formR as Cells['formR'],
  formP: row.formP as Cells['formP'],
  meaningR: row.meaningR as Cells['meaningR'],
  meaningP: row.meaningP as Cells['meaningP'],
  useR: row.useR as Cells['useR'],
  useP: row.useP as Cells['useP'],
});

export function progressDto(row: DeepWordProgress) {
  return {
    cells: cellsOf(row),
    stage: row.stage,
    sessionStage: row.sessionStage,
    sessionData: row.sessionData as Record<string, unknown>,
    completed: row.completedAt !== null,
    deferredCount: row.deferredCount,
    deferralsLeft: Math.max(0, MAX_DEFERRALS - row.deferredCount),
    note: row.note,
    nextReviewAt: row.nextReviewAt,
    reviewStep: row.reviewStep,
    startedAt: row.startedAt,
  };
}

/** Correct, unaided sentences of a learner on a word, and the different days they were written */
export async function evidenceOf(userId: string, itemId: string, extraPass = false): Promise<Evidence> {
  const [row] = await db
    .select({
      passes: sql<number>`count(*)::int`,
      days: sql<number>`count(distinct (${deepWordAttempts.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date)::int`,
    })
    .from(deepWordAttempts)
    .where(and(eq(deepWordAttempts.userId, userId), eq(deepWordAttempts.itemId, itemId), inArray(deepWordAttempts.kind, PRODUCTION_KINDS), eq(deepWordAttempts.result, 'pass'), eq(deepWordAttempts.assisted, false)));
  const today = extraPass
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(deepWordAttempts)
        .where(
          and(
            eq(deepWordAttempts.userId, userId),
            eq(deepWordAttempts.itemId, itemId),
            inArray(deepWordAttempts.kind, PRODUCTION_KINDS),
            eq(deepWordAttempts.result, 'pass'),
            eq(deepWordAttempts.assisted, false),
            sql`(${deepWordAttempts.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date = ${quotaDay()}::date`
          )
        )
    : null;
  // `extraPass` counts the sentence being judged (not saved yet) as one more pass, on a new day only when none was written today
  return {
    unaidedPasses: (row?.passes ?? 0) + (extraPass ? 1 : 0),
    passDays: (row?.days ?? 0) + (extraPass && (today?.[0]?.n ?? 0) === 0 ? 1 : 0),
  };
}

export const stageOf = (cells: Cells, evidence: Evidence) => computeStage(cells, evidence);

export async function startedToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deepWordProgress)
    .where(and(eq(deepWordProgress.userId, userId), eq(deepWordProgress.startedDay, quotaDay())));
  return row?.n ?? 0;
}

/**
 * Adds words to the queue until it has QUEUE_TARGET: words the learner saved, then words they struggled with, then
 * the next words of their level that they have not met.
 */
export async function fillQueue(user: User): Promise<void> {
  const [queued, started] = await Promise.all([
    db.select({ id: deepWordQueue.itemId }).from(deepWordQueue).where(eq(deepWordQueue.userId, user.id)),
    db.select({ id: deepWordProgress.itemId }).from(deepWordProgress).where(eq(deepWordProgress.userId, user.id)),
  ]);
  const taken = new Set([...queued, ...started].map((r) => r.id));
  let need = QUEUE_TARGET - queued.length;
  if (need <= 0) return;

  const add = async (ids: string[], source: 'bank' | 'suggest') => {
    const fresh = ids.filter((id) => !taken.has(id)).slice(0, need);
    if (fresh.length === 0) return;
    await db.insert(deepWordQueue).values(fresh.map((itemId) => ({ userId: user.id, itemId, source }))).onConflictDoNothing();
    for (const id of fresh) taken.add(id);
    need -= fresh.length;
  };

  const saved = await db.select({ id: wordBank.itemId }).from(wordBank).innerJoin(vocabItems, eq(vocabItems.id, wordBank.itemId)).where(and(eq(wordBank.userId, user.id), eq(vocabItems.language, 'en'))).orderBy(desc(wordBank.createdAt)).limit(20);
  await add(saved.map((r) => r.id), 'bank');
  if (need <= 0) return;

  const hard = await db.select({ id: srsCards.itemId }).from(srsCards).innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId)).where(and(eq(srsCards.userId, user.id), eq(vocabItems.language, 'en'))).orderBy(desc(srsCards.lapses), desc(srsCards.reps)).limit(20);
  await add(hard.map((r) => r.id), 'suggest');
  if (need <= 0) return;

  const level = user.cefrLevel && /^[ABC][12]$/.test(user.cefrLevel) ? user.cefrLevel : 'B1';
  const byLevel = await db.select({ id: vocabItems.id }).from(vocabItems).where(and(eq(vocabItems.language, 'en'), eq(vocabItems.level, level))).orderBy(asc(vocabItems.position)).limit(60);
  await add(byLevel.map((r) => r.id), 'suggest');
}

export async function queueWords(userId: string) {
  const rows = await db
    .select({ item: vocabItems, source: deepWordQueue.source })
    .from(deepWordQueue)
    .innerJoin(vocabItems, eq(vocabItems.id, deepWordQueue.itemId))
    .where(eq(deepWordQueue.userId, userId))
    .orderBy(asc(deepWordQueue.addedAt));
  return rows.map(({ item, source }) => ({ ...publicWord(item), source }));
}

export type TodayState = 'off' | 'ready' | 'resume' | 'done' | 'empty';

/**
 * The word a learner studies now: one they left half-way, else the next in the queue while today's limit allows
 */
export async function todaysWord(user: User, prefs: Prefs): Promise<{ state: TodayState; word: ReturnType<typeof publicWord> | null; sessionStage?: number }> {
  if (!prefs.enabled) return { state: 'off', word: null };

  const [open] = await db
    .select({ item: vocabItems, progress: deepWordProgress })
    .from(deepWordProgress)
    .innerJoin(vocabItems, eq(vocabItems.id, deepWordProgress.itemId))
    .where(and(eq(deepWordProgress.userId, user.id), isNull(deepWordProgress.completedAt)))
    .orderBy(desc(deepWordProgress.updatedAt))
    .limit(1);
  if (open) return { state: 'resume', word: publicWord(open.item), sessionStage: open.progress.sessionStage };

  if ((await startedToday(user.id)) >= prefs.perDay) return { state: 'done', word: null };

  await fillQueue(user);
  const [next] = await db
    .select({ item: vocabItems })
    .from(deepWordQueue)
    .innerJoin(vocabItems, eq(vocabItems.id, deepWordQueue.itemId))
    .where(eq(deepWordQueue.userId, user.id))
    .orderBy(asc(deepWordQueue.addedAt))
    .limit(1);
  return next ? { state: 'ready', word: publicWord(next.item) } : { state: 'empty', word: null };
}

/** Level counts for the overview: how many words sit at each of the 5 stages */
export async function stageCounts(userId: string): Promise<number[]> {
  const rows = await db
    .select({ stage: deepWordProgress.stage, n: sql<number>`count(*)::int` })
    .from(deepWordProgress)
    .where(and(eq(deepWordProgress.userId, userId), sql`${deepWordProgress.completedAt} is not null or ${deepWordProgress.stage} > 1`))
    .groupBy(deepWordProgress.stage);
  const counts = [0, 0, 0, 0, 0];
  for (const r of rows) counts[r.stage - 1] = r.n;
  return counts;
}

/** Words whose session the learner finished today (quota day) */
export async function completedToday(userId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: deepWordProgress.itemId, term: vocabItems.term })
    .from(deepWordProgress)
    .innerJoin(vocabItems, eq(vocabItems.id, deepWordProgress.itemId))
    .where(and(eq(deepWordProgress.userId, userId), sql`(${deepWordProgress.completedAt} at time zone 'Asia/Ho_Chi_Minh')::date = ${quotaDay()}::date`));
  return new Map(rows.map((r) => [r.id, r.term]));
}

/** Studied words that are due for review, oldest first */
export async function dueWords(userId: string, now = new Date()) {
  return db
    .select({ item: vocabItems, progress: deepWordProgress })
    .from(deepWordProgress)
    .innerJoin(vocabItems, eq(vocabItems.id, deepWordProgress.itemId))
    .where(and(eq(deepWordProgress.userId, userId), lte(deepWordProgress.nextReviewAt, now), sql`${deepWordProgress.completedAt} is not null`))
    .orderBy(asc(deepWordProgress.nextReviewAt));
}

/** Minutes a review of this many words takes (about two each, at most ten) */
export const reviewMinutes = (count: number) => Math.min(10, Math.max(3, count * 2));

/** True when the learner has not reviewed for a week or more while words wait: the overview offers a gentler return */
export async function awayFromReviews(userId: string, due: number): Promise<boolean> {
  if (due === 0) return false;
  const [row] = await db
    .select({ last: sql<Date | null>`max(${deepWordProgress.lastReviewedAt})` })
    .from(deepWordProgress)
    .where(eq(deepWordProgress.userId, userId));
  const last = row?.last ? new Date(row.last).getTime() : null;
  return last !== null && Date.now() - last >= 7 * 86_400_000;
}

/** Words reviewed today (quota day) */
export async function reviewedToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deepWordProgress)
    .where(and(eq(deepWordProgress.userId, userId), sql`(${deepWordProgress.lastReviewedAt} at time zone 'Asia/Ho_Chi_Minh')::date = ${quotaDay()}::date`));
  return row?.n ?? 0;
}

/** Failed reviews at which a word counts as one the learner keeps forgetting */
export const LAPSE_LIMIT = 3;

/** Failed reviews per word */
export async function lapsesOf(userId: string, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: deepWordAttempts.itemId, n: sql<number>`count(*)::int` })
    .from(deepWordAttempts)
    .where(and(eq(deepWordAttempts.userId, userId), inArray(deepWordAttempts.itemId, ids), sql`${deepWordAttempts.kind} like 'review-%'`, eq(deepWordAttempts.result, 'fail')))
    .groupBy(deepWordAttempts.itemId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** Words the learner keeps failing in reviews, worst first (at most `limit`) */
export async function forgetfulWords(userId: string, limit = 3) {
  const rows = await db
    .select({ item: vocabItems, lapses: sql<number>`count(*)::int` })
    .from(deepWordAttempts)
    .innerJoin(vocabItems, eq(vocabItems.id, deepWordAttempts.itemId))
    .innerJoin(deepWordProgress, and(eq(deepWordProgress.userId, deepWordAttempts.userId), eq(deepWordProgress.itemId, deepWordAttempts.itemId)))
    .where(and(eq(deepWordAttempts.userId, userId), sql`${deepWordAttempts.kind} like 'review-%'`, eq(deepWordAttempts.result, 'fail'), sql`${deepWordProgress.completedAt} is not null`))
    .groupBy(vocabItems.id)
    .having(sql`count(*) >= ${LAPSE_LIMIT}`)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r) => ({ ...publicWord(r.item), lapses: r.lapses }));
}
