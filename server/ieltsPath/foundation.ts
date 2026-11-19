/**
 * Steps put into a queue that is already running (docs/plans/foundation-boost.md, F2 and F4):
 *
 *  - Lessons the syllabus has now but the learner's queue does not (the syllabus was changed after the phase was
 *    stored): each goes in front of the next practice of its skill.
 *  - The foundation pack, for a learner who started in phase 2 or later with a Writing or Speaking band of 4.5 or less
 *    at Gate 0. The start phase is chosen from bands alone, so the phase 1 basics were skipped; the pack brings back
 *    the grammar their writing needs and the four Writing and Speaking lessons of phase 1. One grammar step a day is
 *    put after the day's own grammar step, and one lesson in front of each of the next practices of its skill.
 *
 * Only steps still to do are used as places to insert, so nothing lands in the past of the queue, and a step that is
 * already in the queue is never added again: running this on every visit changes nothing once it is done.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { gateAttempts, grammarProgress, ieltsPaths, pathLessons, type IeltsPath, type PathLesson } from '../db/schema.js';
import { type PathSkill } from './bands.js';
import { lessonMeta, phaseSteps, WRITTEN_PHASES, type Block } from './syllabus.js';

/**
 * Grammar of the foundation pack, most useful first: the mistakes of an A2-B1 writer in IELTS Task 1 and 2
 * (agreement, articles, the basic tenses) and the phase 1 points that phases 2 and 3 do not come back to.
 * Agreement and the zero article are pulled forward: the syllabus reaches them in weeks 8 and 12.
 */
export const FOUNDATION_GRAMMAR = [
  'subject-verb-agreement',
  'zero-article',
  'article-the',
  'articles-a-an',
  'present-simple',
  'quantifiers',
  'prepositions-time',
  'there-is-are',
  'adverbs-frequency',
  'zero-conditional',
  'first-conditional',
  'future-will',
  'future-going-to',
] as const;

/** The phase 1 lessons of Writing and Speaking that the pack brings back, in order */
export const FOUNDATION_LESSONS: Partial<Record<Block, string[]>> = {
  writing: ['ip-w-paragraph', 'ip-w-chart-sentences'],
  speaking: ['ip-s-part1-basics', 'ip-s-part1-develop'],
};

/** The pack is for a Writing or Speaking band of at most this at Gate 0 */
export const FOUNDATION_MAX_BAND = 4.5;
const FOUNDATION_GRAMMAR_MINUTES = 20;

/** Whether the learner gets the foundation pack: started after phase 1 with weak Writing or Speaking at Gate 0 */
export function needsFoundation(startPhase: number | null, bands: Partial<Record<PathSkill, number | null>> | null): boolean {
  if (startPhase === null || startPhase < 2 || !bands) return false;
  return [bands.writing, bands.speaking].some((band) => typeof band === 'number' && band <= FOUNDATION_MAX_BAND);
}

type Row = Pick<PathLesson, 'id' | 'seq' | 'phase' | 'week' | 'studyDay' | 'block' | 'kind' | 'status' | 'ref' | 'plannedDay'>;

export interface Insert {
  /** The row to put the new one next to */
  anchorId: string;
  position: 'before' | 'after';
  step: { phase: number; week: number; studyDay: number; block: PathLesson['block']; kind: PathLesson['kind']; ref: Record<string, unknown>; minutes: number; plannedDay: string };
}

const refOf = (row: Row) => row.ref as { lessonId?: string; pointId?: string; foundation?: boolean; adaptive?: string; remedial?: unknown; buffer?: unknown };

/**
 * What to put into the queue. Pure: `rows` are the stored steps, `foundation` says whether the pack applies and
 * `practised` are the grammar points the learner has already practised
 */
