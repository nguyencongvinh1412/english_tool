import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureGrammar } from '../grammar/data.js';
import { schedulePoint, NEW_POINT } from '../grammar/practice.js';
import { batchSizes, splitCount } from '../grammar/drill.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);
const bi = (en: string) => ({ en, vi: `${en} (vi)` });

const draft = (summary: string) => ({
  summary: bi(summary),
  forms: [{ label: bi('Affirmative'), pattern: 'S + have/has + V3', example: { en: 'I have finished.', vi: 'Tôi đã xong.' } }],
  uses: [{ title: bi('Result now'), explanation: bi('A past action with a result now.'), examples: [{ en: 'I have lost my keys.', vi: 'Tôi làm mất chìa khoá rồi.' }] }],
  signals: ['already', 'yet'],
  mistakes: [{ wrong: 'I have seen him yesterday.', right: 'I saw him yesterday.', why: bi('Finished time needs the past simple.') }],
  contrastNotes: [{ with: 'past-simple', note: bi('Past simple has a finished time.') }],
});

let dir = '';
beforeAll(async () => {
  await runMigrations();
  dir = await mkdtemp(path.join(tmpdir(), 'grammar-'));
});
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
  await writeFile(path.join(dir, 'present-perfect.json'), JSON.stringify(draft('Version one')));
  await ensureGrammar(dir);
});
afterAll(closeDb);

describe('grammar map', () => {
  it('serves the map with links and a point card with what comes before and after', async () => {
    const agent = await signIn(app, await createUser());
    const map = (await agent.get('/api/grammar')).body;
    expect(map.clusters.length).toBeGreaterThan(10);
    expect(map.points.find((p: { id: string }) => p.id === 'present-perfect')).toMatchObject({ ready: true, status: 'draft', hasTimeline: true, signals: ['already', 'yet'] });
    expect(map.points.find((p: { id: string }) => p.id === 'past-simple')).toMatchObject({ ready: false, summary: null });
    expect(map.edges).toContainEqual({ from: 'past-simple', to: 'present-perfect', kind: 'builds' });

    const card = (await agent.get('/api/grammar/present-perfect')).body.point;
    expect(card.content.summary.en).toBe('Version one');
    expect(card.builds.map((l: { id: string }) => l.id)).toEqual(['past-simple']);
    expect(card.leadsTo.map((l: { id: string }) => l.id)).toContain('past-perfect');
    expect(card.contrasts.map((l: { id: string }) => l.id)).toEqual(expect.arrayContaining(['past-simple', 'present-perfect-continuous']));
    expect((await agent.get('/api/grammar/nope')).status).toBe(404);
  });

  it('keeps admin edits when the draft file changes, and offers fresh AI drafts', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    // An unedited point follows the draft file
    await writeFile(path.join(dir, 'present-perfect.json'), JSON.stringify(draft('Version two')));
    expect(await ensureGrammar(dir)).toBe(1);

    const saved = await admin.put('/api/admin/grammar/present-perfect').send({ content: draft('Edited by admin'), status: 'reviewed' });
    expect(saved.status).toBe(200);
    await writeFile(path.join(dir, 'present-perfect.json'), JSON.stringify(draft('Version three')));
    expect(await ensureGrammar(dir)).toBe(0);
    const card = (await admin.get('/api/grammar/present-perfect')).body.point;
    expect(card).toMatchObject({ status: 'reviewed', content: { summary: { en: 'Edited by admin' } } });

    const list = (await admin.get('/api/admin/grammar')).body.points;
    expect(list.find((p: { id: string }) => p.id === 'present-perfect')).toMatchObject({ status: 'reviewed', edited: true });

    aiReply.mockResolvedValue(JSON.stringify(draft('Fresh AI draft')));
    const fresh = await admin.post('/api/admin/grammar/present-perfect/draft').send({});
    expect(fresh.body.content.summary.en).toBe('Fresh AI draft');

    const learner = await signIn(app, await createUser());
    expect((await learner.put('/api/admin/grammar/present-perfect').send({ content: draft('x'), status: 'draft' })).status).toBe(403);
  });

  it('generates checked practice, schedules the point from the score and serves new sets next time', async () => {
    // An admin has no daily AI limit; each generated set takes two AI calls
    const user = await createUser({ role: 'admin' });
    const agent = await signIn(app, user);
    const set = {
      items: [
        ...Array.from({ length: 4 }, (_, i) => ({ type: 'choice', prompt: `I ____ there ${i}.`, options: ['have been', 'was', 'am'], answerIndex: 0, explanation: bi('why') })),
        { type: 'gap', prompt: 'She ____ to Paris.', hint: '(go)', answers: ['has gone', "'s gone"], explanation: bi('why') },
        { type: 'gap', prompt: 'We ____ yet.', answers: ["haven't finished", 'have not finished'], explanation: bi('why') },
      ],
    };
    aiReply.mockImplementation(async (request) =>
      JSON.stringify(String(request.systemPrompt).includes('expert in English grammar') ? { answers: [0, 0, 0, 0, "'s gone", 'have not finished'] } : set)
    );

    const first = (await agent.post('/api/grammar/present-perfect/practice').send({})).body.set;
    expect(first.items).toHaveLength(6);
    expect(aiReply).toHaveBeenCalledTimes(2);

    const result = await agent.post(`/api/grammar/present-perfect/practice/${first.id}/result`).send({ correct: 6, total: 6, durationSec: 90 });
    expect(result.body.progress).toMatchObject({ pointId: 'present-perfect', mastery: 'learning', lastScore: 1 });
    expect(result.body.xpEarned).toBeGreaterThan(0);

    const progress = (await agent.get('/api/grammar/progress')).body.points;
    expect(progress).toEqual([expect.objectContaining({ pointId: 'present-perfect', mastery: 'learning', due: false })]);

    // The set is done: the next practice is a new one
    const second = (await agent.post('/api/grammar/present-perfect/practice').send({})).body.set;
    expect(second.id).not.toBe(first.id);
    // Another learner gets the stored set without a new generation
    aiReply.mockClear();
    const other = await signIn(app, await createUser());
    expect((await other.post('/api/grammar/present-perfect/practice').send({})).body.set.id).toBeDefined();
    expect(aiReply).not.toHaveBeenCalled();
  });

  it('schedules weak scores tomorrow and good ones further away', () => {
    const now = new Date('2026-10-14T00:00:00Z');
    expect(schedulePoint(NEW_POINT, 0.4, now)).toMatchObject({ intervalDays: 1, state: 'learning' });
    const good = schedulePoint(NEW_POINT, 1, now);
    expect(good.intervalDays).toBe(3);
    const better = schedulePoint(good, 1, now);
    expect(better.intervalDays).toBeCloseTo(7.7, 1);
    expect(better.state).toBe('review');
    expect(schedulePoint(better, 0.3, now)).toMatchObject({ intervalDays: 1, lapses: 1 });
  });
});

