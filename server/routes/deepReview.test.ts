import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { deepWordContent, deepWordProgress, type User } from '../db/schema.js';
import { CliProxyApiError, sendChatMessage } from '../services/cliproxy.js';
import { ensureEnVocab } from '../vocab/data.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

const word = (w: string, def: string) => ({ w, pos: 'noun', def, ipa: 'ˈtɛst', cefr: 'B1', deck: 'en-core-B1', ex: `We talked about the ${w}.`, exVi: 'câu ví dụ' });
const WORDS = ['budget', 'deadline', 'invoice', 'meeting', 'report', 'target', 'client'];
const DATA = { version: { built: '2026-11-08' }, decks: [{ id: 'en-core-B1', group: 'core', label: 'B1' }], words: WORDS.map((w) => word(w, `meaning of ${w}`)) };
let dataFile = '';

const content = (term: string) => ({
  simpleDefinition: `what ${term} means`,
  coreUse: 'Use it at work.',
  synonyms: [],
  antonyms: [],
  contrast: [],
  wordFamily: [],
  collocations: [{ phrase: `tight ${term}`, example: `We work with a tight ${term}.` }],
  register: 'neutral',
  examples: [{ text: `The ${term} is ready.`, vi: 'x' }, { text: `Check the ${term} today.`, vi: 'y' }],
  fixes: [{ wrong: `We made a ${term} yesterday it.`, right: `We made a ${term} yesterday.`, note: 'Do not add it.' }],
});
const GOOD = { meaningOk: true, formOk: true, naturalOk: true, feedback: 'Great.', improved: 'We checked the budget.', issues: [] };

/** A studied word that is due for review (finished yesterday) */
async function studied(user: User, term: string, over: Partial<typeof deepWordProgress.$inferInsert> = {}) {
  await db.insert(deepWordContent).values({ itemId: `en:${term}`, ...content(term) }).onConflictDoNothing();
  await db.insert(deepWordProgress).values({
    userId: user.id,
    itemId: `en:${term}`,
    startedDay: '2026-11-01',
    completedAt: new Date(Date.now() - 86_400_000),
    nextReviewAt: new Date(Date.now() - 3_600_000),
    useP: 1,
    meaningR: 2,
    formR: 2,
    useR: 2,
    stage: 4,
    ...over,
  });
}

beforeAll(async () => {
  await runMigrations();
  dataFile = path.join(await mkdtemp(path.join(tmpdir(), 'deep-review-')), 'vocab-data.json');
});
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
  await writeFile(dataFile, JSON.stringify(DATA));
  await ensureEnVocab(dataFile);
});
afterAll(closeDb);

const progressOf = async (user: User, term: string) => (await db.select().from(deepWordProgress).where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, `en:${term}`))))[0];

