/**
 * Grammar drill: a practice set the learner builds from the points (and uses of them) they pick,
 * with a size of their choice. Questions are generated and checked like a point's practice, stored
 * for the learner alone, and scored per point so each point's review schedule follows its own result.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems, grammarMistakes, grammarPoints, type User } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import { recordAttempt } from '../services/progress.js';
import { generateItems, masteryOf, applyPointScore, normalizeAnswer, type PracticeItem } from './practice.js';
import { GRAMMAR_POINTS } from './map.js';
import type { GrammarContent } from './content.js';

export const DRILL_KIND = 'grammar-drill';
export const DRILL_COUNTS = [10, 20, 30] as const;
export const MAX_DRILL_TARGETS = 6;
export const MIN_PER_TARGET = 3;
/** Questions asked from the AI in one go; longer lists are split so a reply is never cut off */
const MAX_BATCH = 15;
/** Share of a batch the solver may disagree with before the batch is asked again */
const MAX_DROPPED_SHARE = 0.3;

export interface DrillTarget {
  pointId: string;
  /** Indexes into the point's uses; empty or missing covers the whole point */
  uses?: number[];
}
export type DrillItem = PracticeItem & { pointId: string };

/**
 * Shares `count` questions over `targets` points as evenly as possible (earlier points get the rest)
 * @throws HttpError 400 if a point would get fewer than MIN_PER_TARGET questions
 */
export function splitCount(count: number, targets: number): number[] {
  if (targets < 1 || count < targets * MIN_PER_TARGET) {
    throw new HttpError(400, `Choose fewer points or more questions: each point needs at least ${MIN_PER_TARGET} questions.`, 'invalid_drill');
  }
  const base = Math.floor(count / targets);
  const extra = count % targets;
  return Array.from({ length: targets }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Splits `size` into batches of at most MAX_BATCH, as equal as possible */
export function batchSizes(size: number): number[] {
  const batches = Math.ceil(size / MAX_BATCH);
  return splitCount(size, batches);
}

const keyOf = (item: PracticeItem) => normalizeAnswer(item.prompt);

/**
 * Generates and stores a drill
 * @throws HttpError 400 for unknown or repeated points or a size that does not fit, 502 if questions fail the check
 */
export async function generateDrill(user: User, targets: DrillTarget[], count: number, model?: string): Promise<{ id: string; items: DrillItem[] }> {
  const ids = targets.map((t) => t.pointId);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Each point can be chosen once.', 'invalid_drill');
  const metas = targets.map((t) => {
    const meta = GRAMMAR_POINTS.find((p) => p.id === t.pointId);
    if (!meta) throw new HttpError(404, 'Grammar point not found.', 'not_found');
    return meta;
  });
  const shares = splitCount(count, targets.length);

  const rows = await db.select({ id: grammarPoints.id, content: grammarPoints.content }).from(grammarPoints).where(inArray(grammarPoints.id, ids));
  const contentOf = new Map(rows.map((r) => [r.id, r.content as GrammarContent | null]));

  const jobs = targets.flatMap((target, i) => {
    const uses = contentOf.get(target.pointId)?.uses ?? [];
    const focus = (target.uses ?? []).flatMap((index) => (uses[index] ? [uses[index].title.en] : []));
    return batchSizes(shares[i]).map((size) => ({ meta: metas[i], focus, size }));
  });

  const batches = await Promise.all(jobs.map((job) => generateItems(user, job.meta, job.size, job.focus, Math.floor(job.size * MAX_DROPPED_SHARE), model).then((items) => items.map((item): DrillItem => ({ ...item, pointId: job.meta.id })))));

  // Parallel batches of one point can repeat a sentence
  const seen = new Set<string>();
  const items = batches.flat().filter((item) => {
    const key = `${item.pointId}:${keyOf(item)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (items.length < ids.length * 2) throw new HttpError(502, 'Generated questions failed the answer check. Please try again.', 'ai_invalid_output');

  const [saved] = await db
    .insert(contentItems)
    .values({
      kind: DRILL_KIND,
      skill: 'reading',
      language: 'en',
      title: `Grammar drill: ${metas.map((m) => m.title.en).join(', ')}`.slice(0, 200),
      payload: { items, targets },
      source: 'ai',
      createdBy: user.id,
    })
    .returning({ id: contentItems.id });
  return { id: saved.id, items };
}

export interface DrillAnswer {
  correct: boolean;
  /** What the learner chose or typed, kept with a mistake */
  given?: string;
}

export interface DrillPointResult {
  pointId: string;
  correct: number;
  total: number;
  mastery: ReturnType<typeof masteryOf>;
  dueAt: Date;
  lastScore: number;
}

/**
 * Scores a finished drill: each point's review schedule moves by its own share of right answers,
 * wrong answers are kept as mistakes and one attempt earns XP for the whole drill
 * @throws HttpError 404 if the drill is not the learner's, 400 if the answers do not match its questions
 */
export async function gradeDrill(user: User, drillId: string, answers: DrillAnswer[], durationSec?: number) {
  const [drill] = await db
    .select({ payload: contentItems.payload, title: contentItems.title })
    .from(contentItems)
    .where(and(eq(contentItems.id, drillId), eq(contentItems.kind, DRILL_KIND), eq(contentItems.createdBy, user.id)));
  if (!drill) throw new HttpError(404, 'Drill not found.', 'not_found');
  const { items } = drill.payload as { items: DrillItem[] };
  if (answers.length !== items.length) throw new HttpError(400, 'Send one answer for every question.', 'invalid_drill');

  const tally = new Map<string, { correct: number; total: number }>();
  const wrong: (typeof grammarMistakes.$inferInsert)[] = [];
  items.forEach((item, i) => {
    const entry = tally.get(item.pointId) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (answers[i].correct) entry.correct += 1;
    else {
      wrong.push({
        userId: user.id,
        pointId: item.pointId,
        source: 'drill',
        wrong: (answers[i].given ?? '').slice(0, 300) || null,
        right: (item.type === 'gap' ? item.answers[0] : item.options[item.answerIndex]).slice(0, 300),
      });
    }
    tally.set(item.pointId, entry);
  });

  const points: DrillPointResult[] = [];
  for (const [pointId, { correct, total }] of tally) {
    const score = correct / total;
    const next = await applyPointScore(user.id, pointId, score);
    points.push({ pointId, correct, total, mastery: masteryOf(next.intervalDays), dueAt: next.dueAt, lastScore: score });
  }
  if (wrong.length > 0) await db.insert(grammarMistakes).values(wrong);

  const correct = answers.filter((a) => a.correct).length;
  const { xpEarned } = await recordAttempt(user.id, { activity: 'grammar', contentRef: drillId, title: drill.title, score: correct, maxScore: items.length, durationSec });
  return { points, xpEarned };
}