describe('grammar drill', () => {
  let counter = 0;
  /** Writes the asked number of questions (a third fill-in) and solves them as written */
  const mockDrillAi = () => {
    counter = 0;
    aiReply.mockImplementation(async (request) => {
      const content = String(request.messages[0].content);
      if (String(request.systemPrompt).includes('expert in English grammar')) {
        return JSON.stringify({ answers: [...content.matchAll(/^\d+\. \[(choice|fill-in)\]/gm)].map((m) => (m[1] === 'choice' ? 0 : 'x')) });
      }
      const size = Number(/EXACTLY (\d+) items/.exec(content)?.[1]);
      const gaps = Math.ceil(size / 3);
      return JSON.stringify({
        items: Array.from({ length: size }, (_, i) =>
          i < gaps
            ? { type: 'gap', prompt: `Sentence ${++counter} ____ here.`, answers: ['x'], explanation: bi('why') }
            : { type: 'choice', prompt: `Sentence ${++counter} ____ there.`, options: ['a', 'b', 'c'], answerIndex: 0, explanation: bi('why') }
        ),
      });
    });
  };

  it('shares questions over points and splits long lists', () => {
    expect(splitCount(10, 3)).toEqual([4, 3, 3]);
    expect(batchSizes(30)).toEqual([15, 15]);
    expect(batchSizes(16)).toEqual([8, 8]);
    expect(() => splitCount(10, 4)).toThrow(/at least 3/);
  });

  it('builds a drill from several points and scores each point on its own', async () => {
    mockDrillAi();
    const agent = await signIn(app, await createUser({ role: 'admin' }));
    const { body, status } = await agent.post('/api/grammar/drill').send({
      targets: [{ pointId: 'present-perfect', uses: [0] }, { pointId: 'past-simple' }],
      count: 10,
    });
    expect(status).toBe(200);
    expect(body.drill.items).toHaveLength(10);
    const ids = body.drill.items.map((i: { pointId: string }) => i.pointId);
    expect(ids.filter((id: string) => id === 'present-perfect')).toHaveLength(5);
    expect(ids.filter((id: string) => id === 'past-simple')).toHaveLength(5);
    // The chosen use is named to the AI
    expect(String(aiReply.mock.calls.map((c) => c[0].messages[0].content).find((c) => String(c).includes('present perfect') || String(c).includes('Present perfect')))).toContain('Result now');

    // Everything right for the first point, everything wrong for the second
    const answers = body.drill.items.map((item: { pointId: string }) => ({ correct: item.pointId === 'present-perfect', given: 'b' }));
    const result = await agent.post(`/api/grammar/drill/${body.drill.id}/result`).send({ answers, durationSec: 120 });
    expect(result.status).toBe(200);
    expect(result.body.xpEarned).toBeGreaterThan(0);
    expect(result.body.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pointId: 'present-perfect', correct: 5, total: 5, lastScore: 1 }),
        expect.objectContaining({ pointId: 'past-simple', correct: 0, total: 5, lastScore: 0 }),
      ])
    );
    const progress = (await agent.get('/api/grammar/progress')).body.points;
    expect(progress.find((p: { pointId: string }) => p.pointId === 'past-simple')).toMatchObject({ mastery: 'learning' });
    const mistakes = (await agent.get('/api/grammar/mistakes')).body.mistakes;
    expect(mistakes).toEqual([expect.objectContaining({ pointId: 'past-simple', count: 5 })]);
  });

  it('can use questions that already exist, with no AI, and says so when there are too few', async () => {
    mockDrillAi();
    const agent = await signIn(app, await createUser({ role: 'admin' }));
    const targets = [{ pointId: 'present-perfect' }, { pointId: 'past-simple' }];

    // Nothing exists yet: no AI call and a clear refusal
    aiReply.mockClear();
    const none = await agent.post('/api/grammar/drill').send({ targets, count: 10, ai: false });
    expect(none.status).toBe(409);
    expect(none.body.code).toBe('not_enough_existing');
    expect(aiReply).not.toHaveBeenCalled();

    // After a drill written by the AI, the same questions can be used again without it
    const first = await agent.post('/api/grammar/drill').send({ targets, count: 10 });
    expect(first.status).toBe(200);
    aiReply.mockClear();
    const again = await agent.post('/api/grammar/drill').send({ targets, count: 10, ai: false });
    expect(again.status).toBe(200);
    expect(aiReply).not.toHaveBeenCalled();
    expect(again.body.drill.id).not.toBe(first.body.drill.id);
    expect(again.body.drill.items).toHaveLength(10);
    const prompts = new Set(first.body.drill.items.map((i: { prompt: string }) => i.prompt));
    expect(again.body.drill.items.every((i: { prompt: string }) => prompts.has(i.prompt))).toBe(true);

    // It can be scored like any drill
    const answers = again.body.drill.items.map(() => ({ correct: true }));
    expect((await agent.post(`/api/grammar/drill/${again.body.drill.id}/result`).send({ answers })).status).toBe(200);
  });

  it('rejects bad requests and keeps a drill to its owner', async () => {
    mockDrillAi();
    const agent = await signIn(app, await createUser({ role: 'admin' }));
    expect((await agent.post('/api/grammar/drill').send({ targets: [{ pointId: 'nope' }], count: 10 })).status).toBe(404);
    expect((await agent.post('/api/grammar/drill').send({ targets: [{ pointId: 'present-perfect' }], count: 7 })).status).toBe(400);
    expect((await agent.post('/api/grammar/drill').send({ targets: [{ pointId: 'present-perfect' }, { pointId: 'present-perfect' }], count: 10 })).status).toBe(400);
    const four = ['present-perfect', 'past-simple', 'past-perfect', 'present-simple'].map((pointId) => ({ pointId }));
    expect((await agent.post('/api/grammar/drill').send({ targets: four, count: 10 })).status).toBe(400);

    const { drill } = (await agent.post('/api/grammar/drill').send({ targets: [{ pointId: 'present-perfect' }], count: 10 })).body;
    // One answer for every question
    expect((await agent.post(`/api/grammar/drill/${drill.id}/result`).send({ answers: [{ correct: true }] })).status).toBe(400);
    const other = await signIn(app, await createUser());
    const answers = drill.items.map(() => ({ correct: true }));
    expect((await other.post(`/api/grammar/drill/${drill.id}/result`).send({ answers })).status).toBe(404);
  });
});
