import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { closeDb, db, runMigrations } from '../db/client.js';
import { examSessions, ieltsPaths, pathLessons, type IeltsPath, type PathLesson } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb } from '../test/helpers.js';
import { adaptSteps } from './adapt.js';
import { gateTarget } from './bands.js';
import { weakestSkill } from './errorRules.js';
import { ensureSteps } from './today.js';

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

const target = (skill: Parameters<typeof gateTarget>[1]) => gateTarget(6, skill);

describe('the weakest skill', () => {
  it('is the one furthest below its own Gate 6 target, and Writing or Speaking win a tie', () => {
    expect(weakestSkill({ listening: 6.5, reading: 7, writing: 5.5, speaking: 6 }, target)).toEqual({ skill: 'writing', gap: 1 });
    expect(weakestSkill({ listening: 6.5, reading: 7, writing: 6, speaking: 6.5 }, target)).toEqual({ skill: 'writing', gap: 0.5 });
    // Reading 6.0 against 7.0 is further away than Speaking 6.0 against 6.5
    expect(weakestSkill({ listening: 7, reading: 6, writing: 6.5, speaking: 6 }, target)).toEqual({ skill: 'reading', gap: 1 });
  });

  it('is nobody when every known skill meets its target, and ignores a skill with no band', () => {
    expect(weakestSkill({ listening: 7, reading: 7.5, writing: 6.5, speaking: 7 }, target)).toBeNull();
    expect(weakestSkill({ listening: 6.5 }, target)).toEqual({ skill: 'listening', gap: 0.5 });
    expect(weakestSkill({}, target)).toBeNull();
  });
});

/** A path in phase 6 whose week 21 is done: the mock steps point at sessions with the given results */
async function phase6AfterMock(results: { listening: number; reading: number; writing: { status: string; band: number | null }; speaking: { status: string; band: number | null } }) {
  const user = await createUser();
  const [path] = await db
    .insert(ieltsPaths)
    .values({ userId: user.id, bandTargets: { listening: 7, reading: 7, writing: 6.5, speaking: 6.5 }, dailyMinutes: 240, restDays: [], startPhase: 6, endPhase: 6, startDate: quotaDay() })
    .returning();
  await ensureSteps(path);
  const rows = await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id)).orderBy(asc(pathLessons.seq));
  const session = async (result: object) =>
    (await db.insert(examSessions).values({ userId: user.id, exam: 'ielts', mode: 'lesson', blueprint: { exam: 'ielts', sections: [] }, status: 'submitted', submittedAt: new Date(), timeLimitSec: 3600, result: { listening: null, reading: null, writing: null, speaking: null, overall: null, ...result } }).returning())[0].id;
  const byType: Record<string, string> = {
    'l-test40': await session({ listening: { correct: 30, total: 40, band: results.listening } }),
    'r-three': await session({ reading: { correct: 30, total: 40, band: results.reading } }),
    'w-full': await session({ writing: { status: results.writing.status, band: results.writing.band, tasks: [] } }),
    's-full': await session({ speaking: { status: results.speaking.status, band: results.speaking.band, groupId: 'x', feedback: null } }),
  };
  for (const row of rows.filter((r) => r.week === 21)) {
    const ref = row.ref as { type?: string; test?: string };
    const sessionId = ref.test && ref.type ? byType[ref.type] : undefined;
    await db.update(pathLessons).set({ status: 'done', doneAt: new Date(), ref: sessionId ? { ...ref, sessionId } : row.ref }).where(eq(pathLessons.id, row.id));
  }
  return { user, path };
}

const extraSteps = async (path: IeltsPath): Promise<PathLesson[]> =>
  (await db.select().from(pathLessons).where(and(eq(pathLessons.pathId, path.id), eq(pathLessons.core, false)))).filter((r) => String((r.ref as { adaptive?: string }).adaptive ?? '').startsWith('weakest-'));

describe('week 22', () => {
  it('adds an exercise of the weakest skill, as the first thing to do, on a day of the week', async () => {
    const { path } = await phase6AfterMock({ listening: 7, reading: 7, writing: { status: 'done', band: 5.5 }, speaking: { status: 'done', band: 6.5 } });
    expect(await adaptSteps(path, '2026-12-01')).toBe(true);
    const [extra] = await extraSteps(path);
    expect(extra.block).toBe('writing');
    expect((extra.ref as { adaptive: string }).adaptive).toBe('weakest-writing:2026-12-01');
    expect((extra.ref as { type: string }).type).toMatch(/^w-/);
    const [first] = await db.select().from(pathLessons).where(and(eq(pathLessons.pathId, path.id), eq(pathLessons.status, 'todo'))).orderBy(asc(pathLessons.seq)).limit(1);
    expect(first.id).toBe(extra.id);
    // One a day
    expect(await adaptSteps(path, '2026-12-01')).toBe(false);
  });

  it('waits while Writing is still being graded, and adds nothing when every skill met its target', async () => {
    const waiting = await phase6AfterMock({ listening: 6, reading: 6, writing: { status: 'pending', band: null }, speaking: { status: 'done', band: 6 } });
    await adaptSteps(waiting.path, '2026-12-01');
    expect(await extraSteps(waiting.path)).toHaveLength(0);
  });

  it('adds nothing when every skill met its target', async () => {
    const fine = await phase6AfterMock({ listening: 7, reading: 7.5, writing: { status: 'done', band: 6.5 }, speaking: { status: 'done', band: 7 } });
    await adaptSteps(fine.path, '2026-12-01');
    expect(await extraSteps(fine.path)).toHaveLength(0);
  });
});
