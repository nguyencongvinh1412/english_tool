import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { contentItems } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ieltsListening, ieltsReading } from '../content/schemas.js';
import { objectiveBand, overallBand, writingBand } from '../exams/ielts.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

const mcq = { type: 'mcq', prompt: 'Why?', options: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'why' };
const gap = { type: 'gap', prompt: 'The hotel is called ____.', answers: ['Grand Plaza'], wordLimit: 2, explanation: 'said' };
const tfng = { type: 'tfng', prompt: 'Bees sleep.', answer: 'false', explanation: 'para 2' };

const listening = (section: number) => ({
  section,
  title: `Section ${section}`,
  context: 'You will hear a booking call.',
  speakers: { A: { name: 'Ann', gender: 'female' }, B: { name: 'Ben', gender: 'male' } },
  script: Array.from({ length: 6 }, (_, i) => ({ speaker: i % 2 ? 'B' : 'A', text: i === 2 ? 'We stay at the Grand Plaza hotel.' : `Line ${i}` })),
  questions: [gap, ...Array.from({ length: 9 }, () => mcq)],
});

const reading = () => ({
  title: 'Bees',
  paragraphs: ['Bees live in the Grand Plaza garden.', 'Para two.', 'Para three.', 'Para four.'],
  questions: [tfng, gap, ...Array.from({ length: 11 }, () => mcq)],
});

const writing = (taskType: 'ielts-task1' | 'ielts-task2') => ({
  taskType,
  title: taskType,
  instructions: 'Write.',
  prompt: 'Some people think...',
  minWords: taskType === 'ielts-task1' ? 150 : 250,
  timeMinutes: taskType === 'ielts-task1' ? 20 : 40,
});

const speaking = {
  topic: 'Hometown',
  part1: ['Where are you from?', 'Do you like it?', 'Why?'],
  part2: { cueCard: 'Describe a place', bullets: ['where', 'when', 'why'], closing: 'and explain why' },
  part3: ['Why do cities grow?', 'Is that good?'],
};

const band = (overall: number, extra: object) =>
  JSON.stringify({
    overallBand: overall,
    criteria: ['A', 'B', 'C', 'D'].map((key) => ({ key, name: key, band: overall, comment: 'ok' })),
    strengths: ['good'],
    improvements: ['more'],
    ...extra,
  });

/**
 * Seeds a complete IELTS bank
 */
async function seedBank(): Promise<void> {
  const rows = [
    ...[1, 2, 3, 4].map((n) => ({ kind: 'ielts-listening', skill: 'listening' as const, payload: listening(n) })),
    ...[1, 2, 3].map(() => ({ kind: 'ielts-reading', skill: 'reading' as const, payload: reading() })),
    { kind: 'writing-prompt', skill: 'writing' as const, payload: writing('ielts-task1') },
    { kind: 'writing-prompt', skill: 'writing' as const, payload: writing('ielts-task2') },
    { kind: 'speaking-ielts', skill: 'speaking' as const, payload: speaking },
  ];
  for (const row of rows) {
    await db.insert(contentItems).values({ ...row, exam: 'ielts', level: 'B2', title: row.kind, source: 'ai' });
  }
}

/** Fake examiner: writing gets band 6 (task 1) or 7 (task 2), speaking gets 6.5 */
function fakeExaminer() {
  aiReply.mockImplementation(async (request) => {
    const system = request.systemPrompt ?? '';
    const user = String(request.messages.at(-1)?.content ?? '');
    if (system.includes('Speaking examiner')) return band(6.5, { answers: [] });
    return band(user.includes('ielts-task1') ? 6 : 7, { corrections: [], improvedVersion: 'Better.' });
  });
}

/**
 * Polls a session until writing and speaking grading has finished
 */
async function waitForGrading(agent: TestAgent, id: string) {
  for (let i = 0; i < 50; i++) {
    const { body } = await agent.get(`/api/exams/sessions/${id}`);
    const result = body.session.result;
    if (result.writing?.status !== 'pending' && result.speaking?.status !== 'pending') return body.session;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('grading did not finish');
}

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
});
afterAll(closeDb);

describe('band conversion', () => {
  it('converts raw scores out of 40', () => {
    expect(objectiveBand('listening', 30, 40)).toBe(7);
    expect(objectiveBand('reading', 30, 40)).toBe(7);
    expect(objectiveBand('reading', 23, 40)).toBe(6);
    // Fewer questions are scaled to 40
    expect(objectiveBand('listening', 8, 10)).toBe(7.5);
    expect(objectiveBand('listening', 0, 10)).toBe(0);
  });

  it('rounds the overall band like IELTS', () => {
    expect(overallBand([6.5, 6.5, 5, 7])).toBe(6.5); // 6.25 -> 6.5
    expect(overallBand([6, 6, 6, 6.5])).toBe(6); // 6.125 -> 6
    expect(overallBand([7, 7, 7, 8])).toBe(7.5); // 7.25 -> 7.5
    expect(overallBand([6.5, 7, 7, 7.5])).toBe(7); // 7.0
    expect(overallBand([6.5, 6.5, 7, 7])).toBe(7); // 6.75 -> 7
  });

  it('weights writing task 2 double', () => {
    expect(writingBand(6, 7)).toBe(6.5);
    expect(writingBand(undefined, 7)).toBe(7);
  });
});

describe('content checks', () => {
  it('rejects gap answers that do not appear in the source', () => {
    expect(ieltsListening.safeParse(listening(1)).success).toBe(true);
    const bad = { ...listening(1), questions: [{ ...gap, answers: ['Ritz'] }, ...Array.from({ length: 9 }, () => mcq)] };
    expect(ieltsListening.safeParse(bad).success).toBe(false);
    expect(ieltsReading.safeParse(reading()).success).toBe(true);
  });
});

