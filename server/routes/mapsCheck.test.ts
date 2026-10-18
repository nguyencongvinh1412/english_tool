import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { aiUsage, grammarPoints } from '../db/schema.js';
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

const doc = {
  root: 'root',
  nodes: {
    root: { text: 'Tenses', children: ['pp', 'ps'] },
    pp: { text: 'Present perfect: used with finished time words like yesterday', note: 'have + V2', children: [], link: { kind: 'grammar', id: 'present-perfect' } },
    ps: { text: 'Past simple', children: [] },
  },
};

async function seedMap(agent: Awaited<ReturnType<typeof signIn>>) {
  await db.insert(grammarPoints).values({
    id: 'present-perfect',
    status: 'reviewed',
    content: { summary: { en: 'Links the past to now; never used with finished time words.', vi: 'x' }, forms: [{ label: { en: 'Affirmative', vi: 'x' }, pattern: 'have/has + past participle', example: { en: 'I have lived here.', vi: 'x' } }], uses: [{ title: { en: 'Unfinished time', vi: 'x' }, explanation: { en: 'x', vi: 'x' }, examples: [] }] },
  });
  const { id } = (await agent.post('/api/maps').send({ title: 'Tenses' })).body.map;
  await agent.put(`/api/maps/${id}`).send({ doc, version: 1 });
  return id as string;
}

const issuesReply = (issues: object[]) => JSON.stringify({ issues });
const verdictsReply = (verdicts: object[]) => JSON.stringify({ verdicts });

describe('AI map check', () => {
  it('lists issues a second pass confirms, checked against the reference cards', async () => {
    const agent = await signIn(app, await createUser({ role: 'admin' }));
    const id = await seedMap(agent);
    aiReply
      .mockResolvedValueOnce(
        issuesReply([
          { nodeId: 'pp', kind: 'wrong', severity: 'error', problem: 'Present perfect is not used with yesterday.', suggestion: 'Use past simple with finished time words.', fix: { text: 'Present perfect: used with unfinished time (since, for)', grammar: 'present-perfect' } },
          { nodeId: 'ps', kind: 'unclear', severity: 'tip', problem: 'Too short.', suggestion: 'Add an example.', fix: { grammar: 'made-up-point' } },
          { nodeId: 'ghost', kind: 'wrong', severity: 'error', problem: 'About a node that does not exist.', suggestion: '' },
        ])
      )
      // The reviewer keeps the first and drops the second
      .mockResolvedValueOnce(verdictsReply([{ index: 0, keep: true }, { index: 1, keep: false, reason: 'taste' }]));

    const { status, body } = await agent.post(`/api/maps/${id}/check`).send({});

    expect(status).toBe(200);
    expect(body.version).toBe(2);
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]).toMatchObject({
      id: 'i1',
      nodeId: 'pp',
      nodeText: doc.nodes.pp.text,
      kind: 'wrong',
      severity: 'error',
      fix: { text: 'Present perfect: used with unfinished time (since, for)', link: { kind: 'grammar', id: 'present-perfect' } },
    });
    // Pass one saw the map and the reference card of the linked point
    const firstPrompt = String(aiReply.mock.calls[0][0].messages[0].content);
    expect(firstPrompt).toContain('"id":"pp"');
    expect(firstPrompt).toContain('[present-perfect]');
    expect(firstPrompt).toContain('have/has + past participle');
    // Two requests were counted
    const [usage] = await db.select().from(aiUsage);
    expect(usage.requestCount).toBe(2);
    // The check never changes the map
    expect((await agent.get(`/api/maps/${id}`)).body.map.version).toBe(2);
  });

  it('skips the second pass when nothing was found', async () => {
    const agent = await signIn(app, await createUser());
    const id = await seedMap(agent);
    aiReply.mockResolvedValueOnce(issuesReply([]));

    const { body } = await agent.post(`/api/maps/${id}/check`).send({});

    expect(body.issues).toEqual([]);
    expect(aiReply).toHaveBeenCalledTimes(1);
  });

  it('drops every issue the reviewer does not confirm', async () => {
    const agent = await signIn(app, await createUser());
    const id = await seedMap(agent);
    aiReply
      .mockResolvedValueOnce(issuesReply([{ nodeId: 'ps', kind: 'unclear', severity: 'tip', problem: 'Meh.', suggestion: '' }]))
      .mockResolvedValueOnce(verdictsReply([]));

    expect((await agent.post(`/api/maps/${id}/check`).send({})).body.issues).toEqual([]);
  });

  it('keeps other learners out and rejects unusable output', async () => {
    const owner = await signIn(app, await createUser({ role: 'admin' }));
    const other = await signIn(app, await createUser());
    const id = await seedMap(owner);

    expect((await other.post(`/api/maps/${id}/check`).send({})).status).toBe(404);
    expect((await owner.post('/api/maps/5a0b9d5e-3a0a-4d83-8a5b-0b2f6a2f1c11/check').send({})).status).toBe(404);
    aiReply.mockResolvedValue('I could not check this.');
    const bad = await owner.post(`/api/maps/${id}/check`).send({});
    expect(bad.status).toBe(502);
    expect(bad.body.code).toBe('ai_invalid_output');
  });

  it('lets the AI fix the listed problems through a proposal', async () => {
    const agent = await signIn(app, await createUser());
    const id = await seedMap(agent);
    aiReply.mockResolvedValue(JSON.stringify({ title: 'Tenses', summary: 'Fixed the present perfect note.', root: { id: 'root', text: 'Tenses', children: [{ id: 'pp', text: 'Present perfect: unfinished time', grammar: 'present-perfect', children: [] }, { id: 'ps', text: 'Past simple', children: [] }] } }));

    const { status, body } = await agent.post('/api/maps/propose').send({ intent: 'update', mapId: id, issues: [{ nodeId: 'pp', problem: 'Not used with yesterday.', suggestion: 'Say unfinished time.' }] });

    expect(status).toBe(201);
    const prompt = String(aiReply.mock.calls[0][0].messages[0].content);
    expect(prompt).toContain('Problems to fix');
    expect(prompt).toContain('Not used with yesterday.');
    expect(prompt).not.toContain('bring the map up to date');
    expect(body.draft.counts).toMatchObject({ changed: 1, added: 0, removed: 0 });
  });
});
