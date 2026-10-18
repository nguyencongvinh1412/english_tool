import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { grammarProgress, mindMapDrafts, mindMapVersions, vocabItems } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
});
afterAll(closeDb);

const reply = (root: object, extra: object = {}) => JSON.stringify({ title: 'AI title', summary: 'Grouped your points.', root, ...extra });
const tree = {
  text: 'Tenses',
  children: [
    { text: 'Present perfect', grammar: 'present-perfect', note: 'have + past participle', children: [] },
    { text: 'Made up', grammar: 'not-a-real-point', children: [] },
    { text: 'cat', word: 'cat', children: [] },
  ],
};

async function seed(userId: string) {
  await db.insert(vocabItems).values({ id: 'en:cat', kind: 'word', level: 'A1', position: 1, term: 'cat', meaningsEn: ['a pet'], language: 'en', deck: 'en-core-A1' });
  await db.insert(grammarProgress).values({ userId, pointId: 'present-perfect', dueAt: new Date(), intervalDays: 25, state: 'review' });
}

describe('AI mind map proposals', () => {
  it('drafts a map from what was studied without saving it, checking every link', async () => {
    const user = await createUser();
    await seed(user.id);
    const agent = await signIn(app, user);
    aiReply.mockResolvedValue(reply(tree));

    const { status, body } = await agent.post('/api/maps/propose').send({ intent: 'create', instruction: 'focus on perfect tenses' });

    expect(status).toBe(201);
    expect(body.draft).toMatchObject({ kind: 'create', mapId: null, title: 'AI title', summary: 'Grouped your points.', nodeCount: 4, changes: [] });
    const nodes = Object.values(body.draft.doc.nodes) as { text: string; link?: { kind: string; id: string } }[];
    expect(nodes.find((n) => n.text === 'Present perfect')?.link).toEqual({ kind: 'grammar', id: 'present-perfect' });
    // An invented grammar point is dropped; a word in the dictionary is linked
    expect(nodes.find((n) => n.text === 'Made up')?.link).toBeUndefined();
    expect(nodes.find((n) => n.text === 'cat')?.link).toEqual({ kind: 'word', id: 'en:cat' });
    // The AI was given the learner's real state and the instruction
    const prompt = String(aiReply.mock.calls[0][0].messages[0].content);
    expect(prompt).toContain('present-perfect | ');
    expect(prompt).toContain('mastered');
    expect(prompt).toContain('focus on perfect tenses');
    // Nothing is saved until it is confirmed
    expect((await agent.get('/api/maps')).body.maps).toEqual([]);
    expect((await agent.get(`/api/maps/drafts/${body.draft.id}`)).status).toBe(200);
  });

  it('applies a new name only when the draft is confirmed, and drops it on cancel', async () => {
    const agent = await signIn(app, await createUser());
    aiReply.mockResolvedValue(reply(tree));
    const first = (await agent.post('/api/maps/propose').send({ intent: 'topic', topic: 'perfect tenses' })).body.draft;

    const renamed = await agent.patch(`/api/maps/drafts/${first.id}`).send({ title: 'My perfect map' });
    expect(renamed.body.draft.title).toBe('My perfect map');

    // Cancel: no map, and the draft (with its new name) is gone
    expect((await agent.delete(`/api/maps/drafts/${first.id}`)).status).toBe(204);
    expect((await agent.get(`/api/maps/drafts/${first.id}`)).status).toBe(404);
    expect((await agent.post(`/api/maps/drafts/${first.id}/confirm`).send({})).status).toBe(404);
    expect((await agent.get('/api/maps')).body.maps).toEqual([]);

    // Confirm: the map takes the name
    const second = (await agent.post('/api/maps/propose').send({ intent: 'topic', topic: 'perfect tenses' })).body.draft;
    await agent.patch(`/api/maps/drafts/${second.id}`).send({ title: 'Kept name' });
    const confirmed = await agent.post(`/api/maps/drafts/${second.id}/confirm`).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.map).toMatchObject({ title: 'Kept name', version: 1 });
    expect((await agent.get('/api/maps')).body.maps).toHaveLength(1);
    expect(await db.select().from(mindMapDrafts)).toEqual([]);

    // A title sent with the confirmation wins over the draft's
    const third = (await agent.post('/api/maps/propose').send({ intent: 'topic', topic: 'perfect tenses' })).body.draft;
    expect((await agent.post(`/api/maps/drafts/${third.id}/confirm`).send({ title: 'Typed last' })).body.map.title).toBe('Typed last');
  });

  it('updates a map keeping its ids, reports what changed, and can be undone', async () => {
    const agent = await signIn(app, await createUser());
    const { id } = (await agent.post('/api/maps').send({ title: 'My map' })).body.map;
    const mine = { root: 'root', nodes: { root: { text: 'My map', children: ['a', 'b'] }, a: { text: 'Mine A', children: [] }, b: { text: 'Mine B', children: [] } } };
    await agent.put(`/api/maps/${id}`).send({ doc: mine, version: 1 });

    aiReply.mockResolvedValue(
      reply(
        {
          id: 'root',
          text: 'My map',
          children: [
            { id: 'a', text: 'Mine A (clearer)', children: [] },
            { text: 'Brand new idea', children: [] },
            // 'b' is left out: removed
          ],
        },
        { title: 'Different title' }
      )
    );
    const proposed = await agent.post('/api/maps/propose').send({ intent: 'update', mapId: id, instruction: 'tidy it up' });

    expect(proposed.status).toBe(201);
    const draft = proposed.body.draft;
    expect(draft).toMatchObject({ kind: 'update', mapId: id, mapTitle: 'My map', title: 'My map', counts: { added: 1, changed: 1, moved: 0, removed: 1 } });
    // Kept nodes keep their ids; the saved map is untouched until confirmed
    expect(draft.doc.nodes.a.text).toBe('Mine A (clearer)');
    expect((await agent.get(`/api/maps/${id}`)).body.map.version).toBe(2);
    expect((await agent.get(`/api/maps/${id}`)).body.map.doc.nodes.a.text).toBe('Mine A');
    // The AI saw the current map with its ids
    expect(String(aiReply.mock.calls[0][0].messages[0].content)).toContain('"id":"a"');

    const confirmed = await agent.post(`/api/maps/drafts/${draft.id}/confirm`).send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ previousVersion: 2, map: { version: 3, title: 'My map' } });
    expect(confirmed.body.map.doc.nodes.b).toBeUndefined();
    expect((await db.select().from(mindMapVersions).where(eq(mindMapVersions.mapId, id))).map((v) => v.version)).toEqual([2]);

    // Undo
    const restored = await agent.post(`/api/maps/${id}/restore`).send({ version: confirmed.body.previousVersion });
    expect(restored.status).toBe(200);
    expect(restored.body.map.doc.nodes.a.text).toBe('Mine A');
    expect(restored.body.map.doc.nodes.b.text).toBe('Mine B');
    expect(restored.body.map.version).toBe(4);
    expect((await agent.post(`/api/maps/${id}/restore`).send({ version: 99 })).status).toBe(404);
  });

  it('does not report untouched linked nodes as changed', async () => {
    const user = await createUser();
    await seed(user.id);
    const agent = await signIn(app, user);
    const { id } = (await agent.post('/api/maps').send({ title: 'Linked' })).body.map;
    const linked = {
      root: 'root',
      nodes: { root: { text: 'Linked', children: ['a', 'w'] }, a: { text: 'Present perfect', children: [], link: { kind: 'grammar', id: 'present-perfect' } }, w: { text: 'cat', children: [], link: { kind: 'word', id: 'en:cat' } } },
    };
    await agent.put(`/api/maps/${id}`).send({ doc: linked, version: 1 });

    // The AI echoes the map back (links as grammar id and headword) and adds one idea
    aiReply.mockResolvedValue(
      reply({ id: 'root', text: 'Linked', children: [{ id: 'a', text: 'Present perfect', grammar: 'present-perfect', children: [] }, { id: 'w', text: 'cat', word: 'cat', children: [] }, { text: 'New', children: [] }] })
    );
    const { body } = await agent.post('/api/maps/propose').send({ intent: 'update', mapId: id });

    expect(body.draft.counts).toEqual({ added: 1, changed: 0, moved: 0, removed: 0 });
  });

  it('refuses to apply a proposal made from an older version of the map', async () => {
    const agent = await signIn(app, await createUser());
    const { id } = (await agent.post('/api/maps').send({ title: 'My map' })).body.map;
    aiReply.mockResolvedValue(reply({ id: 'root', text: 'My map', children: [{ text: 'New', children: [] }] }));
    const draft = (await agent.post('/api/maps/propose').send({ intent: 'update', mapId: id })).body.draft;

    await agent.put(`/api/maps/${id}`).send({ title: 'Edited meanwhile', version: 1 });
    const confirm = await agent.post(`/api/maps/drafts/${draft.id}/confirm`).send({});

    expect(confirm.status).toBe(409);
    expect(confirm.body.code).toBe('draft_stale');
    expect((await agent.get(`/api/maps/${id}`)).body.map.title).toBe('Edited meanwhile');
  });

  it('rejects unusable AI output without leaving a draft', async () => {
    const agent = await signIn(app, await createUser());

    aiReply.mockResolvedValue('Sorry, I cannot do that.');
    const notJson = await agent.post('/api/maps/propose').send({ intent: 'create' });
    expect(notJson.status).toBe(502);
    expect(notJson.body.code).toBe('ai_invalid_output');

    // Far too deep
    let deep: object = { text: 'leaf', children: [] };
    for (let i = 0; i < 14; i++) deep = { text: `level ${i}`, children: [deep] };
    aiReply.mockResolvedValue(reply(deep));
    expect((await agent.post('/api/maps/propose').send({ intent: 'create' })).status).toBe(502);
    expect(await db.select().from(mindMapDrafts)).toEqual([]);
  });

  it('validates the request, keeps drafts private and respects the map limit', async () => {
    const owner = await signIn(app, await createUser());
    const other = await signIn(app, await createUser());
    aiReply.mockResolvedValue(reply(tree));

    expect((await owner.post('/api/maps/propose').send({ intent: 'update' })).status).toBe(400);
    expect((await owner.post('/api/maps/propose').send({ intent: 'topic' })).status).toBe(400);
    expect((await owner.post('/api/maps/propose').send({ intent: 'update', mapId: '5a0b9d5e-3a0a-4d83-8a5b-0b2f6a2f1c11' })).status).toBe(404);

    const draft = (await owner.post('/api/maps/propose').send({ intent: 'create' })).body.draft;
    expect((await other.get(`/api/maps/drafts/${draft.id}`)).status).toBe(404);
    expect((await other.patch(`/api/maps/drafts/${draft.id}`).send({ title: 'x' })).status).toBe(404);
    expect((await other.post(`/api/maps/drafts/${draft.id}/confirm`).send({})).status).toBe(404);
    expect((await other.delete(`/api/maps/drafts/${draft.id}`)).status).toBe(404);

    for (let i = 0; i < 20; i++) await owner.post('/api/maps').send({});
    const full = await owner.post('/api/maps/propose').send({ intent: 'create' });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('map_limit');
  });

  it('keeps only the newest few drafts', async () => {
    // Admins have no daily AI limit (learners are capped at three requests a day in tests)
    const agent = await signIn(app, await createUser({ role: 'admin' }));
    aiReply.mockResolvedValue(reply(tree));
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await agent.post('/api/maps/propose').send({ intent: 'create' })).body.draft.id);

    expect((await db.select().from(mindMapDrafts)).length).toBe(3);
    expect((await agent.get(`/api/maps/drafts/${ids[0]}`)).status).toBe(404);
    expect((await agent.get(`/api/maps/drafts/${ids[4]}`)).status).toBe(200);
  });
});
