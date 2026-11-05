import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { contentItems, placementQuestions, skillLevels, vocabItems } from '../db/schema.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();
type Agent = Awaited<ReturnType<typeof signIn>>;

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const words = LEVELS.flatMap((level) =>
  Array.from({ length: 8 }, (_, i) => ({ id: `en:${level}-${i}`, kind: 'word', level, position: i, term: `${level.toLowerCase()}word${i}`, meaningsEn: [`${level} meaning ${i}`], language: 'en' as const, deck: `en-core-${level}` }))
);

async function seedVocab() {
  await db.insert(vocabItems).values(words);
}

/** Plays the test: right answers when `right` is true, wrong ones otherwise; returns the final session */
async function play(agent: Agent, right: boolean) {
  let session = (await agent.post('/api/placement/start')).body.session;
  for (let guard = 0; guard < 60 && session.status !== 'finished'; guard++) {
    const [q] = await db.select().from(placementQuestions).where(eq(placementQuestions.id, session.question.id));
    const choice = right ? q.answerIndex : (q.answerIndex + 1) % 4;
    session = (await agent.post(`/api/placement/${session.id}/answer`).send({ questionId: q.id, choice })).body.session;
  }
  return session;
}

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await db.delete(placementQuestions);
});
afterAll(closeDb);

describe('placement question bank (admin)', () => {
  it('is for admins only', async () => {
    const agent = await signIn(app, await createUser());
    expect((await agent.post('/api/admin/placement/build')).status).toBe(403);
    expect((await request(app).get('/api/admin/placement/coverage')).status).toBe(401);
  });

  it('builds questions from words and practice content, once, and shows coverage', async () => {
    await seedVocab();
    await db.insert(contentItems).values({
      id: 'grammar-test-1',
      kind: 'grammar-practice',
      skill: 'reading',
      language: 'en',
      level: 'B1',
      title: 'Set',
      source: 'ai',
      payload: { items: [{ type: 'choice', prompt: 'She ____ here since 2020.', options: ['lives', 'has lived', 'living'], answerIndex: 1 }, { type: 'gap', prompt: 'x ____', answers: ['y'] }] },
    });
    const admin = await signIn(app, await createUser({ role: 'admin' }));

    const first = (await admin.post('/api/admin/placement/build')).body;
    expect(first.vocabulary).toBe(48);
    expect(first.content).toBe(1);
    expect((await admin.post('/api/admin/placement/build')).body.added).toBe(0);

    const { coverage } = (await admin.get('/api/admin/placement/coverage')).body;
    expect(coverage.vocabulary.B1).toBe(8);
    expect(coverage.grammar.B1).toBe(1);
  });

  it('retires a question so it is never asked', async () => {
    await seedVocab();
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    await admin.post('/api/admin/placement/build');
    const { questions } = (await admin.get('/api/admin/placement/questions?skill=vocabulary&level=B1')).body;
    expect((await admin.patch(`/api/admin/placement/questions/${encodeURIComponent(questions[0].id)}`).send({ status: 'retired' })).status).toBe(200);
    const { coverage } = (await admin.get('/api/admin/placement/coverage')).body;
    expect(coverage.vocabulary.B1).toBe(7);
  });
});

describe('placement test', () => {
  it('needs sign-in, English, and a built bank', async () => {
    expect((await request(app).post('/api/placement/start')).status).toBe(401);
    const ja = await signIn(app, await createUser({ studyLanguage: 'ja' }));
    expect((await ja.post('/api/placement/start')).status).toBe(400);
    const en = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    expect((await en.post('/api/placement/start')).status).toBe(503);
  });

  it('serves a question without the answer and resumes where it stopped', async () => {
    await seedVocab();
    await (await signIn(app, await createUser({ role: 'admin' }))).post('/api/admin/placement/build');
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    const started = (await agent.post('/api/placement/start')).body.session;
    expect(started.question.options).toHaveLength(4);
    expect(JSON.stringify(started)).not.toContain('answerIndex');
    expect(started.progress.total).toBe(19);

    const resumed = (await agent.get('/api/placement')).body.session;
    expect(resumed.id).toBe(started.id);
    expect(resumed.question.id).toBe(started.question.id);
  });

  it('measures a high level from right answers and saves it', async () => {
    await seedVocab();
    await (await signIn(app, await createUser({ role: 'admin' }))).post('/api/admin/placement/build');
    const user = await createUser({ cefrLevel: 'B1' });
    const agent = await signIn(app, user);

    const done = await play(agent, true);
    expect(done.status).toBe('finished');
    // Only vocabulary has questions here; the other skills stay unmeasured rather than guessed
    expect(done.result.levels.vocabulary.level).toBe('C2');
    expect(done.result.levels.grammar).toBeNull();
    expect(done.result.overall).toBe('C2');
    expect(done.result.correct).toBe(done.result.answered);

    const saved = await db.select().from(skillLevels).where(eq(skillLevels.userId, user.id));
    expect(saved.map((r) => r.skill)).toEqual(['vocabulary']);
    expect((await agent.get('/api/placement')).body.latest.overall).toBe('C2');
  });

  it('measures a low level from wrong answers', async () => {
    await seedVocab();
    await (await signIn(app, await createUser({ role: 'admin' }))).post('/api/admin/placement/build');
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    const done = await play(agent, false);
    expect(['A1', 'A2']).toContain(done.result.levels.vocabulary.level);
  });

  it('rejects the wrong question, a bad choice, and answers after the test is over', async () => {
    await seedVocab();
    await (await signIn(app, await createUser({ role: 'admin' }))).post('/api/admin/placement/build');
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    const session = (await agent.post('/api/placement/start')).body.session;
    expect((await agent.post(`/api/placement/${session.id}/answer`).send({ questionId: 'vocab:nope', choice: 0 })).status).toBe(400);
    expect((await agent.post(`/api/placement/${session.id}/answer`).send({ questionId: session.question.id, choice: 9 })).status).toBe(400);
    const done = await play(agent, true);
    expect((await agent.post(`/api/placement/${done.id}/answer`).send({ questionId: 'x', choice: 0 })).status).toBe(404);
  });
});
