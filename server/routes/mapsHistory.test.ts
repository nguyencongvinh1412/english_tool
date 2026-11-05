import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { mindMapVersions } from '../db/schema.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

const node = (text: string, children: string[] = []) => ({ text, children });

describe('mind map history', () => {
  it('keeps a copy on the first edit, not on every autosave, and shows what changed', async () => {
    const agent = await signIn(app, await createUser());
    const { map } = (await agent.post('/api/maps').send({ title: 'Tenses' })).body;

    const first = await agent.put(`/api/maps/${map.id}`).send({ version: 1, doc: { root: 'root', nodes: { root: node('Tenses', ['a']), a: node('Past') } } });
    expect(first.status).toBe(200);
    // A second save straight after adds no copy
    await agent.put(`/api/maps/${map.id}`).send({ version: 2, doc: { root: 'root', nodes: { root: node('Tenses', ['a', 'b']), a: node('Past'), b: node('Perfect') } } });

    const list = (await agent.get(`/api/maps/${map.id}/versions`)).body;
    expect(list.current.version).toBe(3);
    expect(list.versions).toEqual([expect.objectContaining({ version: 1, reason: 'edit', nodeCount: 1 })]);

    const { changes } = (await agent.get(`/api/maps/${map.id}/versions/1/changes`)).body;
    expect(changes).toEqual([
      { kind: 'added', text: 'Past' },
      { kind: 'added', text: 'Perfect' },
    ]);
  });

  it('restores a copy and keeps what it replaced, and other learners cannot see it', async () => {
    const agent = await signIn(app, await createUser());
    const { map } = (await agent.post('/api/maps').send({ title: 'Tenses' })).body;
    await agent.put(`/api/maps/${map.id}`).send({ version: 1, doc: { root: 'root', nodes: { root: node('Tenses', ['a']), a: node('Past') } } });

    const restored = await agent.post(`/api/maps/${map.id}/restore`).send({ version: 1 });
    expect(restored.status).toBe(200);
    expect(Object.keys(restored.body.map.doc.nodes)).toEqual(['root']);
    const reasons = (await db.select().from(mindMapVersions).where(eq(mindMapVersions.mapId, map.id))).map((v) => v.reason).sort();
    expect(reasons).toEqual(['edit', 'restore']);

    const other = await signIn(app, await createUser());
    expect((await other.get(`/api/maps/${map.id}/versions`)).status).toBe(404);
  });
});
