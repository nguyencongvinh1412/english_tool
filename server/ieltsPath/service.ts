/**
 * IELTS Path: create and read a learner's path, and run its gates. Each skill of a gate is an ordinary IELTS exam
 * session (mode "gate") built from the gate's fixed groups, so the usual test screens, timers, audio and AI grading
 * are reused. A gate is finished once every required skill has a band; Gate 0 then sets the starting phase.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { ieltsPaths, type IeltsPath } from '../db/schema.js';
import { buildPathPlan, endPhaseFor, overallOf, type Bands } from './bands.js';
import { clearedGate, gateHistory, gateView, nextGate } from './gates.js';

export interface PathInput {
  bandTargets: Bands;
  examDate: string | null;
  dailyMinutes: number;
  restDays: number[];
}

/** The learner's active path, if any */
export async function activePath(userId: string): Promise<IeltsPath | null> {
  const [row] = await db
    .select()
    .from(ieltsPaths)
    .where(and(eq(ieltsPaths.userId, userId), eq(ieltsPaths.status, 'active')))
    .orderBy(desc(ieltsPaths.createdAt))
    .limit(1);
  return row ?? null;
}

/** Creates a path (archiving the previous one) */
export async function createPath(userId: string, input: PathInput): Promise<IeltsPath> {
  return db.transaction(async (tx) => {
    await tx.update(ieltsPaths).set({ status: 'archived', updatedAt: new Date() }).where(and(eq(ieltsPaths.userId, userId), eq(ieltsPaths.status, 'active')));
    const [row] = await tx
      .insert(ieltsPaths)
      .values({ userId, bandTargets: input.bandTargets, examDate: input.examDate, dailyMinutes: input.dailyMinutes, restDays: input.restDays, endPhase: endPhaseFor(input.bandTargets) })
      .returning();
    return row;
  });
}

/** Changes the exam date, daily minutes or rest days of the active path */
export async function updatePath(path: IeltsPath, change: Partial<Pick<PathInput, 'examDate' | 'dailyMinutes' | 'restDays'>>): Promise<IeltsPath> {
  const [row] = await db.update(ieltsPaths).set({ ...change, updatedAt: new Date() }).where(eq(ieltsPaths.id, path.id)).returning();
  return row;
}

export async function archivePath(path: IeltsPath): Promise<void> {
  await db.update(ieltsPaths).set({ status: 'archived', updatedAt: new Date() }).where(eq(ieltsPaths.id, path.id));
}

/* ---------- Path view ---------- */

export async function pathView(path: IeltsPath) {
  const gate0 = await gateView(path, 0);
  // Gate 0 may have just finished: read the path again for its starting phase
  const fresh = gate0.status === 'finished' && path.startPhase === null ? ((await activePath(path.userId)) ?? path) : path;
  const targets = fresh.bandTargets as Bands;
  const plan =
    fresh.startPhase !== null && fresh.startDate
      ? buildPathPlan({
          startPhase: fresh.startPhase,
          endPhase: fresh.endPhase,
          dailyMinutes: fresh.dailyMinutes,
          restDays: fresh.restDays as number[],
          startDate: fresh.startDate,
          examDate: fresh.examDate,
          measuredAll: gate0.bands?.writing != null && gate0.bands?.speaking != null,
        })
      : null;
  const next = fresh.startPhase !== null ? await nextGate(fresh) : null;
  // The gate before stays on the screen while something about it is waiting: a retest, or a decision
  const cleared = fresh.startPhase !== null ? await clearedGate(fresh) : null;
  let previous = null;
  if (cleared !== null && cleared >= 1 && cleared >= (fresh.startPhase ?? 1)) {
    const earlier = await gateView(fresh, cleared);
    const retestWaiting = earlier.retest !== null && earlier.retest.status !== 'done';
    const decisionWaiting = earlier.decision !== null && earlier.decision.choice === null;
    if (retestWaiting || decisionWaiting) previous = earlier;
  }
  return {
    id: fresh.id,
    bandTargets: targets,
    overallTarget: overallOf(targets),
    examDate: fresh.examDate,
    dailyMinutes: fresh.dailyMinutes,
    restDays: fresh.restDays as number[],
    startPhase: fresh.startPhase,
    endPhase: fresh.endPhase,
    startDate: fresh.startDate,
    gate0,
    plan,
    /** The gate the learner works towards (null before Gate 0 is finished; beyond the end phase when all are cleared) */
    nextGate: next,
    cleared,
    /** The gate just cleared, while its retest or decision is waiting */
    previous,
    /** The open gate (1-6) with its skills, result, retest and decision */
    gate: next !== null && next >= 1 && next <= 6 && next <= fresh.endPhase ? await gateView(fresh, next) : null,
    history: await gateHistory(fresh),
  };
}
