import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { attempts, contentItems } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { jlptGroupSchema, scoreJlpt, type JlptBlueprint, type Mondai } from '../exams/jlpt.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';
import type { ContentItem } from '../db/schema.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);
const explanation = { vi: 'vì', en: 'because' };

const kanjiReading = (n: number) => ({
  questions: Array.from({ length: n }, () => ({
    prompt: '[[学校{がっこう}]]へ行{い}きます。',
    options: ['がっこう', 'がこう', 'かっこう', 'がっこ'],
    answerIndex: 0,
    explanation,
  })),
});
const grammar = (n: number) => ({
  questions: Array.from({ length: n }, () => ({ prompt: 'わたしは毎朝{まいあさ}パン（　）食{た}べます。', options: ['を', 'に', 'で', 'が'], answerIndex: 0, explanation })),
});
const readingMid = (n: number) => ({
  passages: [{ text: 'きのう、友{とも}だちと公園{こうえん}へ行{い}きました。' }],
  questions: Array.from({ length: n }, () => ({ prompt: 'どこへ行{い}きましたか。', options: ['公園{こうえん}', '学校{がっこう}', '駅{えき}', '店{みせ}'], answerIndex: 0, explanation })),
});
const listenTask = (n: number) => ({
  speakers: { A: { name: 'さくら', gender: 'female' }, B: { name: 'たろう', gender: 'male' } },
  items: Array.from({ length: n }, () => ({
    script: [
      { speaker: 'A', text: 'まず切手{きって}を買{か}ってください。' },
      { speaker: 'B', text: 'はい、わかりました。' },
    ],
    question: '男{おとこ}の人{ひと}は何{なに}をしますか。',
    options: ['切手{きって}を買{か}う', '手紙{てがみ}を書{か}く', '電話{でんわ}する', '帰{かえ}る'],
    answerIndex: 0,
    explanation,
  })),
});

async function seed(level: string, mondai: Mondai, payload: object): Promise<void> {
  await db.insert(contentItems).values({
    kind: mondai.startsWith('listen') ? 'jlpt-listening' : 'jlpt-group',
    skill: mondai.startsWith('listen') ? 'listening' : 'reading',
    exam: 'jlpt',
    language: 'ja',
    part: `jlpt-${mondai}`,
    level,
    title: mondai,
    payload,
    source: 'ai',
  });
}

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
});
afterAll(closeDb);

describe('JLPT group checks', () => {
  it('requires the key of a kanji-reading question to be the underlined reading', () => {
    const schema = jlptGroupSchema('kanji-reading', 'N5', 1);
    expect(schema.safeParse(kanjiReading(1)).success).toBe(true);
    const wrongKey = { questions: [{ ...kanjiReading(1).questions[0], answerIndex: 1 }] };
    expect(schema.safeParse(wrongKey).success).toBe(false);
  });

  it('checks the shape of sentence ordering and quick responses', () => {
    const order = jlptGroupSchema('sentence-order', 'N5', 1);
    const item = { prompt: 'きのう　＿＿＿　＿＿＿　＿★＿　＿＿＿　です。', options: ['あ', 'い', 'う', 'え'], answerIndex: 2, explanation };
    expect(order.safeParse({ questions: [item] }).success).toBe(true);
    expect(order.safeParse({ questions: [{ ...item, prompt: 'きのう　＿＿＿　です。' }] }).success).toBe(false);

    const response = jlptGroupSchema('listen-response', 'N5', 1);
    const reply = { script: [{ speaker: 'A', text: 'おはようございます。' }], options: ['おはようございます。', 'こんばんは。', 'いただきます。'], answerIndex: 0, explanation };
    expect(response.safeParse({ speakers: { A: { name: 'A', gender: 'male' } }, items: [reply] }).success).toBe(true);
    expect(response.safeParse({ speakers: { A: { name: 'A', gender: 'male' } }, items: [{ ...reply, options: [...reply.options, 'はい。'] }] }).success).toBe(false);
  });
});

