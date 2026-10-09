import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { contentItems, examSessions } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { estimateScaled, PART_CONFIG, TOEIC_PARTS, type ToeicPart } from '../exams/toeic.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

/** Every correct answer is option 1 in these fixtures */
const mcq = (prompt: string) => ({ type: 'mcq', prompt, options: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'why' });

const PAYLOADS: Record<ToeicPart, () => object> = {
  2: () => ({ items: Array.from({ length: 5 }, (_, i) => ({ question: `Q${i}?`, options: ['x', 'y', 'z'], answerIndex: 1, explanation: 'why' })) }),
  3: () => ({
    speakers: { A: { name: 'Ann', gender: 'female' }, B: { name: 'Ben', gender: 'male' } },
    script: Array.from({ length: 6 }, (_, i) => ({ speaker: i % 2 ? 'B' : 'A', text: `Line ${i}` })),
    questions: [mcq('1'), mcq('2'), mcq('3')],
  }),
  4: () => ({
    talkType: 'voicemail',
    speakers: { A: { name: 'Ann', gender: 'female' } },
    script: Array.from({ length: 4 }, (_, i) => ({ speaker: 'A', text: `Line ${i}` })),
    questions: [mcq('1'), mcq('2'), mcq('3')],
  }),
  5: () => ({ questions: Array.from({ length: 10 }, (_, i) => mcq(`Sentence ${i} ____ here.`)) }),
  6: () => ({ title: 'Memo', passage: 'A [1] B [2] C [3] D [4].', questions: [1, 2, 3, 4].map((n) => mcq(`Blank [${n}]`)) }),
  7: () => ({ passages: [{ kind: 'email', title: 'Hi', text: 'Text' }], questions: [mcq('1'), mcq('2'), mcq('3'), mcq('4')] }),
};

/**
 * Inserts bank groups for a part
 */
async function seedGroups(part: ToeicPart, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await db.insert(contentItems).values({
      kind: PART_CONFIG[part].kind,
      skill: PART_CONFIG[part].section,
      exam: 'toeic',
      part: `toeic-${part}`,
      level: 'B1',
      title: `Part ${part} #${i}`,
      payload: PAYLOADS[part](),
      source: 'ai',
    });
  }
}

/**
 * Fake AI: generation requests get the part payload; verification requests "solve" with the given answers
 */
function fakeAi(part: ToeicPart, solverAnswer: () => number = () => 1) {
  aiReply.mockImplementation(async (request) => {
    if (request.systemPrompt?.includes('expert TOEIC test-taker')) {
      const count = part === 2 ? 5 : part === 5 ? 10 : part === 6 || part === 7 ? 4 : 3;
      return JSON.stringify({ answers: Array.from({ length: count }, solverAnswer) });
    }
    return JSON.stringify(PAYLOADS[part]());
  });
}

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
});
afterAll(closeDb);

