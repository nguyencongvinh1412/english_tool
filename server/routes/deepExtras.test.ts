import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { deepWordAttempts, deepWordContent, deepWordProgress, type User } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureEnVocab } from '../vocab/data.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

const word = (w: string) => ({ w, pos: 'noun', def: `meaning of ${w}`, ipa: 'ˈtɛst', cefr: 'B1', deck: 'en-core-B1', ex: `We talked about the ${w}.`, exVi: 'câu ví dụ' });
const DATA = { version: { built: '2026-11-08' }, decks: [{ id: 'en-core-B1', group: 'core', label: 'B1' }], words: ['budget', 'deadline', 'budgets', 'costing'].map(word) };
let dataFile = '';

const CONTENT = {
  simpleDefinition: 'a plan for money',
  coreUse: 'Use it at work.',
  synonyms: [],
  antonyms: [],
  contrast: [],
  wordFamily: ['budgets', 'budgetary'],
  collocations: [{ phrase: 'tight budget', example: 'We work with a tight budget.' }],
  register: 'neutral',
  examples: [{ text: 'The budget is ready.', vi: 'x' }, { text: 'Check the budget.', vi: 'y' }],
  fixes: [],
};
const GOOD = { meaningOk: true, formOk: true, naturalOk: true, feedback: 'Great.', improved: 'We set the budget.', issues: [] };

async function started(user: User, term: string, over: Partial<typeof deepWordProgress.$inferInsert> = {}) {
  await db.insert(deepWordContent).values({ itemId: `en:${term}`, ...CONTENT }).onConflictDoNothing();
  await db.insert(deepWordProgress).values({ userId: user.id, itemId: `en:${term}`, startedDay: '2026-11-01', ...over });
}

beforeAll(async () => {
  await runMigrations();
  dataFile = path.join(await mkdtemp(path.join(tmpdir(), 'deep-extras-')), 'vocab-data.json');
});
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
  await writeFile(dataFile, JSON.stringify(DATA));
  await ensureEnVocab(dataFile);
});
afterAll(closeDb);

describe('Deep Word production kinds', () => {
  it('judges a spoken sentence, a paragraph and an answer to a situation, and records each kind', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await started(user, 'budget');
    aiReply.mockResolvedValue(JSON.stringify(GOOD));

    const spoken = await agent.post('/api/deep/produce').send({ itemId: 'en:budget', kind: 'speak', text: 'we set the budget' }).expect(200);
    expect(spoken.body.verdict).toBe('good');
    const paragraph = await agent.post('/api/deep/produce').send({ itemId: 'en:budget', kind: 'paragraph', text: 'We set the budget. It was tight. '.repeat(10), alsoUse: ['budgetary'] }).expect(200);
    expect(paragraph.body.progress.cells.useP).toBe(1);
    const scenario = await agent.post('/api/deep/produce').send({ itemId: 'en:budget', kind: 'scenario', text: 'We need to cut the budget.', situation: 'Your manager asks about costs.' }).expect(200);
    expect(scenario.body.progress.stage).toBe(4);

    const kinds = (await db.select().from(deepWordAttempts)).map((a) => a.kind).sort();
    expect(kinds).toEqual(['paragraph', 'scenario', 'speak']);
    // The scenario prompt reached the AI with the situation
    expect(JSON.stringify(aiReply.mock.calls.at(-1))).toContain('Your manager asks about costs.');
  });

  it('rejects a long sentence, a scenario answer without its situation, and a paragraph that is too long', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await started(user, 'budget');
    await agent.post('/api/deep/produce').send({ itemId: 'en:budget', kind: 'sentence', text: 'x'.repeat(500) }).expect(400);
    await agent.post('/api/deep/produce').send({ itemId: 'en:budget', kind: 'scenario', text: 'We cut costs.' }).expect(400);
    await agent.post('/api/deep/produce').send({ itemId: 'en:budget', kind: 'paragraph', text: 'x'.repeat(900) }).expect(400);
  });

  it('counts a good paragraph and a good sentence on separate days toward using the word on your own', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await started(user, 'budget');
    aiReply.mockResolvedValue(JSON.stringify(GOOD));
    await agent.post('/api/deep/produce').send({ itemId: 'en:budget', kind: 'paragraph', text: 'We set the budget today and it works well.' }).expect(200);
    // Move the first attempt back a day: the second correct use is on another day
    await db.update(deepWordAttempts).set({ createdAt: new Date(Date.now() - 2 * 86_400_000) });
    const next = await agent.post('/api/deep/produce').send({ itemId: 'en:budget', kind: 'scenario', text: 'We set the budget.', situation: 'Your manager asks.' }).expect(200);
    expect(next.body.progress.cells).toMatchObject({ useP: 2, meaningP: 2, formP: 2 });
  });
});