describe('Deep Word review', () => {
  it('offers due words with an exercise, a different kind each time as the word is remembered', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await studied(user, 'budget');
    const first = (await agent.get('/api/deep/review')).body;
    expect(first.due).toBe(1);
    expect(first.items[0].exercise).toMatchObject({ kind: 'recall', first: 'b', length: 6 });

    const answered = await agent.post('/api/deep/review/answer').send({ itemId: 'en:budget', kind: 'recall', answer: 'Budget' }).expect(200);
    expect(answered.body).toMatchObject({ result: 'pass', outcome: 'good', progress: { reviewStep: 1 } });
    expect(answered.body.progress.cells.meaningP).toBe(1);
    // Due again in 3 days, so nothing waits now
    expect((await agent.get('/api/deep/review')).body.due).toBe(0);
    const row = await progressOf(user, 'budget');
    expect(row.lastKind).toBe('recall');
    expect(Math.round((row.nextReviewAt!.getTime() - Date.now()) / 86_400_000)).toBe(3);

    await db.update(deepWordProgress).set({ nextReviewAt: new Date(Date.now() - 1000) });
    const second = (await agent.get('/api/deep/review')).body.items[0].exercise;
    expect(second.kind).toBe('cloze');
    expect(second.text).toContain('_____');
  });

  it('goes back a step and to an easier kind after a wrong answer', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await studied(user, 'budget', { reviewStep: 2, lastKind: 'fix' });
    const wrong = await agent.post('/api/deep/review/answer').send({ itemId: 'en:budget', kind: 'fix', answer: 'We made a budget yesterday it.' }).expect(200);
    expect(wrong.body).toMatchObject({ result: 'fail', outcome: 'bad', explanation: { right: 'We made a budget yesterday.' }, progress: { reviewStep: 1 } });
    expect((await progressOf(user, 'budget')).lastGood).toBe(false);
    await db.update(deepWordProgress).set({ nextReviewAt: new Date(Date.now() - 1000) });
    expect((await agent.get('/api/deep/review')).body.items[0].exercise.kind).toBe('cloze');
  });

  it('grades a cloze answer, accepting the form used in the sentence', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await studied(user, 'budget', { reviewStep: 1, lastKind: 'recall' });
    const item = (await agent.get('/api/deep/review')).body.items[0];
    expect(item.exercise.kind).toBe('cloze');
    const right = await agent.post('/api/deep/review/answer').send({ itemId: 'en:budget', kind: 'cloze', ref: item.exercise.ref, answer: 'budget' }).expect(200);
    expect(right.body.result).toBe('pass');
    expect(right.body.progress.cells.formP).toBe(1);
  });

  it('judges a different correction with the AI, and keeps the interval when the AI is unavailable', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await studied(user, 'budget', { reviewStep: 2, lastKind: 'cloze' });
    aiReply.mockResolvedValueOnce(JSON.stringify(GOOD));
    const ok = await agent.post('/api/deep/review/answer').send({ itemId: 'en:budget', kind: 'fix', answer: 'Yesterday we made a budget.' }).expect(200);
    expect(ok.body.result).toBe('pass');

    await studied(user, 'deadline', { reviewStep: 2, lastKind: 'cloze' });
    aiReply.mockRejectedValue(new CliProxyApiError('down', 503));
    const down = await agent.post('/api/deep/review/answer').send({ itemId: 'en:deadline', kind: 'fix', answer: 'Yesterday we made a deadline.' });
    expect(down.status).toBe(200);
    expect(down.body).toMatchObject({ result: 'partial', outcome: 'same', assisted: true, progress: { reviewStep: 2 } });
  });

  it('asks for a sentence first when the learner chose "later", with and without the AI', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await studied(user, 'budget', { useP: 0, deferredCount: 1, stage: 3 });
    expect((await agent.get('/api/deep/review')).body.items[0].exercise).toMatchObject({ kind: 'sentence', firstSentence: true });

    aiReply.mockResolvedValueOnce(JSON.stringify(GOOD));
    const done = await agent.post('/api/deep/review/answer').send({ itemId: 'en:budget', kind: 'sentence', answer: 'We checked the budget.' }).expect(200);
    expect(done.body.progress.cells.useP).toBe(1);
    expect(done.body.progress.stage).toBe(4);

    await studied(user, 'deadline', { useP: 0, deferredCount: 1, stage: 3 });
    const helped = await agent.post('/api/deep/review/answer').send({ itemId: 'en:deadline', kind: 'sentence', answer: 'We met the deadline.', selfCheck: { ticked: 3, total: 4 } }).expect(200);
    expect(helped.body).toMatchObject({ result: 'partial', assisted: true, outcome: 'same' });
    expect(helped.body.progress.cells.useP).toBe(1);
  });

  it('keeps a long backlog to a short session and offers a gentle return after a week away', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    for (const term of WORDS) await studied(user, term, { lastReviewedAt: new Date(Date.now() - 10 * 86_400_000) });
    const review = (await agent.get('/api/deep/review')).body;
    expect(review.due).toBe(7);
    expect(review.items).toHaveLength(5);
    expect(review.welcomeBack).toBe(true);
    const overview = (await agent.get('/api/deep/overview')).body;
    expect(overview.review).toMatchObject({ due: 7, session: 5, welcomeBack: true });
  });

  it('counts the depth of studied words and filters the notebook by weak aspect', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await studied(user, 'budget', { useP: 2, formP: 2, meaningP: 2, stage: 5 });
    await studied(user, 'deadline');
    await agent.post('/api/deep/review/answer').send({ itemId: 'en:deadline', kind: 'recall', answer: 'deadline' }).expect(200);
    const stats = (await agent.get('/api/deep/stats')).body;
    expect(stats).toMatchObject({ total: 2, recognisedOnly: 0, unaided: { ok: 1, of: 1 } });
    expect(stats.stages).toEqual([0, 0, 0, 1, 1]);
    expect(stats.weak.use).toBe(1);
    const weakUse = (await agent.get('/api/deep/notebook?weak=use')).body.words;
    expect(weakUse.map((w: { id: string }) => w.id)).toEqual(['en:deadline']);
  });

  it('puts the review into Today and marks it done once a word is reviewed', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await agent.put('/api/deep/prefs').send({ enabled: true });
    await studied(user, 'budget');
    const task = (await agent.get('/api/today?minutes=45')).body.tasks.find((t: { type: string }) => t.type === 'review-deep');
    expect(task).toMatchObject({ count: 1, done: false });
    await agent.post('/api/deep/review/answer').send({ itemId: 'en:budget', kind: 'recall', answer: 'budget' }).expect(200);
    const after = (await agent.get('/api/today?minutes=45')).body.tasks.find((t: { type: string }) => t.type === 'review-deep');
    expect(after.done).toBe(true);
  });

  it('lets an admin edit, approve and re-read the notes of a word, and keeps others out', async () => {
    const admin = await createUser({ role: 'admin' });
    const learner = await createUser();
    await db.insert(deepWordContent).values({ itemId: 'en:budget', ...content('budget') });
    const adminAgent = await signIn(app, admin);
    const read = (await adminAgent.get('/api/admin/deep-words/en:budget')).body;
    expect(read.status).toBe('ai');
    await adminAgent.put('/api/admin/deep-words/en:budget').send({ content: { ...read.content, register: 'formal' }, status: 'approved' }).expect(204);
    const after = (await adminAgent.get('/api/admin/deep-words/en:budget')).body;
    expect(after).toMatchObject({ status: 'approved', content: { register: 'formal' } });
    expect((await adminAgent.get('/api/admin/deep-words?q=bud')).body.words).toHaveLength(1);
    await (await signIn(app, learner)).get('/api/admin/deep-words').expect(403);
  });
});
