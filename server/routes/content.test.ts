import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { contentItems } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureBuiltinContent, SEED_ITEMS } from '../content/seeds.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

const GAPFILL = {
  title: 'Generated Gapfill',
  questions: Array.from({ length: 6 }, (_, i) => ({
    type: 'mcq',
    prompt: `Sentence ${i} needs a ____ here.`,
    options: ['word', 'words', 'wordy', 'worded'],
    answerIndex: 0,
    explanation: 'Because.',
  })),
};

const WRITING_FEEDBACK = {
  overallBand: 6.5,
  criteria: ['TR', 'CC', 'LR', 'GRA'].map((key) => ({ key, name: key, band: 6.5, comment: 'ok' })),
  strengths: ['Clear position'],
  improvements: ['Use more linking words'],
  corrections: [{ original: 'peoples', corrected: 'people', explanation: 'Uncountable here' }],
  improvedVersion: 'A better essay.',
};

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await ensureBuiltinContent();
  aiReply.mockReset();
});
afterAll(closeDb);

describe('content bank', () => {
  it('seeds every built-in item and lists them by kind and level', async () => {
    const agent = await signIn(app, await createUser());

    const passages = await agent.get('/api/content?kind=reading-passage');
    expect(passages.body.items).toHaveLength(SEED_ITEMS.filter((s) => s.kind === 'reading-passage').length);

    const b2 = await agent.get('/api/content?kind=reading-passage&level=B2');
    expect(b2.body.items.map((i: { id: string }) => i.id)).toEqual(['builtin-reading-procrastination']);

    const task1 = await agent.get('/api/content?kind=writing-prompt&writingTask=ielts-task1');
    expect(task1.body.items.map((i: { id: string }) => i.id)).toEqual(['builtin-writing-task1-commute']);
  });

  it('returns an item with its payload and 404s on unknown ids', async () => {
    const agent = await signIn(app, await createUser());

    const item = await agent.get('/api/content/builtin-listening-station');
    expect(item.body.item.payload.script.length).toBeGreaterThan(2);
    expect((await agent.get('/api/content/nope')).status).toBe(404);
  });

  it('includes the caller’s best score per item', async () => {
    const agent = await signIn(app, await createUser());
    await agent.post('/api/attempts').send({ activity: 'reading-quiz', contentRef: 'builtin-gapfill-office', score: 8, maxScore: 10 });

    const list = await agent.get('/api/content?kind=reading-gapfill');
    expect(list.body.items[0]).toMatchObject({ id: 'builtin-gapfill-office', best: 80 });
  });
});

describe('POST /api/content/generate', () => {
  it('stores a valid AI item in the shared bank and counts quota', async () => {
    aiReply.mockResolvedValueOnce('```json\n' + JSON.stringify(GAPFILL) + '\n```');
    const author = await signIn(app, await createUser());

    const response = await author.post('/api/content/generate').send({ kind: 'reading-gapfill', level: 'B1', topic: 'office' });

    expect(response.status).toBe(201);
    expect(response.body.item).toMatchObject({ title: 'Generated Gapfill', source: 'ai', exam: 'toeic', part: 'toeic-5' });
    expect((await author.get('/api/auth/me')).body.user.aiQuota.used).toBe(1);

    // Another learner sees the new item too
    const other = await signIn(app, await createUser());
    const list = await other.get('/api/content?kind=reading-gapfill&level=B1');
    expect(list.body.items.map((i: { title: string }) => i.title)).toContain('Generated Gapfill');
  });

  it('passes the titles to avoid on to the AI', async () => {
    aiReply.mockResolvedValueOnce(JSON.stringify(GAPFILL));
    const agent = await signIn(app, await createUser());

    const response = await agent
      .post('/api/content/generate')
      .send({ kind: 'reading-gapfill', level: 'B1', topic: 'office', avoidTitles: ['Office basics'] });

    expect(response.status).toBe(201);
    expect(JSON.stringify(aiReply.mock.calls[0])).toContain('Office basics');
    const tooMany = await agent.post('/api/content/generate').send({ kind: 'reading-gapfill', level: 'B1', avoidTitles: Array(13).fill('x') });
    expect(tooMany.status).toBe(400);
  });

  it('asks the AI to correct invalid JSON once', async () => {
    aiReply.mockResolvedValueOnce('{"title": "Broken"}').mockResolvedValueOnce(JSON.stringify(GAPFILL));
    const agent = await signIn(app, await createUser());

    const response = await agent.post('/api/content/generate').send({ kind: 'reading-gapfill', level: 'B1' });

    expect(response.status).toBe(201);
    expect(aiReply).toHaveBeenCalledTimes(2);
    expect(aiReply.mock.calls[1][0].messages.at(-1)?.content).toMatch(/not valid/);
  });

  it('gives up with 502 after two invalid replies', async () => {
    aiReply.mockResolvedValue('not json at all');
    const agent = await signIn(app, await createUser());

    const response = await agent.post('/api/content/generate').send({ kind: 'reading-gapfill', level: 'B1' });

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('ai_invalid_output');
  });
});

