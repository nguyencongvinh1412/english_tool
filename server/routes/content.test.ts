import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
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
