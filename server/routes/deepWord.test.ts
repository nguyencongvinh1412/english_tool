import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { deepWordContent, deepWordProgress, deepWordQueue } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureEnVocab } from '../vocab/data.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

const word = (w: string, def: string) => ({ w, pos: 'noun', def, ipa: 'ˈtɛst', cefr: 'B1', deck: 'en-core-B1', ex: `We talked about ${w}.`, exVi: 'câu ví dụ' });
const DATA = {
  version: { built: '2026-11-07' },
  decks: [{ id: 'en-core-B1', group: 'core', label: 'B1' }],
  words: [word('optimization', 'making something as good as possible'), word('improvement', 'a change that makes better'), word('efficiency', 'working without waste'), word('budget', 'a plan for money'), word('deadline', 'the last time to finish')],
};
let dataFile = '';

const CONTENT = {
  simpleDefinition: 'making something as good or effective as possible',
  coreUse: 'Use it for processes, costs and performance.',
  synonyms: ['improvement'],
  antonyms: [],
  contrast: [{ word: 'improvement', difference: 'Improvement is any gain; optimization aims for the best.', differenceVi: 'Improvement là cải thiện nói chung.' }],
  wordFamily: ['optimize', 'efficiency'],
  collocations: [{ phrase: 'cost optimization', example: 'Cost optimization saved the team money.' }],
  register: 'semi-formal; business and technical',
  examples: [
    { text: 'We focus on cost optimization.', vi: 'Chúng tôi tập trung tối ưu chi phí.' },
    { text: 'Website optimization takes time.', vi: 'Tối ưu website cần thời gian.' },
  ],
};
const GOOD = { meaningOk: true, formOk: true, naturalOk: true, feedback: 'Great.', improved: 'We worked on page optimization.', issues: [] };
const FIX = { meaningOk: false, formOk: true, naturalOk: false, feedback: 'The meaning is off.', improved: 'We worked on page optimization.', issues: [{ text: 'optimizations is', note: 'Use the noun in singular.' }] };

beforeAll(async () => {
  await runMigrations();
  dataFile = path.join(await mkdtemp(path.join(tmpdir(), 'deep-word-')), 'vocab-data.json');
});
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
  await writeFile(dataFile, JSON.stringify(DATA));
  await ensureEnVocab(dataFile);
});
afterAll(closeDb);

const ID = 'en:optimization';