describe('AI scoring', () => {
  it('scores writing, records the attempt server-side and awards XP', async () => {
    aiReply.mockResolvedValueOnce(JSON.stringify(WRITING_FEEDBACK));
    const agent = await signIn(app, await createUser({ uiLocale: 'vi' }));

    const response = await agent
      .post('/api/ai/score-writing')
      .send({ contentId: 'builtin-writing-task2-remote', response: 'Many peoples work from home now and I think it is good for them.' });

    expect(response.status).toBe(200);
    expect(response.body.feedback.overallBand).toBe(6.5);
    expect(response.body.attempt).toMatchObject({ activity: 'writing-task', skill: 'writing', score: 6.5, maxScore: 9 });
    // Feedback language follows the learner's UI language
    expect(aiReply.mock.calls[0][0].systemPrompt).toMatch(/Vietnamese/);
  });

  it('rejects scoring against the wrong kind of item', async () => {
    const agent = await signIn(app, await createUser());

    const response = await agent
      .post('/api/ai/score-writing')
      .send({ contentId: 'builtin-reading-procrastination', response: 'Some long enough response text here.' });

    expect(response.status).toBe(404);
    expect(aiReply).not.toHaveBeenCalled();
  });

  it('does not let clients record server-scored activities', async () => {
    const agent = await signIn(app, await createUser());

    const response = await agent.post('/api/attempts').send({ activity: 'writing-task', score: 9, maxScore: 9 });

    expect(response.status).toBe(400);
  });

  it('refuses to score a speaking set with no answers', async () => {
    const agent = await signIn(app, await createUser());

    const response = await agent
      .post('/api/ai/score-speaking')
      .send({ contentId: 'builtin-speaking-places', answers: [{ question: 'Q?', transcript: '' }] });

    expect(response.status).toBe(400);
    expect(aiReply).not.toHaveBeenCalled();
  });
});

describe('empty AI replies', () => {
  it('treats an empty reply as invalid output and asks again', async () => {
    const { CliProxyApiError } = await import('../services/cliproxy.js');
    aiReply.mockRejectedValueOnce(new CliProxyApiError('No text content in AI response', 500)).mockResolvedValueOnce(JSON.stringify(GAPFILL));
    const agent = await signIn(app, await createUser());

    const response = await agent.post('/api/content/generate').send({ kind: 'reading-gapfill', level: 'B1' });

    expect(response.status).toBe(201);
    expect(aiReply).toHaveBeenCalledTimes(2);
  });
});

