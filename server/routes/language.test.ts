import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { attempts, contentItems } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureBuiltinContent } from '../content/seeds.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
});
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

const both = { vi: 'vi', en: 'en' };
const dictation = {
  title: 'Buổi sáng',
  sentences: Array.from({ length: 4 }, () => ({ text: '私{わたし}は毎朝{まいあさ}コーヒーを飲{の}みます。', translation: both })),
};

describe('Japanese content', () => {
  it('generates lessons at a JLPT level and stores them as Japanese', async () => {
    const agent = await signIn(app, await createUser());
    aiReply.mockResolvedValue(JSON.stringify(dictation));
    const res = await agent.post('/api/content/generate').send({ kind: 'ja-dictation', level: 'N5' });
    expect(res.status).toBe(201);
    const [item] = await db.select().from(contentItems).where(eq(contentItems.id, res.body.item.id));
    expect(item).toMatchObject({ language: 'ja', level: 'N5', kind: 'ja-dictation' });
    expect(aiReply.mock.calls[0][0].systemPrompt).toContain('JLPT N5');
  });

  it('rejects a CEFR level for Japanese and a JLPT level for English', async () => {
    const agent = await signIn(app, await createUser());
    expect((await agent.post('/api/content/generate').send({ kind: 'ja-reading', level: 'B1' })).status).toBe(400);
    expect((await agent.post('/api/content/generate').send({ kind: 'reading-passage', level: 'N3' })).status).toBe(400);
  });

  it('asks the AI again when kanji come without readings', async () => {
    const agent = await signIn(app, await createUser());
    const missing = { ...dictation, sentences: dictation.sentences.map(() => ({ text: '私は毎朝コーヒーを飲みます。', translation: both })) };
    aiReply.mockResolvedValueOnce(JSON.stringify(missing)).mockResolvedValueOnce(JSON.stringify(dictation));
    expect((await agent.post('/api/content/generate').send({ kind: 'ja-dictation', level: 'N5' })).status).toBe(201);
    expect(aiReply).toHaveBeenCalledTimes(2);
  });

  it('defines Japanese words with reading and Sino-Vietnamese', async () => {
    const agent = await signIn(app, await createUser());
    aiReply.mockResolvedValue(
      JSON.stringify({
        word: '勉強',
        reading: 'べんきょう',
        partOfSpeech: 'noun',
        meaning: 'study',
        translation: 'việc học',
        hanViet: 'MIỄN CƯỜNG',
        example: '毎日{まいにち}勉強{べんきょう}します。',
        exampleTranslation: 'Tôi học mỗi ngày.',
      })
    );
    const res = await agent.post('/api/ai/define').send({ word: '勉強', sentence: '日本語を勉強します。', language: 'ja' });
    expect(res.status).toBe(200);
    expect(res.body.definition.hanViet).toBe('MIỄN CƯỜNG');
  });

  it('scores Japanese writing with a JLPT level estimate and records it as Japanese', async () => {
    await ensureBuiltinContent();
    const user = await createUser();
    const agent = await signIn(app, user);
    aiReply.mockResolvedValue(
      JSON.stringify({
        overallBand: 5.5,
        levelEstimate: 'N4',
        criteria: ['GRA', 'VOC', 'SCR', 'CON'].map((key) => ({ key, name: key, band: 5.5, comment: 'ok' })),
        strengths: ['good'],
        improvements: ['more'],
        corrections: [],
        improvedVersion: '私はグエンです。',
      })
    );
    const res = await agent
      .post('/api/ai/score-writing')
      .send({ contentId: 'builtin-ja-writing-self-intro', response: 'はじめまして。わたしはグエンです。ベトナムから来ました。よろしくおねがいします。' });
    expect(res.status).toBe(200);
    expect(res.body.feedback.levelEstimate).toBe('N4');
    expect(aiReply.mock.calls[0][0].systemPrompt).toContain('Japanese teacher');
    const [attempt] = await db.select().from(attempts).where(eq(attempts.userId, user.id));
    expect(attempt).toMatchObject({ language: 'ja', activity: 'writing-task' });
  });

  it('chats in Japanese with furigana and corrections', async () => {
    const agent = await signIn(app, await createUser());
    aiReply.mockResolvedValue('こんにちは！');
    await agent
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'こんにちは' }], context: { mode: 'ja-conversation', politeness: 'casual', level: 'N4' } })
      .expect(200);
    const prompt = aiReply.mock.calls[0][0].systemPrompt ?? '';
    expect(prompt).toContain('JLPT N4');
    expect(prompt).toContain('plain forms');
    expect(prompt).toContain('in braces');
    expect(prompt).toContain('learning Japanese');
  });
});
