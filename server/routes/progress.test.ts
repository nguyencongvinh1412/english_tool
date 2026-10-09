import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { attempts } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('POST /api/attempts', () => {
  it('requires sign-in', async () => {
    expect((await request(app).post('/api/attempts').send({ activity: 'dictation' })).status).toBe(401);
  });

  it('records an attempt, derives the skill server-side, and awards XP', async () => {
    const agent = await signIn(app, await createUser());

    const response = await agent.post('/api/attempts').send({
      activity: 'dictation',
      contentRef: 'easy-my-family',
      title: 'My Family',
      score: 6,
      maxScore: 7,
      durationSec: 240,
      details: { hints: 1 },
    });

    expect(response.status).toBe(201);
    expect(response.body.xpEarned).toBe(15);
    expect(response.body.attempt).toMatchObject({ skill: 'listening', score: 6, maxScore: 7, xp: 15 });
  });

  it('rejects unknown activities, a score without maxScore, and a score above maxScore', async () => {
    const agent = await signIn(app, await createUser());

    expect((await agent.post('/api/attempts').send({ activity: 'hacking' })).status).toBe(400);
    expect((await agent.post('/api/attempts').send({ activity: 'dictation', score: 5 })).status).toBe(400);
    expect((await agent.post('/api/attempts').send({ activity: 'dictation', score: 9, maxScore: 7 })).status).toBe(400);
  });

  it('records imported legacy scores without XP', async () => {
    const agent = await signIn(app, await createUser());

    const response = await agent
      .post('/api/attempts')
      .send({ activity: 'dictation', contentRef: 'easy-my-family', score: 100, maxScore: 100, imported: true });

    expect(response.body.xpEarned).toBe(0);
  });
});

describe('progress reads', () => {
  it('summarises XP, streak, week, skills and recent attempts', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);

    await agent.post('/api/attempts').send({ activity: 'dictation', contentRef: 'a', score: 10, maxScore: 10 });
    await agent.post('/api/attempts').send({ activity: 'conversation', contentRef: 'Travel' });

    // A practice day yesterday keeps a 2-day streak
    const yesterdayAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.insert(attempts).values({
      userId: user.id,
      activity: 'pronunciation',
      skill: 'speaking',
      xp: 10,
      day: quotaDay(yesterdayAt),
      completedAt: yesterdayAt,
    });

    const summary = (await agent.get('/api/progress/summary')).body;

    expect(summary).toMatchObject({
      xpTotal: 35,
      xpToday: 25,
      attemptsTotal: 3,
      streak: { current: 2, best: 2, activeToday: true },
    });
    expect(summary.week).toHaveLength(7);
    expect(summary.week[6]).toMatchObject({ day: summary.today, xp: 25, count: 2 });
    expect(summary.heatmap).toHaveLength(84);
    expect(summary.skills.listening).toMatchObject({ attempts: 1, avgPercent: 100 });
    expect(summary.skills.speaking.attempts).toBe(2);
    expect(summary.skills.reading).toMatchObject({ attempts: 0, avgPercent: null });
    expect(summary.recent[0].activity).toBe('conversation');
  });

  it('only shows a user their own progress', async () => {
    const other = await signIn(app, await createUser());
    await other.post('/api/attempts').send({ activity: 'dictation' });
    const me = await signIn(app, await createUser());

    expect((await me.get('/api/progress/summary')).body.attemptsTotal).toBe(0);
    expect((await me.get('/api/attempts')).body.attempts).toEqual([]);
  });

  it('returns the best percentage per lesson', async () => {
    const agent = await signIn(app, await createUser());
    await agent.post('/api/attempts').send({ activity: 'dictation', contentRef: 'lesson-1', score: 3, maxScore: 7 });
    await agent.post('/api/attempts').send({ activity: 'dictation', contentRef: 'lesson-1', score: 6, maxScore: 7 });
    await agent.post('/api/attempts').send({ activity: 'dictation', contentRef: 'lesson-2', score: 7, maxScore: 7 });

    const response = await agent.get('/api/attempts/best?activity=dictation');

    expect(response.body.best).toEqual({ 'lesson-1': 86, 'lesson-2': 100 });
  });

  it('paginates history newest first', async () => {
    const agent = await signIn(app, await createUser());
    for (let i = 0; i < 3; i++) {
      await agent.post('/api/attempts').send({ activity: 'dictation', title: `Lesson ${i}` });
    }

    const first = await agent.get('/api/attempts?limit=2');
    expect(first.body.attempts.map((a: { title: string }) => a.title)).toEqual(['Lesson 2', 'Lesson 1']);
    expect(first.body.nextBefore).not.toBeNull();

    const second = await agent.get(`/api/attempts?limit=2&before=${encodeURIComponent(first.body.nextBefore)}`);
    expect(second.body.attempts.map((a: { title: string }) => a.title)).toEqual(['Lesson 0']);
    expect(second.body.nextBefore).toBeNull();
  });

  it('keeps unknown API routes as 404 for signed-out users', async () => {
    expect((await request(app).get('/api/does-not-exist')).status).toBe(404);
  });
});
