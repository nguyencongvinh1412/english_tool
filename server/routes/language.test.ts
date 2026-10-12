import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('study language', () => {
  it('is saved on the profile with a JLPT goal', async () => {
    const agent = await signIn(app, await createUser());
    const res = await agent.patch('/api/me').send({ studyLanguage: 'ja', jaTargetLevel: 'N4' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ studyLanguage: 'ja', jaTargetLevel: 'N4' });
    expect((await agent.patch('/api/me').send({ jaTargetLevel: 'N6' })).status).toBe(400);
  });

  it('records attempts in the current language and splits skills, but shares XP and streak', async () => {
    const agent = await signIn(app, await createUser());
    await agent.post('/api/attempts').send({ activity: 'dictation', score: 5, maxScore: 5 }).expect(201);
    // Kana always counts as Japanese, whatever the current language
    const kana = await agent.post('/api/attempts').send({ activity: 'kana', score: 8, maxScore: 10 });
    expect(kana.body.attempt.language).toBe('ja');

    await agent.patch('/api/me').send({ studyLanguage: 'ja' }).expect(200);
    const dictationJa = await agent.post('/api/attempts').send({ activity: 'dictation', score: 1, maxScore: 5 });
    expect(dictationJa.body.attempt.language).toBe('ja');

    const ja = (await agent.get('/api/progress/summary')).body;
    expect(ja.language).toBe('ja');
    expect(ja.skills.reading.attempts).toBe(1);
    expect(ja.skills.listening.attempts).toBe(1);
    expect(ja.recent).toHaveLength(2);

    const en = (await agent.get('/api/progress/summary?language=en')).body;
    expect(en.skills.listening.attempts).toBe(1);
    expect(en.skills.reading.attempts).toBe(0);
    expect(en.xpTotal).toBe(ja.xpTotal);
    expect(en.attemptsTotal).toBe(3);
  });
});

