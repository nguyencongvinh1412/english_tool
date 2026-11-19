import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { closeDb, db, runMigrations } from '../db/client.js';
import { examSessions, ieltsPaths, pathLessons } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb } from '../test/helpers.js';
import { isBlankSubmission } from './errors.js';
import { phaseSteps } from './syllabus.js';
import { ensureSteps, pathToday, startPractice } from './today.js';

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

const listening = { exam: 'ielts', sections: [{ component: 'listening', groupIds: ['g1'] }] };

describe('isBlankSubmission', () => {
  it('is a listening or reading session with no answer, or only empty ones', () => {
    expect(isBlankSubmission({ answers: {}, blueprint: listening })).toBe(true);
    expect(isBlankSubmission({ answers: { 'g1:0': '', 'g1:1': '   ' }, blueprint: listening })).toBe(true);
  });
  it('is not once there is one answer, including the first option (0)', () => {
    expect(isBlankSubmission({ answers: { 'g1:0': 0 }, blueprint: listening })).toBe(false);
    expect(isBlankSubmission({ answers: { 'g1:0': 'spelt' }, blueprint: listening })).toBe(false);
  });
  it('is never a writing or speaking session', () => {
    expect(isBlankSubmission({ answers: {}, blueprint: { exam: 'ielts', sections: [{ component: 'writing', groupIds: ['w'] }] } })).toBe(false);
    expect(isBlankSubmission({ answers: {}, blueprint: { exam: 'ielts', sections: [] } })).toBe(false);
  });
});

async function pathWithListeningStep(answers: Record<string, unknown>) {
  const user = await createUser();
  const [path] = await db
    .insert(ieltsPaths)
    .values({ userId: user.id, bandTargets: { listening: 7, reading: 7, writing: 6.5, speaking: 6.5 }, dailyMinutes: 240, restDays: [], startPhase: 2, endPhase: 2, startDate: quotaDay() })
    .returning();
  await ensureSteps(path);
  const [step] = await db.select().from(pathLessons).where(and(eq(pathLessons.pathId, path.id), eq(pathLessons.kind, 'practice'), eq(pathLessons.block, 'listening'))).orderBy(asc(pathLessons.seq)).limit(1);
  const [session] = await db.insert(examSessions).values({ userId: user.id, exam: 'ielts', mode: 'lesson', blueprint: listening, answers, status: 'submitted', submittedAt: new Date(), timeLimitSec: 1800 }).returning();
  await db.update(pathLessons).set({ ref: { ...(step.ref as object), sessionId: session.id } }).where(eq(pathLessons.id, step.id));
  return { user, path, step, session };
}

describe('a blank submission', () => {
  it('does not finish the step, and starting it again opens a fresh session on the same exercise', async () => {
    const { user, path, step, session } = await pathWithListeningStep({});
    await pathToday(path);
    const [after] = await db.select().from(pathLessons).where(eq(pathLessons.id, step.id));
    expect(after.status).toBe('todo');
    const again = await startPractice(user, after);
    expect(again).not.toBe(session.id);
    const [fresh] = await db.select().from(examSessions).where(eq(examSessions.id, again));
    expect(fresh.status).toBe('in_progress');
    expect(fresh.blueprint).toEqual(listening);
    const [moved] = await db.select().from(pathLessons).where(eq(pathLessons.id, step.id));
    expect((moved.ref as { sessionId: string }).sessionId).toBe(again);
  });

  it('finishes the step as soon as one answer was given', async () => {
    const { path, step } = await pathWithListeningStep({ 'g1:0': 'answer' });
    await pathToday(path);
    const [after] = await db.select().from(pathLessons).where(eq(pathLessons.id, step.id));
    expect(after.status).toBe('done');
  });
});

describe('dictation in the syllabus', () => {
  it('is a 15-minute core step in phases 1-3 and an optional 10-minute step after', () => {
    for (const phase of [1, 2, 3]) {
      const steps = phaseSteps(phase).filter((s) => s.kind === 'dictation');
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((s) => s.core && s.minutes === 15)).toBe(true);
    }
    const later = phaseSteps(4).filter((s) => s.kind === 'dictation');
    expect(later.every((s) => !s.core && s.minutes === 10)).toBe(true);
  });
});