export function planInserts(rows: Row[], options: { foundation: boolean; practised: Set<string> }): Insert[] {
  const ordered = [...rows].sort((a, b) => a.seq - b.seq);
  const todo = ordered.filter((r) => r.status === 'todo');
  const inserts: Insert[] = [];
  const have = new Set(ordered.map((r) => refOf(r).lessonId).filter((id): id is string => Boolean(id)));
  const usedAnchors = new Set<string>();

  /** A lesson goes in front of the next practice of its skill that no other lesson is in front of */
  const lessonInsert = (lessonId: string): Insert | null => {
    const meta = lessonMeta(lessonId);
    if (!meta || have.has(lessonId)) return null;
    const anchor = todo.find((r) => r.kind === 'practice' && r.block === meta.block && !usedAnchors.has(r.id));
    if (!anchor) return null;
    usedAnchors.add(anchor.id);
    have.add(lessonId);
    return {
      anchorId: anchor.id,
      position: 'before',
      step: { phase: anchor.phase, week: anchor.week, studyDay: anchor.studyDay, block: meta.block, kind: 'lesson', ref: { lessonId }, minutes: meta.minutes, plannedDay: anchor.plannedDay },
    };
  };

  // Lessons of the phases already stored that the queue lacks
  const stored = new Set(ordered.filter((r) => !refOf(r).remedial && !refOf(r).buffer).map((r) => r.phase));
  for (const phase of WRITTEN_PHASES.filter((p) => stored.has(p))) {
    for (const step of phaseSteps(phase)) {
      if (step.kind !== 'lesson') continue;
      const insert = lessonInsert((step.ref as { lessonId: string }).lessonId);
      if (insert) inserts.push(insert);
    }
  }

  if (options.foundation) {
    for (const lessons of Object.values(FOUNDATION_LESSONS)) {
      for (const lessonId of lessons ?? []) {
        const insert = lessonInsert(lessonId);
        if (insert) inserts.push(insert);
      }
    }
    // One grammar step a day, after the grammar step of a day still to come
    const queued = new Set(ordered.filter((r) => refOf(r).foundation).map((r) => refOf(r).pointId));
    const points = FOUNDATION_GRAMMAR.filter((id) => !options.practised.has(id) && !queued.has(id));
    const hosts = todo.filter((r) => r.kind === 'grammar' && !refOf(r).foundation && !refOf(r).adaptive);
    points.slice(0, hosts.length).forEach((pointId, i) => {
      const host = hosts[i];
      inserts.push({
        anchorId: host.id,
        position: 'after',
        step: { phase: host.phase, week: host.week, studyDay: host.studyDay, block: 'vocab-grammar', kind: 'grammar', ref: { pointId, foundation: true }, minutes: FOUNDATION_GRAMMAR_MINUTES, plannedDay: host.plannedDay },
      });
    });
  }
  return inserts;
}

/** The rows in their new order: each insert next to its anchor (ids of new rows are null) */
export function applyOrder<T extends { id: string }>(rows: T[], inserts: Insert[]): (T | Insert)[] {
  const before = new Map<string, Insert[]>();
  const after = new Map<string, Insert[]>();
  for (const insert of inserts) {
    const map = insert.position === 'before' ? before : after;
    map.set(insert.anchorId, [...(map.get(insert.anchorId) ?? []), insert]);
  }
  return rows.flatMap((row) => [...(before.get(row.id) ?? []), row, ...(after.get(row.id) ?? [])]);
}

/** The Gate 0 bands of the path, when Gate 0 has some */
async function gate0Bands(path: IeltsPath): Promise<Partial<Record<PathSkill, number | null>> | null> {
  const [row] = await db
    .select({ bands: gateAttempts.bands })
    .from(gateAttempts)
    .where(and(eq(gateAttempts.pathId, path.id), eq(gateAttempts.gate, 0)))
    .orderBy(desc(gateAttempts.id))
    .limit(1);
  return (row?.bands as Partial<Record<PathSkill, number | null>> | null) ?? null;
}

/**
 * Puts the missing lessons and, when it applies, the foundation pack into the learner's queue
 * @returns Steps added
 */
export async function ensureFoundation(path: IeltsPath): Promise<number> {
  if (path.startPhase === null) return 0;
  const foundation = needsFoundation(path.startPhase, await gate0Bands(path));
  const practised = foundation
    ? new Set((await db.select({ pointId: grammarProgress.pointId }).from(grammarProgress).where(eq(grammarProgress.userId, path.userId))).map((r) => r.pointId))
    : new Set<string>();

  const plan = async (read: Pick<typeof db, 'select'>): Promise<{ rows: PathLesson[]; inserts: Insert[] }> => {
    const rows = await read.select().from(pathLessons).where(eq(pathLessons.pathId, path.id)).orderBy(asc(pathLessons.seq));
    return { rows, inserts: planInserts(rows, { foundation, practised }) };
  };
  if ((await plan(db)).inserts.length === 0) return 0;

  return db.transaction(async (tx) => {
    // Two visits at once must not both insert: the second one plans again after the first is done
    await tx.select({ id: ieltsPaths.id }).from(ieltsPaths).where(eq(ieltsPaths.id, path.id)).for('update');
    const { rows, inserts } = await plan(tx);
    if (inserts.length === 0) return 0;
    const order = applyOrder(rows, inserts);
    // Move every step out of the way, then give each its place (the order of a queue is unique)
    await tx.update(pathLessons).set({ seq: sql`${pathLessons.seq} + 10000000` }).where(eq(pathLessons.pathId, path.id));
    const newRows: (typeof pathLessons.$inferInsert)[] = [];
    for (const [seq, entry] of order.entries()) {
      if ('anchorId' in entry) {
        newRows.push({ pathId: path.id, userId: path.userId, seq, phase: entry.step.phase, week: entry.step.week, studyDay: entry.step.studyDay, block: entry.step.block, kind: entry.step.kind, ref: entry.step.ref, core: true, minutes: entry.step.minutes, plannedDay: entry.step.plannedDay });
      } else {
        await tx.update(pathLessons).set({ seq }).where(eq(pathLessons.id, entry.id));
      }
    }
    for (let k = 0; k < newRows.length; k += 100) await tx.insert(pathLessons).values(newRows.slice(k, k + 100));
    return inserts.length;
  });
}
