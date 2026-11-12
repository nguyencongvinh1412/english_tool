import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db, runMigrations } from '../db/client.js';
import { contentItems, gateAttempts, ieltsPaths, pathLessons } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb } from '../test/helpers.js';
import { ensureGateContent, GATE_GROUPS } from './gateContent.js';
import { practiceSections } from './practice.js';
import { ensurePracticeContent } from './practiceContent.js';
import { ensureSteps } from './today.js';

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await ensureGateContent();
  await ensurePracticeContent();
});
afterAll(closeDb);

/** A group of the bank standing in for an imported one, built from an authored gate group */
async function imported(id: string, part: string, kind: 'ielts-listening' | 'ielts-reading' | 'writing-prompt' | 'speaking-ielts', source: string, patch: object = {}, level = 'B2') {
  const group = GATE_GROUPS.find((g) => g.id === source)!;
  await db.insert(contentItems).values({ id, kind, skill: group.skill, exam: 'ielts', part, level, title: id, topic: 'test', payload: { ...(group.payload as object), ...patch }, source: 'imported', status: 'archived' });
}

describe('written exercises of the later phases', () => {
  it('still run at phase 4 and later: the fixed prompts have no level', async () => {
    const user = await createUser();
    const [section] = await practiceSections(user, 'w-opinion', 4);
    expect(section.component).toBe('writing');
    expect(section.groupIds[0]).toMatch(/^ip-w-opinion-/);
    const [speaking] = await practiceSections(user, 's-full', 6);
    expect(speaking.groupIds[0]).toMatch(/^ip-s-full-/);
  });

  it('gives a whole-test writing exercise two fixed prompts when its real test is not in the bank', async () => {
    const user = await createUser();
    const [section] = await practiceSections(user, 'w-full', 6, undefined, 'c17-t3');
    expect(section.groupIds).toHaveLength(2);
    expect(section.groupIds[0]).toMatch(/^ip-w-line-/);
    expect(section.groupIds[1]).toMatch(/^ip-w-discuss-/);
  });
});

describe('real tests in practice', () => {
  it('runs the named real test when all of its groups are in the bank', async () => {
    const user = await createUser();
    await imported('book-c17-t3-w1', 'book:c17-t3', 'writing-prompt', 'gate-1-A-writing-1');
    await imported('book-c17-t3-w2', 'book:c17-t3', 'writing-prompt', 'gate-1-A-writing-2');
    const [section] = await practiceSections(user, 'w-full', 6, undefined, 'c17-t3');
    expect(section).toEqual({ component: 'writing', groupIds: ['book-c17-t3-w1', 'book-c17-t3-w2'] });
  });

  it('prefers a real section the learner has not seen from phase 4 on, and never one kept for a gate or a mock week', async () => {
    const user = await createUser();
    await imported('book-c17-t1-l4', 'book:c17-t1', 'ielts-listening', 'gate-0-listening-1', { section: 4 });
    await imported('book-c99-t1-l4', 'book:c99-t1', 'ielts-listening', 'gate-0-listening-1', { section: 4 });
    for (let i = 0; i < 4; i++) {
      const [section] = await practiceSections(user, 'l-sec4', 4);
      expect(section.groupIds).toEqual(['book-c99-t1-l4']);
    }
  });
});

describe('foundation book listening in the early phases', () => {
  it('gives the A2 exam practice of the foundation book in phases 1 to 3 and the Cambridge sections from phase 4, each at its own level', async () => {
    const user = await createUser();
    await imported('book-grl-t1-l1', 'book:grl', 'ielts-listening', 'gate-0-listening-1', { section: 1 }, 'A2');
    await imported('book-c99-t1-l1', 'book:c99-t1', 'ielts-listening', 'gate-0-listening-1', { section: 1 }, 'B2');
    for (const phase of [1, 2, 3]) expect((await practiceSections(user, 'l-form', phase))[0].groupIds).toEqual(['book-grl-t1-l1']);
    expect((await practiceSections(user, 'l-form', 4))[0].groupIds).toEqual(['book-c99-t1-l1']);
  });
});

describe('foundation book reading in the early phases', () => {
  it('gives a passage with the kind of question the exercise is about, at the foundation level only', async () => {
    const user = await createUser();
    const tfng = (GATE_GROUPS.find((g) => g.id === 'gate-1-reading')!.payload as { questions: { type: string }[] }).questions;
    expect(tfng.some((q) => q.type === 'tfng')).toBe(true);
    await imported('book-grr-t11-r1', 'book:grr', 'ielts-reading', 'gate-1-reading', {}, 'A2');
    for (const phase of [1, 2, 3]) expect((await practiceSections(user, 'r-tfng', phase))[0].groupIds).toEqual(['book-grr-t11-r1']);
    // From phase 4 the level is B2: the foundation passage is not taken
    await imported('book-c99-t1-r1', 'book:c99-t1', 'ielts-reading', 'gate-1-reading', {}, 'B2');
    expect((await practiceSections(user, 'r-passage', 4))[0].groupIds).toEqual(['book-c99-t1-r1']);
  });
});

describe('real writing and speaking tasks in practice', () => {
  it('give Task 1, Task 2 and a whole Speaking test from phase 4 on, from the tests not kept, and not before', async () => {
    const user = await createUser();
    await imported('book-c99-t1-w1', 'book:c99-t1', 'writing-prompt', 'gate-1-A-writing-1', { taskType: 'ielts-task1' });
    await imported('book-c99-t1-w2', 'book:c99-t1', 'writing-prompt', 'gate-1-A-writing-2', { taskType: 'ielts-task2' });
    await imported('book-c17-t1-w1', 'book:c17-t1', 'writing-prompt', 'gate-1-A-writing-1', { taskType: 'ielts-task1' });
    await imported('book-c99-t1-s', 'book:c99-t1', 'speaking-ielts', 'gate-0-speaking');
    expect((await practiceSections(user, 'w-task1', 4))[0].groupIds).toEqual(['book-c99-t1-w1']);
    expect((await practiceSections(user, 'w-task2', 5))[0].groupIds).toEqual(['book-c99-t1-w2']);
    expect((await practiceSections(user, 's-mock', 5))[0].groupIds).toEqual(['book-c99-t1-s']);
    expect((await practiceSections(user, 'w-task1', 3))[0].groupIds[0]).toMatch(/^ip-w-task1-/);
  });
});

describe('the steps a learner gets', () => {
  it('stop at the phase the target needs, then add the final sprint after its gate', async () => {
    const user = await createUser();
    const [path] = await db
      .insert(ieltsPaths)
      .values({ userId: user.id, bandTargets: { listening: 5.5, reading: 5.5, writing: 5, speaking: 5 }, dailyMinutes: 120, restDays: [], startPhase: 1, endPhase: 1, startDate: quotaDay() })
      .returning();
    await ensureSteps(path);
    const phases = async () => [...new Set((await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id))).map((r) => r.phase))].sort();
    expect(await phases()).toEqual([1]);
    await db.insert(gateAttempts).values({ pathId: path.id, userId: user.id, gate: 1, version: 'A', status: 'finished', outcome: 'pass', bands: { listening: 9, reading: 9, writing: 6, speaking: 6 }, finishedAt: new Date() });
    await ensureSteps(path);
    expect(await phases()).toEqual([1, 7]);
  });
});
