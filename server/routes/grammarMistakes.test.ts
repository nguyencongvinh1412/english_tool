import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureBuiltinContent } from '../content/seeds.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

const feedback = (corrections: object[]) => ({
  overallBand: 6,
  criteria: ['TR', 'CC', 'LR', 'GRA'].map((key) => ({ key, name: key, band: 6, comment: 'ok' })),
  strengths: ['Clear'],
  improvements: ['Grammar'],
  corrections,
  improvedVersion: 'Better.',
});

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await ensureBuiltinContent();
  aiReply.mockReset();
});
afterAll(closeDb);

describe('grammar mistakes', () => {
  it('links writing corrections to grammar points, drops invented ids and flags points to review now', async () => {
    const agent = await signIn(app, await createUser({ role: 'admin' }));
    const essay = 'I have went to work yesterday. She have visited Hanoi. I am agree with this and peoples work.';
    aiReply.mockResolvedValue(
      JSON.stringify(
        feedback([
          { original: 'I have went', corrected: 'I went', explanation: 'x', grammarPoint: 'past-simple' },
          { original: 'She have visited', corrected: 'She has visited', explanation: 'x', grammarPoint: 'present-perfect' },
          { original: 'peoples', corrected: 'people', explanation: 'x', grammarPoint: 'not-a-real-point' },
          { original: 'am agree', corrected: 'agree', explanation: 'x' },
        ])
      )
    );
    const scored = await agent.post('/api/ai/score-writing').send({ contentId: 'builtin-writing-task2-remote', response: essay });
    expect(scored.body.feedback.corrections.map((c: { grammarPoint?: string }) => c.grammarPoint)).toEqual(['past-simple', 'present-perfect', undefined, undefined]);
    expect(String(aiReply.mock.calls[0][0].messages[0].content)).toContain('present-perfect (Present perfect)');

    // A second essay repeats a mistake on past-simple
    await agent.post('/api/ai/score-writing').send({ contentId: 'builtin-writing-task2-remote', response: essay });
    const { mistakes } = (await agent.get('/api/grammar/mistakes')).body;
    expect(mistakes[0]).toMatchObject({ pointId: 'past-simple', count: 2, urgent: true, examples: [{ wrong: 'I have went', right: 'I went' }, expect.anything()] });
    expect(mistakes).toHaveLength(2);

    // Practising the point clears the "review now" flag
    aiReply.mockImplementation(async (request) => {
      const solver = String(request.systemPrompt).includes('expert in English grammar');
      const set = {
        items: [
          ...Array.from({ length: 4 }, (_, i) => ({ type: 'choice', prompt: `I ____ it ${i}.`, options: ['saw', 'have seen', 'see'], answerIndex: 0, explanation: { en: 'x', vi: 'x' } })),
          { type: 'gap', prompt: 'We ____ there.', answers: ['went'], explanation: { en: 'x', vi: 'x' } },
          { type: 'gap', prompt: 'They ____ home.', answers: ['left'], explanation: { en: 'x', vi: 'x' } },
        ],
      };
      return JSON.stringify(solver ? { answers: [0, 0, 0, 0, 'went', 'left'] } : set);
    });
    const set = (await agent.post('/api/grammar/past-simple/practice').send({})).body.set;
    await agent.post(`/api/grammar/past-simple/practice/${set.id}/result`).send({ correct: 6, total: 6 });
    const after = (await agent.get('/api/grammar/mistakes')).body.mistakes;
    expect(after.find((m: { pointId: string }) => m.pointId === 'past-simple').urgent).toBe(false);
  });

  it('tags wrong test answers with grammar points and records them', async () => {
    const agent = await signIn(app, await createUser());
    aiReply.mockResolvedValue(JSON.stringify({ items: [{ index: 1, point: 'present-perfect' }, { index: 2, point: null }, { index: 3, point: 'made-up' }] }));
    const res = await agent.post('/api/grammar/tag-mistakes').send({
      mistakes: [
        { prompt: 'She ____ here since 2019.', correct: 'has lived', chosen: 'lived' },
        { prompt: 'The manager will ____ the budget.', correct: 'approve', chosen: 'prove' },
        { prompt: 'He ____ a doctor.', correct: 'is' },
      ],
    });
    expect(res.body.points).toEqual(['present-perfect', null, null]);
    const { mistakes } = (await agent.get('/api/grammar/mistakes')).body;
    expect(mistakes).toEqual([expect.objectContaining({ pointId: 'present-perfect', count: 1, urgent: false, examples: [{ wrong: 'lived', right: 'has lived' }] })]);
  });

  it('answers grammar questions with links to the map and refuses other topics', async () => {
    const agent = await signIn(app, await createUser({ uiLocale: 'vi' }));
    aiReply.mockResolvedValueOnce(JSON.stringify({ onTopic: true, answer: 'Dùng "would" cho điều không có thật.', points: ['second-conditional', 'nope', 'wishes'] }));
    const answered = await agent.post('/api/grammar/ask').send({ question: 'Khi nào dùng would?' });
    expect(answered.body.onTopic).toBe(true);
    expect(answered.body.points.map((p: { id: string }) => p.id)).toEqual(['second-conditional', 'wishes']);
    expect(aiReply.mock.calls[0][0].systemPrompt).toMatch(/Vietnamese/);

    aiReply.mockResolvedValueOnce(JSON.stringify({ onTopic: false, answer: 'Mình chỉ hỗ trợ tiếng Anh.', points: ['wishes'] }));
    const off = await agent.post('/api/grammar/ask').send({ question: 'What is the capital of France?' });
    expect(off.body).toMatchObject({ onTopic: false, points: [] });
  });
});
