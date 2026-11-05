import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { roadmapTasks, vocabItems } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { addDays } from '../roadmap/plan.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();
const goal = { language: 'en', goalType: 'toeic', targetScore: 600, hoursPerWeek: 5 };

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('roadmap API', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/roadmap')).status).toBe(401);
    expect((await request(app).post('/api/roadmap/preview').send(goal)).status).toBe(401);
  });

  it('has no roadmap until one is created', async () => {
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    const { status, body } = await agent.get('/api/roadmap');
    expect(status).toBe(200);
    expect(body.roadmap).toBeNull();
  });

  it('previews stages and a feasibility verdict without saving', async () => {
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    const { status, body } = await agent.post('/api/roadmap/preview').send({ ...goal, deadline: addDays(quotaDay(), 400) });
    expect(status).toBe(200);
    expect(body.targetLevel).toBe('B1');
    expect(body.stages.map((s: { kind: string }) => s.kind)).toEqual(['level', 'level', 'exam-prep']);
    expect(body.plan.feasibility).toBe('ok');
    expect((await agent.get('/api/roadmap')).body.roadmap).toBeNull();
  });

  it('says hard to reach, with ways to fix it, when the deadline is too close', async () => {
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    const { body } = await agent.post('/api/roadmap/preview').send({ ...goal, deadline: addDays(quotaDay(), 14) });
    expect(body.plan.feasibility).toBe('hard');
    expect(body.plan.fixes.hoursPerWeek).toBeGreaterThan(5);
  });

  it('creates a roadmap, returns it with progress, and archives the old one when a new goal is set', async () => {
    await db.insert(vocabItems).values([{ id: 'en:rent', kind: 'word', level: 'B1', position: 1, term: 'rent', meaningsEn: ['rent'], language: 'en', deck: 'en-core-B1' }]);
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));

    const created = await agent.post('/api/roadmap').send(goal);
    expect(created.status).toBe(201);
    expect(created.body.roadmap).toMatchObject({ goalType: 'toeic', targetLevel: 'B1', fromLevel: 'B1', levelSource: 'self' });
    expect(created.body.progress.overall).toBe(0);
    expect(created.body.progress.stages).toHaveLength(3);

    const second = await agent.post('/api/roadmap').send({ ...goal, targetScore: 785 });
    expect(second.status).toBe(201);
    const current = (await agent.get('/api/roadmap')).body;
    expect(current.roadmap.id).toBe(second.body.roadmap.id);
    expect(current.roadmap.targetLevel).toBe('B2');

    expect((await agent.delete('/api/roadmap')).status).toBe(204);
    expect((await agent.get('/api/roadmap')).body.roadmap).toBeNull();
  });

  it('rejects a goal that does not match the language, a past deadline and bad hours', async () => {
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    expect((await agent.post('/api/roadmap').send({ ...goal, language: 'ja' })).status).toBe(400);
    expect((await agent.post('/api/roadmap').send({ ...goal, deadline: '2020-01-01' })).status).toBe(400);
    expect((await agent.post('/api/roadmap').send({ ...goal, hoursPerWeek: 0 })).status).toBe(400);
    expect((await agent.post('/api/roadmap').send({ language: 'en', goalType: 'cefr', hoursPerWeek: 5 })).status).toBe(400);
  });
});

describe('GET /api/today with a roadmap', () => {
  it('stores the day\'s tasks once and carries an unfinished learning task forward', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    const agent = await signIn(app, user);
    const created = await agent.post('/api/roadmap').send(goal);
    const roadmapId = created.body.roadmap.id as string;
    const yesterday = addDays(quotaDay(), -1);
    await db.insert(roadmapTasks).values({
      roadmapId,
      userId: user.id,
      day: yesterday,
      taskKey: 'skill-writing',
      task: { id: 'skill-writing', type: 'practice-skill', skill: 'writing', minutes: 15, done: false },
    });

    const first = (await agent.get('/api/today?minutes=45')).body;
    const carried = first.tasks.find((t: { id: string }) => t.id === 'skill-writing');
    expect(carried).toMatchObject({ rolledFrom: yesterday, done: false });
    expect(first.rolled).toBe(1);

    // Opening Today again changes nothing: same tasks, the carried one is stored on today's date
    const second = (await agent.get('/api/today?minutes=45')).body;
    expect(second.tasks.map((t: { id: string }) => t.id)).toEqual(first.tasks.map((t: { id: string }) => t.id));
    const rows = await db.select().from(roadmapTasks).where(eq(roadmapTasks.roadmapId, roadmapId));
    expect(rows.filter((r) => r.taskKey === 'skill-writing')).toHaveLength(1);
    expect(rows.find((r) => r.taskKey === 'skill-writing')!.day).toBe(quotaDay());
  });

  it('offers a way back after a week away', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    const agent = await signIn(app, user);
    await agent.post('/api/roadmap').send(goal);
    // No practice since the roadmap started: backdate the start so ten days have passed
    const { db: database } = await import('../db/client.js');
    const { roadmaps } = await import('../db/schema.js');
    await database.update(roadmaps).set({ startDate: addDays(quotaDay(), -10) });
    const today = (await agent.get('/api/today')).body;
    expect(today.welcomeBack).toEqual({ days: 10 });
  });

  it('has no welcome-back or carried tasks without a roadmap', async () => {
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    const today = (await agent.get('/api/today')).body;
    expect(today.welcomeBack).toBeNull();
    expect(today.rolled).toBe(0);
  });
});


