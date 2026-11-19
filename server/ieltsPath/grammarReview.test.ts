import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { closeDb, db, runMigrations } from '../db/client.js';
import { grammarMistakes, grammarProgress, ieltsPaths, pathLessons } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb } from '../test/helpers.js';
import { adaptSteps } from './adapt.js';
import { ensureSteps, pathToday } from './today.js';

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

const DAY = 86_400_000;

async function pathWithMistakes(options: { mistakes: number; practisedAt?: Date }) {
  const user = await createUser();
  const [path] = await db
    .insert(ieltsPaths)
    .values({ userId: user.id, bandTargets: { listening: 7.5, reading: 7.5, writing: 6.5, speaking: 6.5 }, dailyMinutes: 120, restDays: [], startPhase: 2, endPhase: 6, startDate: quotaDay() })
    .returning();
  await ensureSteps(path);
  for (let i = 0; i < options.mistakes; i++) await db.insert(grammarMistakes).values({ userId: user.id, pointId: 'zero-article', source: 'writing', wrong: 'In the 2000', right: 'In 2000', createdAt: new Date(Date.now() - DAY) });
  if (options.practisedAt) await db.insert(grammarProgress).values({ userId: user.id, pointId: 'zero-article', dueAt: new Date(), practicedAt: options.practisedAt });
  return { user, path };
}

const grammarReview = async (pathId: string) =>
  (await db.select().from(pathLessons).where(eq(pathLessons.pathId, pathId)).orderBy(asc(pathLessons.seq))).filter((r) => (r.ref as { adaptive?: string }).adaptive === 'grammar-zero-article');

describe('a grammar point that keeps going wrong', () => {
  it('puts its grammar step at the front of the queue, once', async () => {
    const { path } = await pathWithMistakes({ mistakes: 2 });
    expect(await adaptSteps(path, quotaDay())).toBe(true);
    const [step] = await grammarReview(path.id);
    expect(step.kind).toBe('grammar');
    expect(step.block).toBe('vocab-grammar');
    expect((step.ref as { pointId: string }).pointId).toBe('zero-article');
    const [first] = await db.select().from(pathLessons).where(and(eq(pathLessons.pathId, path.id), eq(pathLessons.status, 'todo'))).orderBy(asc(pathLessons.seq)).limit(1);
    expect(first.id).toBe(step.id);
    expect(await adaptSteps(path, quotaDay())).toBe(false);
  });

  it('waits for a second mistake', async () => {
    const one = await pathWithMistakes({ mistakes: 1 });
    expect(await adaptSteps(one.path, quotaDay())).toBe(false);
    expect(await grammarReview(one.path.id)).toHaveLength(0);
  });

  it('is not added when the point was practised after its last mistake', async () => {
    const { path } = await pathWithMistakes({ mistakes: 3, practisedAt: new Date() });
    await adaptSteps(path, quotaDay());
    expect(await grammarReview(path.id)).toHaveLength(0);
  });

  it('is not finished by a practice from before its day, and is finished by one after', async () => {
    const { user, path } = await pathWithMistakes({ mistakes: 2, practisedAt: new Date(Date.now() - 3 * DAY) });
    expect(await adaptSteps(path, quotaDay())).toBe(true);
    await pathToday(path);
    expect((await grammarReview(path.id))[0].status).toBe('todo');
    await db.update(grammarProgress).set({ practicedAt: new Date() }).where(and(eq(grammarProgress.userId, user.id), eq(grammarProgress.pointId, 'zero-article')));
    await pathToday(path);
    expect((await grammarReview(path.id))[0].status).toBe('done');
  });
});