describe('starting a test', () => {
  it('starts a mini test with every part and hides the answers', async () => {
    for (const part of TOEIC_PARTS) await seedGroups(part, 2);
    const agent = await signIn(app, await createUser());

    const response = await agent.post('/api/exams/toeic/sessions').send({ mode: 'mini' });

    expect(response.status).toBe(201);
    const session = response.body.session;
    expect(session.sections.map((s: { part: number }) => s.part)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(session.timeLimitSec).toBe(25 * 60);
    const serialized = JSON.stringify(session.sections);
    expect(serialized).not.toContain('answerIndex');
    expect(serialized).not.toContain('explanation');
  });

  it('starts a single part with the official question count and time', async () => {
    await seedGroups(5, 3);
    const agent = await signIn(app, await createUser());

    const response = await agent.post('/api/exams/toeic/sessions').send({ mode: 'part', part: 5 });

    expect(response.status).toBe(201);
    expect(response.body.session.sections).toHaveLength(1);
    expect(response.body.session.sections[0].groups).toHaveLength(3);
    expect(response.body.session.timeLimitSec).toBe(PART_CONFIG[5].partMinutes * 60);
  });

  it('refuses a full test when the bank is far too small', async () => {
    const agent = await signIn(app, await createUser());

    const response = await agent.post('/api/exams/toeic/sessions').send({ mode: 'full' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('bank_insufficient');
    expect(response.body.missing).toMatchObject({ 3: 13, 7: 14 });
    expect(aiReply).not.toHaveBeenCalled();
  });

  it('generates a few missing groups on the spot', async () => {
    fakeAi(5);
    const agent = await signIn(app, await createUser({ dailyAiLimit: 20 }));

    const response = await agent.post('/api/exams/toeic/sessions').send({ mode: 'part', part: 5 });

    expect(response.status).toBe(201);
    // Three groups, each generated and then verified
    expect(aiReply).toHaveBeenCalledTimes(6);
    expect((await agent.get('/api/auth/me')).body.user.aiQuota.used).toBe(6);
  });

  it('prefers groups the learner has not seen', async () => {
    await seedGroups(5, 6);
    const agent = await signIn(app, await createUser());

    const first = await agent.post('/api/exams/toeic/sessions').send({ mode: 'part', part: 5 });
    const second = await agent.post('/api/exams/toeic/sessions').send({ mode: 'part', part: 5 });

    const ids = (r: typeof first) => r.body.session.sections[0].groups.map((g: { id: string }) => g.id);
    expect(ids(first).filter((id: string) => ids(second).includes(id))).toEqual([]);
  });

  it('keeps exam groups out of the practice library', async () => {
    await seedGroups(5, 1);
    const [group] = await db.select().from(contentItems);
    const agent = await signIn(app, await createUser());

    expect((await agent.get(`/api/content/${group.id}`)).status).toBe(404);
    expect((await agent.get('/api/content?kind=toeic-p5')).status).toBe(400);
  });
});

describe('taking and submitting a test', () => {
  it('autosaves, scores on submit, reveals answers and records one attempt per section', async () => {
    for (const part of TOEIC_PARTS) await seedGroups(part, 1);
    const agent = await signIn(app, await createUser());
    const { session } = (await agent.post('/api/exams/toeic/sessions').send({ mode: 'mini' })).body;

    // Answer every listening question correctly and every reading question wrong
    const answers: Record<string, number> = {};
    for (const section of session.sections) {
      for (const group of section.groups) {
        const count = section.part === 2 ? group.payload.items.length : group.payload.questions.length;
        for (let i = 0; i < count; i++) answers[`${group.id}:${i}`] = section.section === 'listening' ? 1 : 0;
      }
    }
    const firstQuestion = Object.keys(answers)[0];

    expect((await agent.patch(`/api/exams/sessions/${session.id}`).send({ answers, flags: [firstQuestion] })).status).toBe(200);
    const resumed = (await agent.get(`/api/exams/sessions/${session.id}`)).body.session;
    expect(resumed.answers[firstQuestion]).toBe(1);
    expect(resumed.flags).toEqual([firstQuestion]);

    const submitted = await agent.post(`/api/exams/sessions/${session.id}/submit`);
    expect(submitted.status).toBe(200);
    const { result } = submitted.body.session;
    expect(result.sections.listening).toEqual({ correct: 11, total: 11, scaled: 495 });
    expect(result.sections.reading).toMatchObject({ correct: 0, total: 18, scaled: 5 });
    expect(result.totalScaled).toBe(500);
    expect(JSON.stringify(submitted.body.session.sections)).toContain('answerIndex');

    const progress = (await agent.get('/api/progress/summary')).body;
    expect(progress.recent.map((a: { activity: string }) => a.activity).sort()).toEqual(['toeic-listening', 'toeic-reading']);

    // A second submit changes nothing and awards no XP
    const again = await agent.post(`/api/exams/sessions/${session.id}/submit`);
    expect(again.body.xpEarned).toBe(0);
    expect((await agent.get('/api/progress/summary')).body.attemptsTotal).toBe(2);
    expect((await agent.patch(`/api/exams/sessions/${session.id}`).send({ answers: {} })).status).toBe(409);
  });

  it('auto-submits an overdue test and rejects late answers', async () => {
    for (const part of TOEIC_PARTS) await seedGroups(part, 1);
    const agent = await signIn(app, await createUser());
    const { session } = (await agent.post('/api/exams/toeic/sessions').send({ mode: 'mini' })).body;
    await db
      .update(examSessions)
      .set({ startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(examSessions.id, session.id));

    expect((await agent.patch(`/api/exams/sessions/${session.id}`).send({ answers: {} })).status).toBe(409);
    const view = (await agent.get(`/api/exams/sessions/${session.id}`)).body.session;
    expect(view.status).toBe('submitted');
  });

  it('never shows one learner another learner’s test', async () => {
    for (const part of TOEIC_PARTS) await seedGroups(part, 1);
    const owner = await signIn(app, await createUser());
    const { session } = (await owner.post('/api/exams/toeic/sessions').send({ mode: 'mini' })).body;
    const other = await signIn(app, await createUser());

    expect((await other.get(`/api/exams/sessions/${session.id}`)).status).toBe(404);
    expect((await other.post(`/api/exams/sessions/${session.id}/submit`)).status).toBe(404);
  });
});

describe('estimateScaled', () => {
  it('maps the share of correct answers onto 5-495 in steps of 5', () => {
    expect(estimateScaled(0, 100)).toBe(5);
    expect(estimateScaled(100, 100)).toBe(495);
    expect(estimateScaled(50, 100)).toBe(250);
    expect(estimateScaled(0, 0)).toBe(0);
  });
});

describe('admin exam bank', () => {
  it('reports bank size and fills a part', async () => {
    fakeAi(6);
    const admin = await signIn(app, await createUser({ role: 'admin' }));

    const filled = await admin.post('/api/admin/exam-bank/fill').send({ part: 6, count: 2 });
    expect(filled.status).toBe(201);
    expect(filled.body).toEqual({ created: 2, failed: 0 });

    const bank = await admin.get('/api/admin/exam-bank');
    expect(bank.body.parts.find((p: { part: number }) => p.part === 6)).toMatchObject({ groups: 2, fullTestGroups: 4 });
  });

  it('rejects groups whose answer key an independent solve disagrees with', async () => {
    fakeAi(6, () => 2);
    const admin = await signIn(app, await createUser({ role: 'admin' }));

    const response = await admin.post('/api/admin/exam-bank/fill').send({ part: 6, count: 1 });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ created: 0, failed: 1 });
    // Two rounds of generate + verify, then give up
    expect(aiReply).toHaveBeenCalledTimes(4);
    expect(await db.select().from(contentItems)).toHaveLength(0);
  });

  it('keeps a group once a regenerated version passes the check', async () => {
    let verifyCalls = 0;
    fakeAi(6, () => 1);
    const passing = aiReply.getMockImplementation()!;
    aiReply.mockImplementation(async (request) => {
      if (request.systemPrompt?.includes('expert TOEIC test-taker') && verifyCalls++ === 0) {
        return JSON.stringify({ answers: [1, 1, 0, 1] });
      }
      return passing(request);
    });
    const admin = await signIn(app, await createUser({ role: 'admin' }));

    const response = await admin.post('/api/admin/exam-bank/fill').send({ part: 6, count: 1 });

    expect(response.body).toEqual({ created: 1, failed: 0 });
  });

  it('is admin-only', async () => {
    const learner = await signIn(app, await createUser());
    expect((await learner.get('/api/admin/exam-bank')).status).toBe(403);
  });
});