describe('level from study data and stage-aware Today', () => {
  it('derives the highest level where half the words are mastered, and none without data', async () => {
    const user = await createUser({ cefrLevel: null });
    const agent = await signIn(app, user);
    expect((await agent.get('/api/roadmap/derived-level')).body.level).toBeNull();

    const day = 24 * 60 * 60 * 1000;
    const word = (term: string, level: string, n: number) => ({ id: `en:${term}`, kind: 'word', level, position: n, term, meaningsEn: [term], language: 'en' as const, deck: `en-core-${level}` });
    await db.insert(vocabItems).values([word('cat', 'A1', 1), word('dog', 'A1', 2), word('rent', 'B1', 1), word('merger', 'B1', 2)]);
    const { srsCards } = await import('../db/schema.js');
    const card = (itemId: string, interval: number) => ({ userId: user.id, itemId, state: 'review', dueAt: new Date(Date.now() + day), intervalDays: interval, reps: 3 });
    await db.insert(srsCards).values([card('en:cat', 30), card('en:dog', 30), card('en:rent', 30)]);
    // A1 fully mastered, B1 half mastered: B1 counts as reached
    expect((await agent.get('/api/roadmap/derived-level')).body.level).toBe('B1');
  });

  it('keeps a derived starting level and a narrower estimate range', async () => {
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    const self = await agent.post('/api/roadmap/preview').send(goal);
    const derived = await agent.post('/api/roadmap/preview').send({ ...goal, levelSource: 'derived' });
    expect(derived.body.plan.etaFrom > self.body.plan.etaFrom).toBe(true);
    const created = await agent.post('/api/roadmap').send({ ...goal, levelSource: 'derived' });
    expect(created.body.roadmap.levelSource).toBe('derived');
  });

  it('reports a roadmap as not completed until all its stages are done', async () => {
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    const created = await agent.post('/api/roadmap').send(goal);
    expect(created.body.progress.completed).toBe(false);
  });
});

describe('measured level', () => {
  it('prefers a placement result over study data and marks the roadmap as measured', async () => {
    const user = await createUser({ cefrLevel: 'A2' });
    const agent = await signIn(app, user);
    const { skillLevels } = await import('../db/schema.js');
    await db.insert(skillLevels).values([
      { userId: user.id, language: 'en', skill: 'vocabulary', level: 'B2', confidence: 'high', source: 'placement' },
      { userId: user.id, language: 'en', skill: 'grammar', level: 'B1', confidence: 'medium', source: 'placement' },
    ]);
    // The mean of B2 and B1, rounded down, is B1
    expect((await agent.get('/api/roadmap/derived-level')).body).toEqual({ level: 'B1', source: 'measured' });
    const created = await agent.post('/api/roadmap').send({ ...goal, fromLevel: 'B1', levelSource: 'measured' });
    expect(created.body.roadmap.levelSource).toBe('measured');
  });
});

describe('minimum per skill', () => {
  it('adds study time when the measured skill is below the minimum asked for', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    const agent = await signIn(app, user);
    const { skillLevels } = await import('../db/schema.js');
    await db.insert(skillLevels).values({ userId: user.id, language: 'en', skill: 'listening', level: 'A2', confidence: 'high', source: 'placement' });
    const ielts = { language: 'en', goalType: 'ielts', targetScore: 6.5, hoursPerWeek: 8 };
    const plain = (await agent.post('/api/roadmap/preview').send(ielts)).body.plan;
    const asked = (await agent.post('/api/roadmap/preview').send({ ...ielts, minSkillLevels: { listening: '6.5' } })).body.plan;
    // Listening measured A2, 6.5 asked for is B2: two levels short
    expect(asked.skillGaps).toEqual({ listening: 2 });
    expect(asked.extraHours).toBeGreaterThan(0);
    expect(asked.totalHours).toBe(plain.totalHours + asked.extraHours);
    // A skill that was never measured adds nothing
    expect((await agent.post('/api/roadmap/preview').send({ ...ielts, minSkillLevels: { writing: '6.5' } })).body.plan.extraHours).toBe(0);
  });
});

