import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { contentItems, examSessions, gateAttempts, ieltsPaths } from '../db/schema.js';
import { ensureGateContent } from '../ieltsPath/gateContent.js';
import { ensurePathLessons } from '../ieltsPath/lessons.js';
import { ensurePracticeContent } from '../ieltsPath/practiceContent.js';
import { addDays } from '../ieltsPath/bands.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(async () => 'Mock reply'),
  listAllowedModels: vi.fn(async () => ['claude-haiku-5-5']),
}));

const app = createApp();
const body = { bandTargets: { listening: 7.5, reading: 7.5, writing: 6.5, speaking: 6.5 }, examDate: null, dailyMinutes: 240, restDays: [] };

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await ensureGateContent();
  await ensurePracticeContent();
  await ensurePathLessons();
});
afterAll(closeDb);

type Agent = Awaited<ReturnType<typeof signIn>>;

async function startedPath(agent: Agent, startDate = quotaDay()) {
  await agent.post('/api/ielts-path').send(body);
  await db.update(ieltsPaths).set({ startPhase: 1, startDate });
  await agent.get('/api/ielts-path/today');
}

describe('progress report', () => {
  it('needs a path', async () => {
    const agent = await signIn(app, await createUser());
    expect((await agent.get('/api/ielts-path/report')).status).toBe(404);
  });

  it('shows the goal, the progress and no AI-against-teacher pairs before a teacher has graded', async () => {
    const agent = await signIn(app, await createUser());
    await startedPath(agent);
    const { report } = (await agent.get('/api/ielts-path/report')).body;
    expect(report.overallTarget).toBe(7);
    expect(report.progress.done).toBe(0);
    expect(report.progress.percent).toBe(0);
    expect(report.bands.writing.target).toBe(6.5);
    expect(report.calibration).toEqual({ pairs: [], meanDiff: { writing: null, speaking: null } });
  });

  it('compares the AI band with the teacher band of a gate', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await startedPath(agent);
    const [path] = await db.select().from(ieltsPaths);
    const [session] = await db
      .insert(examSessions)
      .values({ userId: user.id, exam: 'ielts', mode: 'gate', blueprint: { exam: 'ielts', sections: [] }, answers: {}, status: 'submitted', submittedAt: new Date(), timeLimitSec: 1800, result: { listening: null, reading: null, writing: { status: 'done', band: 6, tasks: [] }, speaking: null, overall: null } })
      .returning();
    await db.insert(gateAttempts).values({ pathId: path.id, userId: user.id, gate: 1, sessions: { writing: session.id }, manualBands: { writing: 7 }, status: 'finished', finishedAt: new Date() });
    const { report } = (await agent.get('/api/ielts-path/report')).body;
    expect(report.calibration.pairs).toEqual([{ skill: 'writing', gate: 1, ai: 6, teacher: 7 }]);
    expect(report.calibration.meanDiff).toEqual({ writing: 1, speaking: null });
  });
});

describe('path reminders', () => {
  it('reminds once, as a path reminder, when the learner is days behind', async () => {
    const agent = await signIn(app, await createUser());
    await startedPath(agent, addDays(quotaDay(), -12));
    const first = (await agent.get('/api/notifications?time=23:00')).body.notifications;
    expect(first.map((n: { kind: string }) => n.kind)).toEqual(['path-behind']);
    expect((await agent.get('/api/notifications?time=23:30')).body.notifications).toHaveLength(1);
  });

  it('stays quiet before the reminder time', async () => {
    const agent = await signIn(app, await createUser());
    await startedPath(agent, addDays(quotaDay(), -12));
    expect((await agent.get('/api/notifications?time=08:00')).body.notifications).toEqual([]);
  });
});

describe('sample answers of a writing task', () => {
  it('stay hidden while the test is open and show once it is submitted', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const [session] = await db
      .insert(examSessions)
      .values({ userId: user.id, exam: 'ielts', mode: 'lesson', blueprint: { exam: 'ielts', sections: [{ component: 'writing', groupIds: ['sample-w1'] }] }, answers: {}, status: 'in_progress', timeLimitSec: 3600, result: { listening: null, reading: null, writing: null, speaking: null, overall: null } })
      .returning();
    await db.insert(contentItems).values({
      id: 'sample-w1',
      kind: 'writing-prompt',
      skill: 'writing',
      exam: 'ielts',
      language: 'en',
      title: 'Sample task',
      payload: { taskType: 'ielts-task2', title: 'T', instructions: 'Write.', prompt: 'Discuss.', minWords: 250, timeMinutes: 40, samples: [{ by: 'candidate', band: 6.5, text: 'An answer.', comment: 'A comment.' }] },
      source: 'imported',
      status: 'archived',
    });
    const open = (await agent.get(`/api/exams/sessions/${session.id}`)).body.session;
    expect(open.sections[0].groups[0].payload.samples).toBeUndefined();
    await db.update(examSessions).set({ status: 'submitted', submittedAt: new Date() }).where(eq(examSessions.id, session.id));
    const done = (await agent.get(`/api/exams/sessions/${session.id}`)).body.session;
    expect(done.sections[0].groups[0].payload.samples).toEqual([{ by: 'candidate', band: 6.5, text: 'An answer.', comment: 'A comment.' }]);
  });
});

describe('model speaking answers', () => {
  it('lists the topics and opens one, and needs sign-in', async () => {
    expect((await request(app).get('/api/ielts-path/speaking-models')).status).toBe(401);
    const agent = await signIn(app, await createUser());
    await db.insert(contentItems).values({
      id: 'sm-1',
      kind: 'speaking-model',
      skill: 'speaking',
      exam: 'ielts',
      language: 'en',
      title: 'Media',
      payload: { group: 'Media', topic: 'Media', items: [{ part: 1, question: 'Do you watch TV?', answer: 'Yes I do.' }, { part: 3, question: 'Why?', answer: 'Because.' }], vocab: ['brief (adj): short'] },
      source: 'imported',
      status: 'archived',
    });
    const list = (await agent.get('/api/ielts-path/speaking-models')).body.topics;
    expect(list).toEqual([{ id: 'sm-1', group: 'Media', topic: 'Media', counts: { 1: 1, 2: 0, 3: 1 } }]);
    const one = (await agent.get('/api/ielts-path/speaking-models/sm-1')).body.topic;
    expect(one.items).toHaveLength(2);
    expect(one.vocab).toEqual(['brief (adj): short']);
    expect((await agent.get('/api/ielts-path/speaking-models/nope')).status).toBe(404);
  });
});
