import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { vocabItems } from '../db/schema.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

const doc = (nodes: Record<string, object>, root = 'root') => ({ root, nodes });
const node = (text: string, children: string[] = [], extra: object = {}) => ({ text, children, ...extra });

describe('mind maps', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/maps')).status).toBe(401);
  });

  it('creates a blank map, lists it and opens it', async () => {
    const agent = await signIn(app, await createUser());

    const created = await agent.post('/api/maps').send({ title: 'Tenses' });
    expect(created.status).toBe(201);
    expect(created.body.map).toMatchObject({ title: 'Tenses', version: 1, doc: { root: 'root', nodes: { root: { text: 'Tenses', children: [] } } } });

    const list = await agent.get('/api/maps');
    expect(list.body.maps).toEqual([expect.objectContaining({ id: created.body.map.id, title: 'Tenses', nodeCount: 1 })]);
    expect((await agent.get(`/api/maps/${created.body.map.id}`)).body.map.doc.root).toBe('root');
  });

  it('starts a map from a grammar topic with linked points', async () => {
    const agent = await signIn(app, await createUser({ uiLocale: 'vi' }));

    const { status, body } = await agent.post('/api/maps').send({ template: 'cluster', clusterId: 'tenses' });

    expect(status).toBe(201);
    expect(body.map.title).toBe('Các thì');
    const nodes = Object.values(body.map.doc.nodes) as { link?: { kind: string; id: string } }[];
    expect(nodes.length).toBeGreaterThan(10);
    expect(nodes.filter((n) => n.link?.kind === 'grammar').length).toBe(nodes.length - 1);
    expect((await agent.post('/api/maps').send({ template: 'cluster', clusterId: 'nope' })).status).toBe(400);
  });

  it('saves a document and rejects a stale version', async () => {
    const agent = await signIn(app, await createUser());
    const { id } = (await agent.post('/api/maps').send({ title: 'A' })).body.map;
    const next = doc({ root: node('A', ['b']), b: node('B', [], { note: 'hello', color: 'brand', link: { kind: 'grammar', id: 'past-simple' } }) });

    const saved = await agent.put(`/api/maps/${id}`).send({ doc: next, version: 1 });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(2);

    const stale = await agent.put(`/api/maps/${id}`).send({ title: 'Other', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'version_conflict', version: 2 });

    const renamed = await agent.put(`/api/maps/${id}`).send({ title: 'Renamed', version: 2 });
    expect(renamed.body.version).toBe(3);
    expect((await agent.get(`/api/maps/${id}`)).body.map).toMatchObject({ title: 'Renamed', version: 3 });
  });

  it('refuses documents that are not a tree', async () => {
    const agent = await signIn(app, await createUser());
    const { id } = (await agent.post('/api/maps').send({})).body.map;
    const put = (d: object) => agent.put(`/api/maps/${id}`).send({ doc: d, version: 1 });

    // Two parents, a cycle, an orphan, a missing child, a missing root, an unknown grammar point
    expect((await put(doc({ root: node('r', ['a', 'b']), a: node('a', ['c']), b: node('b', ['c']), c: node('c') }))).status).toBe(400);
    expect((await put(doc({ root: node('r', ['a']), a: node('a', ['b']), b: node('b', ['a']) }))).status).toBe(400);
    expect((await put(doc({ root: node('r'), lonely: node('x') }))).status).toBe(400);
    expect((await put(doc({ root: node('r', ['ghost']) }))).status).toBe(400);
    expect((await put(doc({ other: node('r') }))).status).toBe(400);
    expect((await put(doc({ root: node('r', ['a']), a: node('a', [], { link: { kind: 'grammar', id: 'made-up' } }) }))).status).toBe(400);
    expect((await put(doc({ root: node('   ') }))).status).toBe(400);
  });

  it('limits size and depth', async () => {
    const agent = await signIn(app, await createUser());
    const { id } = (await agent.post('/api/maps').send({})).body.map;

    const wide: Record<string, object> = { root: node('r', Array.from({ length: 300 }, (_, i) => `n${i}`)) };
    for (let i = 0; i < 300; i++) wide[`n${i}`] = node(`n${i}`);
    expect((await agent.put(`/api/maps/${id}`).send({ doc: doc(wide), version: 1 })).status).toBe(400);

    const deep: Record<string, object> = {};
    for (let i = 0; i < 13; i++) deep[i === 0 ? 'root' : `d${i}`] = node(`d${i}`, i < 12 ? [`d${i + 1}`] : []);
    expect((await agent.put(`/api/maps/${id}`).send({ doc: doc(deep), version: 1 })).status).toBe(400);
  });

  it('checks that linked words exist', async () => {
    const agent = await signIn(app, await createUser());
    await db.insert(vocabItems).values({ id: 'en:cat', kind: 'word', level: 'A1', position: 1, term: 'cat', meaningsEn: ['a pet'], language: 'en', deck: 'en-core-A1' });
    const { id } = (await agent.post('/api/maps').send({})).body.map;
    const withWord = (wordId: string) => doc({ root: node('r', ['w']), w: node('cat', [], { link: { kind: 'word', id: wordId } }) });

    expect((await agent.put(`/api/maps/${id}`).send({ doc: withWord('en:dog'), version: 1 })).status).toBe(400);
    expect((await agent.put(`/api/maps/${id}`).send({ doc: withWord('en:cat'), version: 1 })).status).toBe(200);
  });

  it('keeps maps private and caps how many a learner keeps', async () => {
    const owner = await signIn(app, await createUser());
    const other = await signIn(app, await createUser());
    const { id } = (await owner.post('/api/maps').send({ title: 'Mine' })).body.map;

    expect((await other.get(`/api/maps/${id}`)).status).toBe(404);
    expect((await other.put(`/api/maps/${id}`).send({ title: 'Stolen', version: 1 })).status).toBe(404);
    expect((await other.delete(`/api/maps/${id}`)).status).toBe(404);
    expect((await other.get('/api/maps')).body.maps).toEqual([]);

    for (let i = 0; i < 19; i++) expect((await owner.post('/api/maps').send({})).status).toBe(201);
    const over = await owner.post('/api/maps').send({});
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('map_limit');
    expect((await owner.delete(`/api/maps/${id}`)).status).toBe(204);
    expect((await owner.post('/api/maps').send({})).status).toBe(201);
  });

  it('looks up grammar points and words to link', async () => {
    const agent = await signIn(app, await createUser());
    await db.insert(vocabItems).values([
      { id: 'en:cat', kind: 'word', level: 'A1', position: 1, term: 'cat', meaningsEn: ['a pet'], language: 'en', deck: 'en-core-A1' },
      { id: 'ja:猫', kind: 'word', level: 'N5', position: 1, term: '猫', meaningsEn: ['cat'], language: 'ja' },
    ]);

    const { body } = await agent.get('/api/maps/lookup').query({ q: 'present perfect' });
    expect(body.grammar.map((g: { id: string }) => g.id)).toContain('present-perfect');
    expect((await agent.get('/api/maps/lookup').query({ q: 'ca' })).body.words).toEqual([{ id: 'en:cat', term: 'cat', level: 'A1', meaning: 'a pet' }]);
    expect((await agent.get('/api/maps/lookup').query({ q: '' })).status).toBe(400);
  });
});
