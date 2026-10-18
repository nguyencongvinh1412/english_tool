import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { grammarProgress, srsCards, vocabItems } from '../db/schema.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;

const word = (term: string, level: string, position: number, language: 'en' | 'ja' = 'en', kind = 'word') => ({
  id: `${language}:${term}`,
  kind,
  level,
  position,
  term,
  meaningsEn: [term],
  language,
  deck: language === 'en' ? `en-core-${level}` : null,
});

const card = (userId: string, itemId: string, intervalDays: number, state = 'review') => ({
  userId,
  itemId,
  state,
  dueAt: new Date(Date.now() + intervalDays * DAY),
  intervalDays,
  reps: 3,
});

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('GET /api/progress/journey', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/progress/journey')).status).toBe(401);
  });

  it('counts coverage up to the goal level, grammar mastery and next steps', async () => {
    const user = await createUser({ targetExam: 'toeic', targetScore: 700, cefrLevel: 'A2' });
    await db.insert(vocabItems).values([word('cat', 'A1', 1), word('dog', 'A1', 2), word('rent', 'B1', 1), word('merger', 'B1', 2), word('paradigm', 'C1', 1)]);
    await db.insert(srsCards).values([card(user.id, 'en:cat', 30), card(user.id, 'en:dog', 3, 'learning'), card(user.id, 'en:paradigm', 40)]);
    await db.insert(grammarProgress).values([
      { userId: user.id, pointId: 'present-perfect', dueAt: new Date(Date.now() - 1000), intervalDays: 25, state: 'review' },
      { userId: user.id, pointId: 'past-simple', dueAt: new Date(Date.now() + DAY), intervalDays: 3, state: 'learning' },
    ]);
    const agent = await signIn(app, user);

    const { status, body } = await agent.get('/api/progress/journey');

    expect(status).toBe(200);
    // TOEIC 700 corresponds to B1: levels A1 to B1 count
    expect(body.goal).toMatchObject({ kind: 'toeic', targetLevel: 'B1', targetScore: 700 });
    expect(body.covered).toEqual(['A1', 'A2', 'B1']);
    expect(body.vocab.goal).toEqual({ total: 4, seen: 2, mastered: 1 });
    // The C1 word counts in the totals but not towards the goal
    expect(body.vocab.totals).toEqual({ total: 5, seen: 3, mastered: 2 });
    expect(body.vocab.levels.map((l: { level: string }) => l.level)).toEqual(['A1', 'B1', 'C1']);
    expect(body.grammar.counts).toMatchObject({ mastered: 1, learning: 1 });
    expect(body.grammar.due).toBe(1);
    expect(body.grammar.clusters.length).toBeGreaterThan(5);
    expect(body.steps.map((s: { type: string }) => s.type)).toEqual(expect.arrayContaining(['review-grammar', 'learn-words']));
    expect(body.steps.length).toBeLessThanOrEqual(4);
    expect(body.week.newWords).toBe(3);
  });

  it('shows Japanese levels per kind and no grammar', async () => {
    const user = await createUser({ studyLanguage: 'ja', jaTargetLevel: 'N4' });
    await db.insert(vocabItems).values([word('猫', 'N5', 1, 'ja', 'kanji'), word('犬', 'N5', 2, 'ja', 'word'), word('経済', 'N3', 1, 'ja', 'word')]);
    await db.insert(srsCards).values(card(user.id, 'ja:猫', 30));
    const agent = await signIn(app, user);

    const { body } = await agent.get('/api/progress/journey');

    expect(body.goal).toMatchObject({ kind: 'jlpt', targetLevel: 'N4' });
    expect(body.covered).toEqual(['N5', 'N4']);
    expect(body.grammar).toBeNull();
    expect(body.vocab.levels).toEqual([
      { level: 'N5', kind: 'kanji', total: 1, seen: 1, mastered: 1 },
      { level: 'N5', kind: 'word', total: 1, seen: 0, mastered: 0 },
      { level: 'N3', kind: 'word', total: 1, seen: 0, mastered: 0 },
    ]);
  });

  it('keeps a daily snapshot as the learner finishes activities', async () => {
    const user = await createUser();
    await db.insert(vocabItems).values([word('cat', 'A1', 1), word('dog', 'A1', 2)]);
    await db.insert(srsCards).values(card(user.id, 'en:cat', 30));
    const agent = await signIn(app, user);

    expect((await agent.post('/api/attempts').send({ activity: 'en-vocab', score: 5, maxScore: 5 })).status).toBe(201);
    await db.insert(srsCards).values(card(user.id, 'en:dog', 25));
    expect((await agent.post('/api/attempts').send({ activity: 'en-vocab', score: 5, maxScore: 5 })).status).toBe(201);

    const { body } = await agent.get('/api/progress/journey');

    // Two attempts on one day leave one row, holding the latest totals
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({ vocabSeen: 2, vocabMastered: 2 });
  });
});