describe('Deep Word', () => {
  it('is off until the learner turns it on, then offers the next queued word', async () => {
    const agent = await signIn(app, await createUser());
    expect((await agent.get('/api/deep/overview')).body.today.state).toBe('off');

    await agent.put('/api/deep/prefs').send({ enabled: true, perDay: 1 }).expect(200);
    const overview = (await agent.get('/api/deep/overview')).body;
    expect(overview.today.state).toBe('ready');
    expect(overview.today.word.id).toMatch(/^en:/);
    expect(overview.queue.length).toBeGreaterThan(0);
  });

  it('rejects more than two words a day and unknown words', async () => {
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ perDay: 3 }).expect(400);
    await agent.post('/api/deep/queue').send({ itemId: 'en:nonsense' }).expect(404);
  });

  it('writes the deep content once, then reuses it for the next learner', async () => {
    aiReply.mockResolvedValueOnce(JSON.stringify(CONTENT));
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ enabled: true });
    const start = await agent.post('/api/deep/session/start').send({ itemId: ID }).expect(200);
    expect(start.body.content.simpleDefinition).toContain('effective');
    expect(start.body.progress).toMatchObject({ stage: 1, sessionStage: 1, completed: false });
    expect(aiReply).toHaveBeenCalledTimes(1);

    const other = await signIn(app, await createUser());
    await other.put('/api/deep/prefs').send({ enabled: true });
    await other.post('/api/deep/session/start').send({ itemId: ID }).expect(200);
    expect(aiReply).toHaveBeenCalledTimes(1);
    expect(await db.select().from(deepWordContent)).toHaveLength(1);
  });

  it('opens one session when the same word is started twice at once', async () => {
    aiReply.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(JSON.stringify(CONTENT)), 50)));
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ enabled: true });

    const [first, second] = await Promise.all([agent.post('/api/deep/session/start').send({ itemId: ID }), agent.post('/api/deep/session/start').send({ itemId: ID })]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body.progress).toMatchObject({ stage: 1, sessionStage: 1, completed: false });
    expect(aiReply).toHaveBeenCalledTimes(1);
    expect(await db.select().from(deepWordProgress)).toHaveLength(1);
  });

  it('stops a second new word on the same day, but lets the learner resume the open one', async () => {
    await db.insert(deepWordContent).values([{ itemId: ID, ...CONTENT }, { itemId: 'en:budget', ...CONTENT }]);
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ enabled: true, perDay: 1 });
    await agent.post('/api/deep/session/start').send({ itemId: ID }).expect(200);
    const second = await agent.post('/api/deep/session/start').send({ itemId: 'en:budget' });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('deep_daily_limit');
    await agent.post('/api/deep/session/start').send({ itemId: ID }).expect(200);
    expect((await agent.get('/api/deep/overview')).body.today).toMatchObject({ state: 'resume' });
  });

  it('keeps the stage and answers of an open session', async () => {
    await db.insert(deepWordContent).values({ itemId: ID, ...CONTENT });
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ enabled: true });
    await agent.post('/api/deep/session/start').send({ itemId: ID });
    await agent.post('/api/deep/session/save').send({ itemId: ID, stage: 3, data: { recall: 'revealed' } }).expect(204);
    const again = await agent.post('/api/deep/session/start').send({ itemId: ID });
    expect(again.body.progress.sessionStage).toBe(3);
    expect(again.body.progress.sessionData.recall).toBe('revealed');
  });

  it('fills the depth cells from recognition exercises', async () => {
    await db.insert(deepWordContent).values({ itemId: ID, ...CONTENT });
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ enabled: true });
    await agent.post('/api/deep/session/start').send({ itemId: ID });
    await agent.post('/api/deep/attempt').send({ itemId: ID, kind: 'listen', aspect: 'form', result: 'pass' });
    await agent.post('/api/deep/attempt').send({ itemId: ID, kind: 'guess', aspect: 'meaning', result: 'pass' });
    const done = await agent.post('/api/deep/attempt').send({ itemId: ID, kind: 'recall', aspect: 'use', result: 'pass' });
    expect(done.body.progress.cells).toMatchObject({ formR: 2, meaningR: 2, useR: 2, useP: 0 });
    expect(done.body.progress.stage).toBe(3);
  });

  it('judges a sentence with the AI and moves the word to "used with help"', async () => {
    await db.insert(deepWordContent).values({ itemId: ID, ...CONTENT });
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ enabled: true });
    await agent.post('/api/deep/session/start').send({ itemId: ID });

    aiReply.mockResolvedValueOnce(JSON.stringify(FIX));
    const bad = await agent.post('/api/deep/produce').send({ itemId: ID, text: 'The optimizations is a nice cat.' }).expect(200);
    expect(bad.body.verdict).toBe('fix');
    expect(bad.body.check.issues).toHaveLength(1);
    // A sentence that misses the meaning and sounds unnatural does not count as using the word
    expect(bad.body.progress.cells).toMatchObject({ meaningP: 0, useP: 0 });
    expect(bad.body.progress.stage).toBe(1);

    aiReply.mockResolvedValueOnce(JSON.stringify(GOOD));
    const good = await agent.post('/api/deep/produce').send({ itemId: ID, text: 'We worked on page optimization.' }).expect(200);
    expect(good.body.verdict).toBe('good');
    // One correct sentence is not "done" for producing: that needs correct, unaided use on separate days
    expect(good.body.progress.cells).toMatchObject({ meaningP: 1, useP: 1, formP: 1 });
    expect(good.body.progress.stage).toBe(4);
  });

  it('counts a self-check as help, and does not allow finishing without producing', async () => {
    await db.insert(deepWordContent).values({ itemId: ID, ...CONTENT });
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ enabled: true });
    await agent.post('/api/deep/session/start').send({ itemId: ID });

    const early = await agent.post('/api/deep/session/complete').send({ itemId: ID });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('production_required');

    const check = await agent.post('/api/deep/self-check').send({ itemId: ID, ticked: 3, total: 3 }).expect(200);
    expect(check.body.progress.cells.useP).toBe(1);
  });

  it('lets "later" be used twice, then no more, and finishes with a review scheduled', async () => {
    await db.insert(deepWordContent).values({ itemId: ID, ...CONTENT });
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ enabled: true });
    await agent.post('/api/deep/session/start').send({ itemId: ID });
    expect((await agent.post('/api/deep/defer').send({ itemId: ID })).body.progress.deferralsLeft).toBe(1);
    expect((await agent.post('/api/deep/defer').send({ itemId: ID })).body.progress.deferralsLeft).toBe(0);
    expect((await agent.post('/api/deep/defer').send({ itemId: ID })).status).toBe(409);

    const finished = await agent.post('/api/deep/session/complete').send({ itemId: ID, link: ['en:efficiency', 'en:unknown'] }).expect(200);
    expect(finished.body.deferred).toBe(true);
    expect(finished.body.schedule).toHaveLength(4);
    expect(finished.body.progress).toMatchObject({ completed: true, reviewStep: 0 });

    const page = (await agent.get(`/api/deep/word/${ID}`)).body;
    expect(page.links.map((l: { id: string }) => l.id)).toEqual(['en:efficiency']);
    expect((await agent.get('/api/deep/notebook')).body.words).toHaveLength(1);
    expect((await agent.get('/api/deep/overview')).body.today.state).toBe('done');
  });

  it('queues a word, writes its content in the background and removes it when started', async () => {
    aiReply.mockResolvedValue(JSON.stringify(CONTENT));
    const agent = await signIn(app, await createUser());
    await agent.post('/api/deep/queue').send({ itemId: 'en:budget' }).expect(201);
    await vi.waitFor(async () => expect(await db.select().from(deepWordContent).where(eq(deepWordContent.itemId, 'en:budget'))).toHaveLength(1));
    await agent.put('/api/deep/prefs').send({ enabled: true });
    await agent.post('/api/deep/session/start').send({ itemId: 'en:budget' }).expect(200);
    expect(await db.select().from(deepWordQueue).where(and(eq(deepWordQueue.itemId, 'en:budget')))).toHaveLength(0);
    expect(await db.select().from(deepWordProgress)).toHaveLength(1);
  });

  it('puts the Deep Word task into Today once it is turned on', async () => {
    await db.insert(deepWordContent).values({ itemId: ID, ...CONTENT });
    const agent = await signIn(app, await createUser());
    const before = (await agent.get('/api/today?minutes=45')).body.tasks;
    expect(before.some((t: { type: string }) => t.type === 'learn-deep-word')).toBe(false);

    await agent.put('/api/deep/prefs').send({ enabled: true });
    const tasks = (await agent.get('/api/today?minutes=45')).body.tasks;
    expect(tasks.find((t: { type: string }) => t.type === 'learn-deep-word')).toMatchObject({ done: false, minutes: 10 });
  });
});