describe('library paging, search, hide and delete', () => {
  /** Inserts AI-made gapfill items, newest last */
  async function addAi(createdBy: string, titles: string[]): Promise<string[]> {
    const rows = await db
      .insert(contentItems)
      .values(
        titles.map((title, index) => ({
          kind: 'reading-gapfill',
          skill: 'reading' as const,
          level: 'B1',
          title,
          payload: GAPFILL,
          source: 'ai' as const,
          createdBy,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        }))
      )
      .returning({ id: contentItems.id });
    return rows.map((row) => row.id);
  }
  const titlesOf = (body: { items: { title: string }[] }) => body.items.map((item) => item.title);
  const starterCount = () => SEED_ITEMS.filter((seed) => seed.kind === 'reading-gapfill').length;

  it('pages through the library without repeats and reports the total', async () => {
    const user = await createUser();
    await addAi(user.id, Array.from({ length: 15 }, (_, i) => `Set ${String(i).padStart(2, '0')}`));
    const agent = await signIn(app, user);

    const first = await agent.get('/api/content?kind=reading-gapfill&limit=10');
    const second = await agent.get('/api/content?kind=reading-gapfill&limit=10&offset=10');

    expect(first.body).toMatchObject({ total: starterCount() + 15, hasMore: true });
    expect(first.body.items).toHaveLength(10);
    expect(second.body.hasMore).toBe(false);
    const all = [...titlesOf(first.body), ...titlesOf(second.body)];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(starterCount() + 15);
    // Starter items first, then newest AI items
    expect(first.body.items[0].source).toBe('builtin');
    expect(titlesOf(first.body)[starterCount()]).toBe('Set 14');
    expect((await agent.get('/api/content?kind=reading-gapfill&limit=51')).status).toBe(400);
  });

  it('searches title and topic and treats % and _ literally', async () => {
    const user = await createUser();
    await addAi(user.id, ['Airport Chaos', 'Hotel check-in']);
    const agent = await signIn(app, user);

    expect(titlesOf((await agent.get('/api/content?kind=reading-gapfill&q=airport')).body)).toEqual(['Airport Chaos']);
    expect((await agent.get('/api/content?kind=reading-gapfill&q=%25')).body.total).toBe(0);
    expect((await agent.get('/api/content?kind=reading-gapfill&q=zzzz')).body.items).toEqual([]);
  });

  it('filters by who made an item and whether the learner did it', async () => {
    const author = await createUser();
    const other = await createUser();
    const [mineId] = await addAi(author.id, ['Mine']);
    await addAi(other.id, ['Theirs']);
    const agent = await signIn(app, author);
    await agent.post('/api/attempts').send({ activity: 'reading-quiz', contentRef: mineId, score: 5, maxScore: 10 });

    const get = async (filter: string) => titlesOf((await agent.get(`/api/content?kind=reading-gapfill&filter=${filter}`)).body);
    expect(await get('mine')).toEqual(['Mine']);
    expect(await get('done')).toEqual(['Mine']);
    expect((await get('todo')).includes('Mine')).toBe(false);
    expect((await get('ai')).sort()).toEqual(['Mine', 'Theirs']);
    expect(await get('starter')).toHaveLength(starterCount());
  });

  it('hides an item for one learner only, and shows it again on request', async () => {
    const user = await createUser();
    const [id] = await addAi(user.id, ['Hide me']);
    const agent = await signIn(app, user);
    const bystander = await signIn(app, await createUser());

    expect((await agent.post(`/api/content/${id}/hide`)).status).toBe(204);
    expect(titlesOf((await agent.get('/api/content?kind=reading-gapfill')).body)).not.toContain('Hide me');
    const hidden = await agent.get('/api/content?kind=reading-gapfill&filter=hidden');
    expect(hidden.body.items).toMatchObject([{ title: 'Hide me', hidden: true }]);
    expect(titlesOf((await bystander.get('/api/content?kind=reading-gapfill')).body)).toContain('Hide me');

    expect((await agent.delete(`/api/content/${id}/hide`)).status).toBe(204);
    expect(titlesOf((await agent.get('/api/content?kind=reading-gapfill')).body)).toContain('Hide me');
    expect((await agent.post('/api/content/nope/hide')).status).toBe(404);
  });

  it('lets an author delete an unused item, but not a starter item or someone else’s', async () => {
    const author = await createUser();
    const [mine, theirs] = [(await addAi(author.id, ['Mine']))[0], (await addAi((await createUser()).id, ['Theirs']))[0]];
    const agent = await signIn(app, author);

    const listed = await agent.get('/api/content?kind=reading-gapfill&filter=ai');
    expect(listed.body.items.find((i: { title: string }) => i.title === 'Mine').canDelete).toBe(true);
    expect(listed.body.items.find((i: { title: string }) => i.title === 'Theirs').canDelete).toBe(false);

    expect((await agent.delete(`/api/content/${theirs}`)).status).toBe(403);
    expect((await agent.delete('/api/content/builtin-gapfill-office')).status).toBe(403);
    expect((await agent.delete(`/api/content/${mine}`)).status).toBe(204);
    expect((await agent.get(`/api/content/${mine}`)).status).toBe(404);
  });

  it('stops the author deleting once another learner practised the item; an admin still can', async () => {
    const author = await createUser();
    const [id] = await addAi(author.id, ['Popular']);
    const authorAgent = await signIn(app, author);
    const learner = await signIn(app, await createUser());
    await learner.post('/api/attempts').send({ activity: 'reading-quiz', contentRef: id, score: 5, maxScore: 10 });

    expect((await authorAgent.delete(`/api/content/${id}`)).status).toBe(403);
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    expect((await admin.delete(`/api/content/${id}`)).status).toBe(204);
  });
});