describe('IELTS tests', () => {
  it('runs a full test: hidden answers, objective bands, then AI-graded writing and speaking', async () => {
    await seedBank();
    fakeExaminer();
    const agent = await signIn(app, await createUser());

    const started = await agent.post('/api/exams/ielts/sessions').send({ mode: 'full' });
    expect(started.status).toBe(201);
    const session = started.body.session;
    expect(session.exam).toBe('ielts');
    expect(session.sections.map((s: { component: string; groups: unknown[] }) => `${s.component}:${s.groups.length}`)).toEqual([
      'listening:4',
      'reading:3',
      'writing:2',
      'speaking:1',
    ]);
    expect(session.timeLimitSec).toBe(165 * 60);
    const firstListening = session.sections[0].groups[0].payload.questions;
    expect(firstListening[0].answers).toBeUndefined();
    expect(firstListening[1].answerIndex).toBeUndefined();
    expect(session.sections[1].groups[0].payload.questions[0].answer).toBeUndefined();

    // Listening: every question right (gap typed loosely); reading: only the gap right
    const answers: Record<string, number | string> = {};
    for (const group of session.sections[0].groups) {
      answers[`${group.id}:0`] = '  grand plaza. ';
      for (let i = 1; i < 10; i++) answers[`${group.id}:${i}`] = 1;
    }
    for (const group of session.sections[1].groups) answers[`${group.id}:1`] = 'Grand Plaza';
    const [task1, task2] = session.sections[2].groups;
    const essay = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
    answers[`${task1.id}:essay`] = essay(160);
    answers[`${task2.id}:essay`] = essay(260);
    answers[`${session.sections[3].groups[0].id}:p1-0`] = 'I am from Hanoi, the capital of Vietnam.';
    await agent.patch(`/api/exams/sessions/${session.id}`).send({ answers }).expect(200);

    const submitted = await agent.post(`/api/exams/sessions/${session.id}/submit`);
    expect(submitted.status).toBe(200);
    const result = submitted.body.session.result;
    expect(result.listening).toEqual({ correct: 40, total: 40, band: 9 });
    expect(result.reading.correct).toBe(3);
    expect(result.reading.total).toBe(39);
    expect(submitted.body.session.sections[1].groups[0].payload.questions[0].answer).toBe('false');

    const graded = await waitForGrading(agent, session.id);
    expect(graded.result.writing.status).toBe('done');
    expect(graded.result.writing.band).toBe(6.5); // (6 + 2 * 7) / 3
    expect(graded.result.speaking.band).toBe(6.5);
    expect(graded.result.overall).toBe(overallBand([9, result.reading.band, 6.5, 6.5]));

    const history = await agent.get('/api/exams/sessions');
    expect(history.body.sessions[0]).toMatchObject({ exam: 'ielts', components: ['listening', 'reading', 'writing', 'speaking'] });
  });

  it('scores empty writing as 0 without calling the AI', async () => {
    await seedBank();
    const agent = await signIn(app, await createUser());
    const { body } = await agent.post('/api/exams/ielts/sessions').send({ mode: 'part', part: 'writing-task2' });
    expect(body.session.sections.map((s: { component: string }) => s.component)).toEqual(['writing']);
    expect(body.session.timeLimitSec).toBe(40 * 60);

    await agent.post(`/api/exams/sessions/${body.session.id}/submit`).expect(200);
    const graded = await waitForGrading(agent, body.session.id);
    expect(graded.result.writing).toMatchObject({ status: 'done', band: 0 });
    expect(aiReply).not.toHaveBeenCalled();
  });

  it('lets the learner retry grading after a failure', async () => {
    await seedBank();
    aiReply.mockRejectedValue(new Error('proxy down'));
    const agent = await signIn(app, await createUser());
    const { body } = await agent.post('/api/exams/ielts/sessions').send({ mode: 'part', part: 'speaking' });
    const [group] = body.session.sections[0].groups;
    await agent.patch(`/api/exams/sessions/${body.session.id}`).send({ answers: { [`${group.id}:p2`]: 'I want to describe a lake near my house.' } });
    await agent.post(`/api/exams/sessions/${body.session.id}/submit`).expect(200);
    expect((await waitForGrading(agent, body.session.id)).result.speaking.status).toBe('failed');

    fakeExaminer();
    await agent.post(`/api/exams/sessions/${body.session.id}/grade`).expect(200);
    expect((await waitForGrading(agent, body.session.id)).result.speaking).toMatchObject({ status: 'done', band: 6.5 });
  });

  it('asks the admin to fill the bank when too much is missing', async () => {
    const agent = await signIn(app, await createUser());
    const res = await agent.post('/api/exams/ielts/sessions').send({ mode: 'full' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('bank_insufficient');
  });

  it('reports bank sizes to admins', async () => {
    await seedBank();
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const res = await admin.get('/api/admin/ielts-bank');
    expect(res.body.slots.find((s: { slot: string }) => s.slot === 'reading')).toEqual({ slot: 'reading', groups: 3, fullTestGroups: 3 });
  });
});

describe('long monologue lines', () => {
  it('splits them at sentence ends', () => {
    const sentence = 'This is a sentence about the old harbour and its many boats. ';
    const long = { ...listening(2), script: [{ speaker: 'A', text: sentence.repeat(30).trim() }, { speaker: 'A', text: 'We stay at the Grand Plaza hotel.' }] };
    const parsed = ieltsListening.parse(long);
    expect(parsed.script.length).toBeGreaterThanOrEqual(6);
    expect(parsed.script.every((line) => line.text.length <= 400)).toBe(true);
  });
});
