import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { placementQuestions } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { wellFormed } from '../placement/ai.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

const q = (n: number, answerIndex = 0) => ({ prompt: `Question ${n}: choose ____ .`, options: [`a${n}`, `b${n}`, `c${n}`, `d${n}`], answerIndex });
const reply = (value: unknown) => '```json\n' + JSON.stringify(value) + '\n```';

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await db.delete(placementQuestions);
  aiReply.mockReset();
});
afterAll(closeDb);

describe('wellFormed', () => {
  it('rejects repeated options and repeated prompts', () => {
    const taken = new Set<string>();
    expect(wellFormed({ prompt: 'One', options: ['a', 'b', 'c', 'd'], answerIndex: 0 }, taken)).toBe(true);
    expect(wellFormed({ prompt: 'one', options: ['a', 'b', 'c', 'd'], answerIndex: 0 }, taken)).toBe(false);
    expect(wellFormed({ prompt: 'Two', options: ['a', 'A', 'c', 'd'], answerIndex: 0 }, taken)).toBe(false);
  });
});

describe('POST /api/admin/placement/generate', () => {
  it('is for admins only', async () => {
    const agent = await signIn(app, await createUser());
    expect((await agent.post('/api/admin/placement/generate').send({ skill: 'grammar', level: 'C1' })).status).toBe(403);
  });

  it('rejects a skill or level it cannot write', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    expect((await admin.post('/api/admin/placement/generate').send({ skill: 'vocabulary', level: 'C1' })).status).toBe(400);
    expect((await admin.post('/api/admin/placement/generate').send({ skill: 'grammar', level: 'D9' })).status).toBe(400);
  });

  it('stores only the questions the solver agreed with, as drafts', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const batch = [q(1), q(2), q(3), q(4), q(5), q(6)];
    aiReply.mockResolvedValueOnce(reply({ questions: batch }));
    // The solver agrees on all but question 4 and 6
    aiReply.mockResolvedValueOnce(reply({ answers: [0, 0, 0, 2, 0, -1] }));

    const { status, body } = await admin.post('/api/admin/placement/generate').send({ skill: 'grammar', level: 'C1' });
    expect(status).toBe(200);
    expect(body).toMatchObject({ skill: 'grammar', level: 'C1', written: 6, dropped: 2, stored: 4 });

    const rows = await db.select().from(placementQuestions);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.status === 'draft' && r.source === 'ai' && r.level === 'C1' && r.skill === 'grammar')).toBe(true);
    // The solver was never shown the key
    const solverCall = aiReply.mock.calls[1][0];
    expect(JSON.stringify(solverCall)).not.toContain('answerIndex');
  });

  it('keeps the passage with reading questions and the transcript with listening questions', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    aiReply.mockResolvedValueOnce(reply({ passage: 'A short passage about a garden.', questions: [q(1), q(2), q(3), q(4)] }));
    aiReply.mockResolvedValueOnce(reply({ answers: [0, 0, 0, 0] }));
    await admin.post('/api/admin/placement/generate').send({ skill: 'reading', level: 'A1' });
    aiReply.mockResolvedValueOnce(reply({ script: ['Hello there.', 'Your train leaves at six.', 'Please wait on platform two.'], questions: [q(5), q(6), q(7), q(8)] }));
    aiReply.mockResolvedValueOnce(reply({ answers: [0, 0, 0, 0] }));
    await admin.post('/api/admin/placement/generate').send({ skill: 'listening', level: 'A1' });

    const reading = await db.select().from(placementQuestions).where(eq(placementQuestions.skill, 'reading'));
    const listening = await db.select().from(placementQuestions).where(eq(placementQuestions.skill, 'listening'));
    expect(reading).toHaveLength(4);
    expect(reading[0].context).toBe('A short passage about a garden.');
    expect(listening[0].context).toBe('Hello there.\nYour train leaves at six.\nPlease wait on platform two.');
  });

  it('drafts are not asked until approved, and approval is per skill and level', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    aiReply.mockResolvedValueOnce(reply({ questions: [q(1), q(2), q(3), q(4), q(5), q(6)] }));
    aiReply.mockResolvedValueOnce(reply({ answers: [0, 0, 0, 0, 0, 0] }));
    await admin.post('/api/admin/placement/generate').send({ skill: 'grammar', level: 'C2' });

    let cov = (await admin.get('/api/admin/placement/coverage')).body;
    expect(cov.coverage.grammar?.C2 ?? 0).toBe(0);
    expect(cov.drafts.grammar.C2).toBe(6);

    expect((await admin.post('/api/admin/placement/approve').send({ skill: 'grammar', level: 'C1' })).body.approved).toBe(0);
    expect((await admin.post('/api/admin/placement/approve').send({ skill: 'grammar', level: 'C2' })).body.approved).toBe(6);
    cov = (await admin.get('/api/admin/placement/coverage')).body;
    expect(cov.coverage.grammar.C2).toBe(6);
    expect(cov.drafts.grammar?.C2 ?? 0).toBe(0);
  });

  it('answers 502 when the AI sends something unusable, storing nothing', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    aiReply.mockResolvedValue('I cannot do that.');
    const res = await admin.post('/api/admin/placement/generate').send({ skill: 'grammar', level: 'B1' });
    expect(res.status).toBe(502);
    expect(await db.select().from(placementQuestions)).toHaveLength(0);
  });
});

describe('POST /api/placement/productive', () => {
  const sample = (words: number) => Array.from({ length: words }, (_, i) => `word${i}`).join(' ');

  it('places a written sample, saves it with low confidence and keeps the other levels', async () => {
    aiReply.mockResolvedValue(reply({ level: 'B1', reason: 'Connected sentences with a few errors.' }));
    const agent = await signIn(app, await createUser());
    const res = await agent.post('/api/placement/productive').send({ skill: 'writing', text: sample(50) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ level: 'B1' });
    const latest = (await agent.get('/api/placement')).body.latest;
    expect(latest.levels.writing).toEqual({ level: 'B1', confidence: 'low' });
    // The sample reaches the AI as data inside tags
    expect(String(aiReply.mock.calls[0][0].messages[0].content)).toContain('<sample>');
  });

  it('refuses a sample that is too short without calling the AI, and a skill that is not Writing or Speaking', async () => {
    const agent = await signIn(app, await createUser());
    const short = await agent.post('/api/placement/productive').send({ skill: 'speaking', text: sample(10) });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe('too_short');
    expect((await agent.post('/api/placement/productive').send({ skill: 'reading', text: sample(60) })).status).toBe(400);
    expect(aiReply).not.toHaveBeenCalled();
  });
});
