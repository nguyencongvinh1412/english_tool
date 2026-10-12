import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';
import { makePdf } from '../test/pdf.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

/** What the fake AI reads from a small N5 book */
const GROUPS = {
  groups: [
    {
      mondai: 'kanji-reading',
      numbers: [1, 2],
      questions: [
        { number: 1, prompt: '[[学校]]へ行きます。', options: ['がっこう', 'がこう', 'かっこう', 'がっこ'] },
        // The underline was lost in the text layer: the admin has to mark it
        { number: 2, prompt: '本を読みます。', options: ['ほん', 'ぼん', 'もと', 'ぽん'] },
      ],
    },
    {
      mondai: 'reading-mid',
      numbers: [3, 3],
      passages: [{ text: 'きのう、公園へ行きました。' }],
      questions: [{ number: 3, prompt: 'どこへ行きましたか。', options: ['公園', '学校', '駅', '店'] }],
    },
    // Listening: options are pictures on page 2
    { mondai: 'listen-task', numbers: [1, 1], questions: [{ number: 1, prompt: '', options: ['1', '2', '3', '4'] }], picturePages: [{ number: 1, page: 2 }] },
  ],
};
const ANSWERS = {
  answers: [
    { mondai: 'kanji-reading', number: 1, answer: 1 },
    { mondai: 'kanji-reading', number: 2, answer: '1' },
    { mondai: 'reading-mid', number: 3, answer: 1 },
    { mondai: 'listen-task', number: 1, answer: 3 },
  ],
};
const SCRIPTS = {
  entries: [
    {
      mondai: 'listen-task',
      number: 1,
      lines: [
        { speaker: '女', text: 'まず切手を買ってください。' },
        { speaker: '男', text: 'はい。' },
      ],
      question: '男の人は何をしますか。',
    },
  ],
};

function fakeParser() {
  aiReply.mockImplementation(async (request) => {
    const system = request.systemPrompt ?? '';
    if (system.includes('answer keys')) return JSON.stringify(ANSWERS);
    if (system.includes('listening scripts')) return JSON.stringify(SCRIPTS);
    return JSON.stringify(GROUPS);
  });
}

async function waitForParse(agent: TestAgent, id: string) {
  for (let i = 0; i < 50; i++) {
    const res = await agent.get(`/api/admin/imports/${id}`);
    if (res.body.import.status !== 'parsing') return res.body.import;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('parse did not finish');
}

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
});
afterAll(closeDb);

describe('JLPT imports', () => {
  it('parses a JLPT book into question types, lists fixes, and publishes a test learners can take', async () => {
    const agent = await signIn(app, await createUser({ role: 'admin' }));
    const pdf = makePdf(['問題1 漢字読み 1 学校へ行きます', '聴解 問題1 1番', '正答表 問題1 1 1', 'スクリプト 1番 女：まず切手を']);
    const uploaded = await agent.post('/api/admin/media').attach('files', pdf, 'n5.pdf');
    const created = await agent.post('/api/admin/imports').send({ title: 'N5 模試 1', documentAssetId: uploaded.body.assets[0].id, exam: 'jlpt', level: 'N5' });
    expect(created.status).toBe(201);
    expect(created.body.import).toMatchObject({ exam: 'jlpt', level: 'N5' });

    fakeParser();
    await agent.post(`/api/admin/imports/${created.body.import.id}/parse`).send({ ranges: { questions: [1, 2], answers: [3, 3], transcripts: [4, 4] } });
    const job = await waitForParse(agent, created.body.import.id);
    expect(job.status).toBe('review');

    const groups = job.draft.groups;
    expect(groups.map((g: { mondai: string }) => g.mondai)).toEqual(['kanji-reading', 'reading-mid', 'listen-task']);
    expect(groups[0].issues.map((i: { message: string }) => i.message).join(' ')).toContain('[[ ]]');
    expect(groups[2].issues.map((i: { code: string }) => i.code)).toContain('needs_photo');
    expect(groups[2].payload.items[0]).toMatchObject({ script: [{ speaker: 'A' }, { speaker: 'B' }], answerIndex: 2 });
    expect(groups[2].photoPages).toEqual({ '1': 2 });

    // The admin marks the underline and crops the picture
    const picture = await agent
      .post('/api/admin/media')
      .attach('files', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), 'pic.png');
    groups[0].payload.questions[1].prompt = '[[本]]を読みます。';
    groups[2].payload.items[0].imageAssetId = picture.body.assets[0].id;
    const saved = await agent.put(`/api/admin/imports/${job.id}/draft`).send({ draft: { groups } });
    expect(saved.status).toBe(200);
    expect(saved.body.import.errorCount).toBe(0);

    const published = await agent.post(`/api/admin/imports/${job.id}/publish`);
    expect(published.body.groups).toBe(3);

    // Learners see it as an official test of its level
    const learner = await signIn(app, await createUser());
    const catalog = (await learner.get('/api/exams/jlpt/catalog')).body;
    expect(catalog.officialTests).toEqual([
      expect.objectContaining({ id: job.id, title: 'N5 模試 1', level: 'N5', questions: 4, sections: ['vocab', 'reading', 'listening'] }),
    ]);
    const started = await learner.post('/api/exams/jlpt/sessions').send({ level: 'N5', mode: 'official', importId: job.id });
    expect(started.status).toBe(201);
    expect(started.body.session).toMatchObject({ mode: 'official', title: 'N5 模試 1', timeLimitSec: 8 * 60 });
    expect(started.body.session.sections[2].groups[0].payload.items[0].imageAssetId).toBe(picture.body.assets[0].id);
  });
});
