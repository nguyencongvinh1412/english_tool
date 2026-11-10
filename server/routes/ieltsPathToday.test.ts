import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { attempts, contentItems, grammarProgress, ieltsPaths, pathLessons } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { GATE_GROUPS, ensureGateContent } from '../ieltsPath/gateContent.js';
import { ensurePathLessons } from '../ieltsPath/lessons.js';
import { ensurePracticeContent } from '../ieltsPath/practiceContent.js';
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
  vi.mocked(sendChatMessage).mockClear();
});
afterAll(closeDb);

type Agent = Awaited<ReturnType<typeof signIn>>;

/** A path whose Gate 0 is finished with phase 1 as the starting phase */
async function startedPath(agent: Agent) {
  await agent.post('/api/ielts-path').send(body);
  const [path] = await db.update(ieltsPaths).set({ startPhase: 1, startDate: quotaDay() }).returning();
  return path;
}

const todayOf = async (agent: Agent) => (await agent.get('/api/ielts-path/today')).body.today;

describe('IELTS Path Today', () => {
  it('is empty without a path, and says so while Gate 0 is open', async () => {
    const agent = await signIn(app, await createUser());
    expect((await todayOf(agent))).toBeNull();
    await agent.post('/api/ielts-path').send(body);
    const today = await todayOf(agent);
    expect(today.mode).toBe('unwritten');
    expect(today.steps).toEqual([]);
  });

  it('stores the syllabus and lists the first steps that fit the day, each block of day 1 with a lesson', async () => {
    const agent = await signIn(app, await createUser());
    const path = await startedPath(agent);
    const today = await todayOf(agent);
    expect(today.mode).toBe('syllabus');
    expect(today.position).toEqual({ phase: 1, week: 1, day: 1 });
    const stored = await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id));
    expect(stored.length).toBeGreaterThan(100);
    // Day 1 of week 1: words, grammar, dictation, then the four lessons
    const kinds = today.steps.slice(0, 7).map((s: { kind: string; block: string }) => `${s.block}:${s.kind}`);
    expect(kinds).toEqual(['vocab-grammar:words', 'vocab-grammar:grammar', 'listening:dictation', 'listening:lesson', 'reading:lesson', 'writing:lesson', 'speaking:lesson']);
    expect(today.plannedMinutes).toBeLessThanOrEqual(240);
    expect(today.plannedMinutes).toBeGreaterThanOrEqual(180);
    expect(today.behind.steps).toBe(0);
    expect(today.eta.from < today.eta.to).toBe(true);
    // Reading it again does not store it twice
    await todayOf(agent);
    expect((await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id))).length).toBe(stored.length);
  });

  it('teaches a lesson, then completes it with the drill result', async () => {
    const agent = await signIn(app, await createUser());
    await startedPath(agent);
    const lesson = (await todayOf(agent)).steps.find((s: { kind: string }) => s.kind === 'lesson');
    const opened = await agent.get(`/api/ielts-path/steps/${lesson.id}`);
    expect(opened.status).toBe(200);
    expect(opened.body.title.en).toBeTruthy();
    expect(opened.body.content.drills.length).toBeGreaterThanOrEqual(3);
    expect((await agent.post(`/api/ielts-path/steps/${lesson.id}/complete`).send({ drills: { correct: 3, total: 4 } })).status).toBe(200);
    const after = await todayOf(agent);
    expect(after.steps.find((s: { id: string }) => s.id === lesson.id).done).toBe(true);
    expect(after.doneMinutes).toBe(lesson.minutes);
    // Another learner cannot open it
    const other = await signIn(app, await createUser());
    expect((await other.get(`/api/ielts-path/steps/${lesson.id}`)).status).toBe(404);
  });

  it('runs a practice step as a test session from the pool and completes it on submit', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await startedPath(agent);
    // Week 1 listening practice is "l-conv": pre-fill its pool so no AI is needed
    const source = GATE_GROUPS.find((g) => g.id === 'gate-0-listening-1')!;
    await db.insert(contentItems).values({ id: 'pool-l-conv-1', kind: 'ielts-listening', skill: 'listening', exam: 'ielts', part: 'path:l-conv', level: 'A2', title: 'Pool item', topic: 'test', payload: source.payload, source: 'ai', status: 'archived' });
    await todayOf(agent); // stores the syllabus
    const step = (await db.select().from(pathLessons).where(eq(pathLessons.userId, user.id))).filter((r) => (r.ref as { type?: string }).type === 'l-conv').sort((a, b) => a.seq - b.seq)[0];

    const started = await agent.post(`/api/ielts-path/steps/${step.id}/practice`).send({});
    expect(started.status).toBe(201);
    const sessionId = started.body.sessionId as string;
    expect((await agent.post(`/api/ielts-path/steps/${step.id}/practice`).send({})).body.sessionId).toBe(sessionId);
    const view = await agent.get(`/api/exams/sessions/${sessionId}`);
    expect(view.body.session.mode).toBe('lesson');
    expect(view.body.session.sections[0].groups[0].id).toBe('pool-l-conv-1');

    expect((await agent.post(`/api/exams/sessions/${sessionId}/submit`).send({})).status).toBe(200);
    const today = await todayOf(agent);
    const after = (await db.select().from(pathLessons).where(eq(pathLessons.id, step.id)))[0];
    expect(after.status).toBe('done');
    expect(today).toBeTruthy();
  });

  it('counts a grammar point, a vocabulary session and a dictation as the steps they match', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await startedPath(agent);
    const before = await todayOf(agent);
    const grammar = before.steps.find((s: { kind: string }) => s.kind === 'grammar');
    await db.insert(grammarProgress).values({ userId: user.id, pointId: grammar.ref.pointId, dueAt: new Date(), practicedAt: new Date() });
    await db.insert(attempts).values({ userId: user.id, activity: 'en-vocab', skill: 'reading', day: quotaDay(), completedAt: new Date(Date.now() + 1000) });
    await db.insert(attempts).values({ userId: user.id, activity: 'dictation', skill: 'listening', day: quotaDay(), completedAt: new Date(Date.now() + 1000) });
    const after = await todayOf(agent);
    const done = (kind: string) => after.steps.find((s: { kind: string }) => s.kind === kind).done;
    expect(done('grammar')).toBe(true);
    expect(done('words')).toBe(true);
    expect(done('dictation')).toBe(true);
    // The queue moved up: more steps fit now that three are finished
    expect(after.doneMinutes).toBe(15 + 20 + 10);
  });

  it('lets the learner learn ahead, and shows how far behind they are', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const path = await startedPath(agent);
    const base = await todayOf(agent);
    expect(base.canAhead).toBe(true);
    const ahead = await agent.post('/api/ielts-path/ahead').send({});
    expect(ahead.body.today.capacityMinutes).toBe(480);
    expect(ahead.body.today.steps.length).toBeGreaterThan(base.steps.length);

    // Three study days late: the first steps were due three days ago
    await db.update(ieltsPaths).set({ aheadMinutes: 0, aheadDay: null, startDate: '2000-01-01' }).where(eq(ieltsPaths.id, path.id));
    await db.update(pathLessons).set({ plannedDay: '2000-01-01' }).where(eq(pathLessons.pathId, path.id));
    const late = await todayOf(agent);
    expect(late.behind.alert).toBe(true);
    expect(late.steps[0].behind).toBe(true);
    // A missed day does not drop anything: the same first steps are still first in line
    expect(late.steps.map((s: { id: string }) => s.id).slice(0, 3)).toEqual(base.steps.map((s: { id: string }) => s.id).slice(0, 3));
  });

  it('leaves the generic skill tasks to the syllabus but keeps reviews', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const before = await agent.get('/api/today?minutes=45');
    expect(before.body.tasks.some((t: { type: string }) => t.type === 'practice-skill')).toBe(true);
    await startedPath(agent);
    await todayOf(agent);
    const after = await agent.get('/api/today?minutes=45');
    expect(after.body.tasks.some((t: { type: string }) => ['practice-skill', 'learn-words', 'learn-grammar'].includes(t.type))).toBe(false);
  });
});
