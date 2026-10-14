import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureGrammar } from '../grammar/data.js';
import { schedulePoint, NEW_POINT } from '../grammar/practice.js';
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
