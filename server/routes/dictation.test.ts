import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { attempts, contentItems } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(async () => JSON.stringify({ title: 'A Trip Away', sentences: ['We travel by train.', 'The seats are quite comfortable.', 'Our bags are on the shelf.', 'It takes about three hours.', 'We arrive in the afternoon.', 'My friend meets us at the station.'] })),
  listAllowedModels: vi.fn(async () => ['claude-haiku-5-5']),
}));

const app = createApp();
const sentences = (tag: string) => [1, 2, 3, 4, 5].map((n) => `${tag} sentence number ${n} is here.`);

async function seed(id: string, level: string, tag = id): Promise<void> {
  await db.insert(contentItems).values({ id, kind: 'dictation', skill: 'listening', exam: 'none', language: 'en', part: 'book:dictation', level, title: tag, topic: 'test', payload: { title: tag, sentences: sentences(tag) }, source: 'imported', status: 'archived' });
}

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  vi.mocked(sendChatMessage).mockClear();
});
afterAll(closeDb);

describe('POST /api/dictation/next', () => {
  it('needs a signed-in learner', async () => {
    await request(app).post('/api/dictation/next').send({}).expect(401);
  });

  it('gives a passage of the learner level, from the bank, without calling the AI', async () => {
    const user = await createUser({ cefrLevel: 'A2' });
    await seed('d-a2', 'A2');
    await seed('d-b2', 'B2');
    const learner = await signIn(app, user);
    const response = await learner.post('/api/dictation/next').send({});

    expect(response.status).toBe(200);
    expect(response.body.lesson).toMatchObject({ id: 'd-a2', level: 'A2', origin: 'book' });
    expect(response.body.lesson.sentences).toHaveLength(5);
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('skips a passage the learner has done and writes a new one when the level has none left', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    await seed('d-b1', 'B1');
    const learner = await signIn(app, user);
    await db.insert(attempts).values({ userId: user.id, activity: 'dictation', skill: 'listening', language: 'en', contentRef: 'd-b1', day: '2026-11-14' });

    const response = await learner.post('/api/dictation/next').send({});
    expect(response.status).toBe(200);
    expect(response.body.lesson.origin).toBe('ai');
    expect(response.body.lesson.id).toMatch(/^ai-dict-/);
    expect(response.body.lesson.level).toBe('B1');
    expect(sendChatMessage).toHaveBeenCalledTimes(1);
    // The new passage joined the bank for the next time
    const [saved] = await db.select().from(contentItems).where(and(eq(contentItems.id, response.body.lesson.id)));
    expect(saved.kind).toBe('dictation');
  });

  it('falls back to the next level down when the learner level has nothing, before asking the AI', async () => {
    const user = await createUser({ cefrLevel: 'B2' });
    await seed('d-b1', 'B1');
    const learner = await signIn(app, user);
    const response = await learner.post('/api/dictation/next').send({});
    expect(response.body.lesson).toMatchObject({ id: 'd-b1', origin: 'book' });
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('offers a lesson done with under 80% again, and not one done well', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    await seed('d-weak', 'B1');
    await seed('d-good', 'B1');
    const learner = await signIn(app, user);
    const done = (ref: string, score: number) => db.insert(attempts).values({ userId: user.id, activity: 'dictation', skill: 'listening', language: 'en', contentRef: ref, title: ref, score, maxScore: 5, day: '2026-11-14' });
    await done('d-weak', 2);
    await done('d-good', 5);

    expect((await learner.get('/api/dictation/summary')).body).toEqual({ level: 'B1', weak: 1 });
    const redo = (await learner.post('/api/dictation/next').send({ mode: 'redo' })).body.lesson;
    expect(redo).toMatchObject({ id: 'd-weak', reason: 'redo', previousPercent: 40 });
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('counts only the last attempt of a lesson: a lesson passed since is no longer weak', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    await seed('d-1', 'B1');
    const learner = await signIn(app, user);
    await db.insert(attempts).values({ userId: user.id, activity: 'dictation', skill: 'listening', language: 'en', contentRef: 'd-1', score: 1, maxScore: 5, day: '2026-11-13', completedAt: new Date('2026-11-13T10:00:00Z') });
    await db.insert(attempts).values({ userId: user.id, activity: 'dictation', skill: 'listening', language: 'en', contentRef: 'd-1', score: 5, maxScore: 5, day: '2026-11-14', completedAt: new Date('2026-11-14T10:00:00Z') });
    expect((await learner.get('/api/dictation/summary')).body.weak).toBe(0);
  });

  it('automatic mode redoes a weak lesson before writing a new passage with the AI', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    await seed('d-weak', 'B1');
    const learner = await signIn(app, user);
    await db.insert(attempts).values({ userId: user.id, activity: 'dictation', skill: 'listening', language: 'en', contentRef: 'd-weak', title: 'd-weak', score: 1, maxScore: 5, day: '2026-11-14' });
    const response = await learner.post('/api/dictation/next').send({});
    expect(response.body.lesson).toMatchObject({ id: 'd-weak', reason: 'redo' });
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('points to a fixed lesson of the app when that is the weak one', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    const learner = await signIn(app, user);
    await db.insert(attempts).values({ userId: user.id, activity: 'dictation', skill: 'listening', language: 'en', contentRef: 'easy-morning-routine', title: 'My Morning Routine', score: 2, maxScore: 8, day: '2026-11-14' });
    const response = await learner.post('/api/dictation/next').send({ mode: 'redo' });
    expect(response.body.lesson).toMatchObject({ id: 'easy-morning-routine', origin: 'builtin', reason: 'redo', previousPercent: 25 });
  });

  it('mode new never gives a lesson to redo', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    await seed('d-weak', 'B1');
    await seed('d-fresh', 'B1');
    const learner = await signIn(app, user);
    await db.insert(attempts).values({ userId: user.id, activity: 'dictation', skill: 'listening', language: 'en', contentRef: 'd-weak', title: 'd-weak', score: 0, maxScore: 5, day: '2026-11-14' });
    for (let i = 0; i < 5; i++) {
      expect((await learner.post('/api/dictation/next').send({ mode: 'new' })).body.lesson).toMatchObject({ id: 'd-fresh', reason: 'new' });
    }
  });

  it('rejects an unknown level', async () => {
    const learner = await signIn(app, await createUser());
    await learner.post('/api/dictation/next').send({ level: 'Z9' }).expect(400);
  });
});