describe('JLPT scoring', () => {
  /** One group per section with the given correct/total */
  const run = (level: 'N3' | 'N5', scores: Record<string, [number, number]>, fullTest = true) => {
    const groups = new Map<string, ContentItem>();
    const answers: Record<string, number> = {};
    const sections = Object.entries(scores).map(([mondai, [correct, total]]) => {
      groups.set(mondai, { id: mondai, payload: { questions: Array.from({ length: total }, () => ({ answerIndex: 0 })) } } as unknown as ContentItem);
      for (let i = 0; i < total; i++) answers[`${mondai}:${i}`] = i < correct ? 0 : 1;
      return { mondai: mondai as Mondai, groupIds: [mondai], takes: [total] };
    });
    return scoreJlpt({ exam: 'jlpt', level, sections } as JlptBlueprint, groups, answers, fullTest);
  };

  it('passes on the total when every section reaches its minimum', () => {
    const result = run('N3', { context: [40, 58], 'reading-mid': [10, 16], 'listen-task': [12, 28] });
    expect(result.sections.map((s) => [s.id, s.scaled])).toEqual([
      ['language', 41],
      ['reading', 38],
      ['listening', 26],
    ]);
    expect(result).toMatchObject({ total: 105, passMark: 95, passed: true });
  });

  it('fails when one section is under its minimum even with a high total', () => {
    const result = run('N3', { context: [58, 58], 'reading-mid': [16, 16], 'listen-task': [8, 28] });
    expect(result.total).toBe(137);
    expect(result.sections[2]).toMatchObject({ id: 'listening', scaled: 17, passedMinimum: false });
    expect(result.passed).toBe(false);
  });

  it('scores N5 language and reading together out of 120', () => {
    const result = run('N5', { 'kanji-reading': [21, 21], 'reading-mid': [0, 5] });
    expect(result.sections).toEqual([expect.objectContaining({ id: 'language-reading', scaled: 97, max: 120 })]);
    expect(result.passed).toBeNull();
  });
});

describe('JLPT mock tests', () => {
  it('runs a mini N5 test with hidden answers, scoring and Japanese attempts', async () => {
    await seed('N5', 'kanji-reading', kanjiReading(5));
    await seed('N5', 'grammar-form', grammar(5));
    await seed('N5', 'reading-mid', readingMid(2));
    await seed('N5', 'listen-task', listenTask(3));
    const user = await createUser();
    const agent = await signIn(app, user);

    const started = await agent.post('/api/exams/jlpt/sessions').send({ level: 'N5', mode: 'mini' });
    expect(started.status).toBe(201);
    const session = started.body.session;
    expect(session).toMatchObject({ exam: 'jlpt', level: 'N5', mode: 'mini', timeLimitSec: 25 * 60 });
    expect(session.sections.map((s: { mondai: string }) => s.mondai)).toEqual(['kanji-reading', 'grammar-form', 'reading-mid', 'listen-task']);
    expect(session.sections[0].groups[0].payload.questions[0].answerIndex).toBeUndefined();
    expect(session.sections[3].groups[0].payload.items[0].answerIndex).toBeUndefined();

    // Everything right except the listening items
    const answers: Record<string, number> = {};
    for (const section of session.sections) {
      for (const group of section.groups) {
        const count = (group.payload.questions ?? group.payload.items).length;
        for (let i = 0; i < count; i++) answers[`${group.id}:${i}`] = section.section === 'listening' ? 3 : 0;
      }
    }
    expect((await agent.patch(`/api/exams/sessions/${session.id}`).send({ answers })).status).toBe(200);
    const submitted = await agent.post(`/api/exams/sessions/${session.id}/submit`).send({});
    expect(submitted.body.session.result).toMatchObject({
      sections: [
        { id: 'language-reading', correct: 12, total: 12, scaled: 120 },
        { id: 'listening', correct: 0, total: 3, scaled: 0 },
      ],
      total: null,
      passed: null,
    });
    expect(submitted.body.session.sections[0].groups[0].payload.questions[0].answerIndex).toBe(0);

    const recorded = await db.select().from(attempts).where(eq(attempts.userId, user.id));
    expect(recorded.map((a) => [a.activity, a.language]).sort()).toEqual([
      ['jlpt-language', 'ja'],
      ['jlpt-listening', 'ja'],
    ]);
  });

  it('asks for the admin when the bank lacks more than a few groups', async () => {
    const agent = await signIn(app, await createUser());
    const res = await agent.post('/api/exams/jlpt/sessions').send({ level: 'N3', mode: 'full' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('bank_insufficient');
    expect(res.body.missing.context).toBe(3);
  });

  it('lets the admin generate checked groups for one question type', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    aiReply.mockImplementation(async (request) =>
      JSON.stringify(String(request.systemPrompt).includes('expert JLPT test-taker') ? { answers: [0, 0, 0, 0, 0] } : grammar(5))
    );
    const res = await admin.post('/api/admin/jlpt-bank/fill').send({ level: 'N4', mondai: 'grammar-form', count: 1 });
    expect(res.body).toEqual({ created: 1, failed: 0 });

    const bank = (await admin.get('/api/admin/jlpt-bank')).body.levels.find((l: { level: string }) => l.level === 'N4');
    expect(bank.mondai.find((m: { mondai: string }) => m.mondai === 'grammar-form')).toMatchObject({ groups: 1, fullTestGroups: 3 });
  });
});
