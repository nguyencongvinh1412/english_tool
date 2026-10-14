import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureGrammar } from '../grammar/data.js';
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
});