describe('Deep Word situations, personal examples and costs', () => {
  it('writes a situation about the learner’s life', async () => {
    const agent = await signIn(app, await createUser());
    await agent.put('/api/deep/prefs').send({ enabled: true, profile: { work: 'marketing' } });
    aiReply.mockResolvedValueOnce(JSON.stringify({ situation: 'In a team meeting your boss asks how the campaign is going.', situationVi: 'Trong cuộc họp, sếp hỏi chiến dịch thế nào.' }));
    const res = await agent.post('/api/deep/scenario').send({ itemId: 'en:budget' }).expect(200);
    expect(res.body.situation).toContain('meeting');
    expect(JSON.stringify(aiReply.mock.calls[0])).toContain('works in: marketing');
  });

  it('writes personal examples once, keeps them with the session, and writes none without a profile', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await started(user, 'budget');
    expect((await agent.post('/api/deep/personal-examples').send({ itemId: 'en:budget' })).body.examples).toEqual([]);
    expect(aiReply).not.toHaveBeenCalled();

    await agent.put('/api/deep/prefs').send({ profile: { work: 'marketing', interests: ['running'] } });
    aiReply.mockResolvedValueOnce(JSON.stringify({ examples: [{ text: 'Our marketing budget is tight.', vi: 'Ngân sách marketing eo hẹp.' }] }));
    const first = await agent.post('/api/deep/personal-examples').send({ itemId: 'en:budget' }).expect(200);
    expect(first.body.examples).toHaveLength(1);
    const again = await agent.post('/api/deep/personal-examples').send({ itemId: 'en:budget' }).expect(200);
    expect(again.body.examples).toEqual(first.body.examples);
    expect(aiReply).toHaveBeenCalledTimes(1);
  });

  it('estimates what each kind of exercise costs on the learner’s model', async () => {
    const agent = await signIn(app, await createUser());
    const { body } = await agent.get('/api/deep/costs').expect(200);
    expect(body.credits.paragraph).toBeGreaterThan(0);
    expect(body.credits.scenario).toBeGreaterThanOrEqual(body.credits.sentence);
  });
});

describe('Deep Word words that are forgotten', () => {
  it('lists words failed three times in reviews, and a relearn starts at the second stage', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await started(user, 'budget', { completedAt: new Date(), nextReviewAt: new Date(Date.now() + 86_400_000), useP: 1, stage: 4 });
    await started(user, 'deadline', { completedAt: new Date(), nextReviewAt: new Date(Date.now() + 86_400_000), useP: 1, stage: 4 });
    const fail = (itemId: string) => ({ userId: user.id, itemId, kind: 'review-recall', aspect: 'meaning', result: 'fail', assisted: false });
    await db.insert(deepWordAttempts).values([fail('en:budget'), fail('en:budget'), fail('en:budget'), fail('en:deadline')]);

    const overview = (await agent.get('/api/deep/overview')).body;
    expect(overview.forgetful).toEqual([expect.objectContaining({ id: 'en:budget', lapses: 3 })]);
    expect((await agent.get('/api/deep/word/en:budget')).body.lapses).toBe(3);

    await agent.put('/api/deep/prefs').send({ enabled: true, perDay: 2 });
    const relearn = await agent.post('/api/deep/session/start').send({ itemId: 'en:budget', relearn: true }).expect(200);
    expect(relearn.body.progress).toMatchObject({ sessionStage: 2, completed: false });
    const row = (await db.select().from(deepWordProgress).where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, 'en:budget'))))[0];
    expect(row.completedAt).toBeNull();
  });
});

describe('Deep Word notes, network and export', () => {
  it('keeps the learner’s own note on a word and refuses one for a word not studied', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await agent.put('/api/deep/note').send({ itemId: 'en:budget', note: 'Like my phone bill' }).expect(404);
    await started(user, 'budget');
    await agent.put('/api/deep/note').send({ itemId: 'en:budget', note: 'Like my phone bill' }).expect(204);
    expect((await agent.get('/api/deep/word/en:budget')).body.progress.note).toBe('Like my phone bill');
    await agent.put('/api/deep/note').send({ itemId: 'en:budget', note: '' }).expect(204);
    expect((await agent.get('/api/deep/word/en:budget')).body.progress.note).toBeNull();
  });

  it('shows a word with its family, similar words and the words the learner connected, and how deep each is known', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await started(user, 'budget');
    await started(user, 'budgets', { stage: 3 });
    await db.update(deepWordContent).set({ synonyms: ['costing'], contrast: [{ word: 'deadline', difference: 'a', differenceVi: 'b' }] }).where(eq(deepWordContent.itemId, 'en:budget'));
    await agent.put('/api/deep/prefs').send({ enabled: true });
    await db.insert((await import('../db/schema.js')).deepWordLinks).values({ userId: user.id, fromItem: 'en:budget', toItem: 'en:deadline', kind: 'related' });

    const { body } = await agent.get('/api/deep/network/en:budget').expect(200);
    expect(body.center).toMatchObject({ id: 'en:budget', studied: true, stage: 1 });
    const by = Object.fromEntries(body.nodes.map((n: { term: string }) => [n.term, n]));
    // The connected word keeps the closest relation, even though the content also lists it as a contrast
    expect(by.deadline).toMatchObject({ kind: 'related', exists: true, studied: false });
    expect(by.budgets).toMatchObject({ kind: 'family', studied: true, stage: 3 });
    expect(by.costing.kind).toBe('synonym');
    expect(by.budgetary).toMatchObject({ kind: 'family', exists: false });
  });

  it('exports the notebook as CSV and keeps spreadsheet formulas from running', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await started(user, 'budget', { note: '=SUM(1,2)' });
    const res = await agent.get('/api/deep/export').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('deep-words.csv');
    expect(res.text).toContain('"budget"');
    expect(res.text).toContain("\"'=SUM(1,2)\"");
    expect(res.text).not.toContain(',"=SUM');
  });
});
