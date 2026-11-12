import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { contentItems, examSessions, gateAttempts, ieltsPaths, pathLessons } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureGateContent, GATE_GROUPS } from '../ieltsPath/gateContent.js';
import { ensurePathLessons } from '../ieltsPath/lessons.js';
import { levelFor, type PoolType } from '../ieltsPath/practice.js';
import { ensurePracticeContent } from '../ieltsPath/practiceContent.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(async () => 'Mock reply'),
  listAllowedModels: vi.fn(async () => ['claude-haiku-5-5']),
}));

const app = createApp();
const body = { bandTargets: { listening: 7.5, reading: 7.5, writing: 6.5, speaking: 6.5 }, examDate: '2099-05-10', dailyMinutes: 240, restDays: [] };

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
type Skill = 'listening' | 'reading' | 'writing' | 'speaking';

/** A path that finished Gate 0 and starts in phase 1, with every step of phase 1 done */
async function pathReadyForGate1(agent: Agent) {
  await agent.post('/api/ielts-path').send(body);
  const [path] = await db.update(ieltsPaths).set({ startPhase: 1, startDate: quotaDay() }).returning();
  await agent.get('/api/ielts-path/today'); // stores the syllabus
  await db.update(pathLessons).set({ status: 'done', doneAt: new Date() }).where(eq(pathLessons.pathId, path.id));
  return path;
}

/** Answers every question of the groups of a session: `wrong` of them wrongly (from the start) */
async function answerSession(agent: Agent, sessionId: string, wrong = 0) {
  const view = (await agent.get(`/api/exams/sessions/${sessionId}`)).body.session;
  const answers: Record<string, number | string> = {};
  let index = 0;
  for (const section of view.sections) {
    for (const group of section.groups as { id: string }[]) {
      const source = (await db.select().from(contentItems).where(eq(contentItems.id, group.id)))[0];
      const questions = ((source.payload as { questions?: { type: string; answerIndex?: number; answer?: string; answers?: string[] }[] }).questions ?? []);
      questions.forEach((q, i) => {
        const bad = index++ < wrong;
        const key = `${group.id}:${i}`;
        if (q.type === 'mcq' || q.type === 'match') answers[key] = bad ? (q.answerIndex! + 1) % 3 : q.answerIndex!;
        else if (q.type === 'tfng') answers[key] = bad ? (['true', 'false', 'not_given'].indexOf(q.answer!) + 1) % 3 : ['true', 'false', 'not_given'].indexOf(q.answer!);
        else if (q.type === 'gap') answers[key] = bad ? 'nothing' : q.answers![0];
      });
    }
  }
  if (Object.keys(answers).length > 0) await agent.patch(`/api/exams/sessions/${sessionId}`).send({ answers });
  expect((await agent.post(`/api/exams/sessions/${sessionId}/submit`).send({})).status).toBe(200);
}

async function takeSkill(agent: Agent, gate: number, skill: Skill, wrong = 0) {
  const started = await agent.post(`/api/ielts-path/gates/${gate}/skills/${skill}/start`).send({});
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  await answerSession(agent, started.body.sessionId, wrong);
  return started.body.sessionId as string;
}

/** Waits for the background grading of writing and speaking (empty answers score 0 without the AI) */
async function settle(agent: Agent, gate: number) {
  for (let i = 0; i < 40; i++) {
    const { gate: view } = (await agent.get(`/api/ielts-path/gates/${gate}`)).body;
    if (!view.skills.some((s: { status: string }) => s.status === 'grading')) return view;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('grading did not finish');
}

/** Takes a whole gate: listening and reading with `wrongLR` wrong answers each, writing and speaking with a teacher's band */
async function takeGate(agent: Agent, gate: number, options: { wrongL?: number; wrongR?: number; writing: number; speaking: number }) {
  await takeSkill(agent, gate, 'listening', options.wrongL ?? 0);
  await takeSkill(agent, gate, 'reading', options.wrongR ?? 0);
  await takeSkill(agent, gate, 'writing');
  await takeSkill(agent, gate, 'speaking');
  await settle(agent, gate);
  await agent.post(`/api/ielts-path/gates/${gate}/manual`).send({ skill: 'writing', band: options.writing });
  await agent.post(`/api/ielts-path/gates/${gate}/manual`).send({ skill: 'speaking', band: options.speaking });
  return (await agent.get(`/api/ielts-path/gates/${gate}`)).body.gate;
}

/** A pool item for a generated exercise, copied from an authored gate group, at the level its gate draws */
async function poolItem(id: string, type: PoolType, source: string) {
  const group = GATE_GROUPS.find((g) => g.id === source)!;
  const gate = Number(source.split('-')[1]);
  await db.insert(contentItems).values({ id, kind: group.kind, skill: group.skill, exam: 'ielts', part: `path:${type}`, level: levelFor(type, gate), title: id, topic: 'test', payload: group.payload, source: 'ai', status: 'archived' });
}

describe('IELTS Path gates', () => {
  it('opens Gate 1 only when the steps of phase 1 are done', async () => {
    const agent = await signIn(app, await createUser());
    await agent.post('/api/ielts-path').send(body);
    await db.update(ieltsPaths).set({ startPhase: 1, startDate: quotaDay() });
    await agent.get('/api/ielts-path/today');
    const locked = await agent.post('/api/ielts-path/gates/1/skills/listening/start').send({});
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('gate_steps_left');
    expect((await agent.post('/api/ielts-path/gates/2/skills/listening/start').send({})).body.code).toBe('gate_earlier_gate');
    expect((await agent.get('/api/ielts-path/gates/1')).body.gate.startBlock).toBe('steps-left');
  });

  it('passes a gate: bands against the targets, the next gate becomes the one to work on', async () => {
    const agent = await signIn(app, await createUser());
    await pathReadyForGate1(agent);
    const today = (await agent.get('/api/ielts-path/today')).body.today;
    expect(today.mode).toBe('gate'); // phase 1 is done: Gate 1 is next
    expect(today.gate).toMatchObject({ gate: 1, startBlock: null });
    const gate = await takeGate(agent, 1, { writing: 4, speaking: 4 });
    expect(gate.status).toBe('finished');
    expect(gate.version).toBe('A');
    expect(gate.bands).toEqual({ listening: 9, reading: 9, writing: 4, speaking: 4 });
    expect(gate.outcome).toBe('pass');
    expect(gate.skills.find((s: { skill: string }) => s.skill === 'writing')).toMatchObject({ manual: true, band: 4 });
    const path = (await agent.get('/api/ielts-path')).body.path;
    expect(path.cleared).toBe(1);
    expect(path.nextGate).toBe(2);
    expect(path.gate.gate).toBe(2);
    expect(path.history).toEqual([expect.objectContaining({ gate: 1, outcome: 'pass', tries: 1 })]);
    // Taking the gate again is refused
    expect((await agent.post('/api/ielts-path/gates/1/skills/listening/start').send({})).body.code).toBe('gate_cleared');
  });

  it('after Gate 1 the syllabus goes on with phase 2 (weeks 5-8), once, and a learner who starts in phase 2 gets it at once', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const path = await pathReadyForGate1(agent);
    await db.update(pathLessons).set({ doneAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(pathLessons.pathId, path.id)); // phase 1 was done on earlier days
    await takeGate(agent, 1, { writing: 4, speaking: 4 });
    const today = (await agent.get('/api/ielts-path/today')).body.today;
    expect(today.mode).toBe('syllabus');
    expect(today.position).toEqual({ phase: 2, week: 5, day: 1, extra: null });
    const todo = today.steps.filter((s: { done: boolean }) => !s.done);
    expect(todo.slice(0, 7).map((s: { kind: string; block: string }) => `${s.block}:${s.kind}`)).toEqual(['vocab-grammar:words', 'vocab-grammar:grammar', 'listening:dictation', 'listening:lesson', 'reading:lesson', 'writing:lesson', 'speaking:lesson']);
    expect(todo.find((s: { kind: string; block: string }) => s.kind === 'lesson' && s.block === 'listening').title.en).toBe('Listen again with the transcript');
    const count = async (phase: number) => (await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id))).filter((r) => r.phase === phase).length;
    const phase2 = await count(2);
    expect(phase2).toBeGreaterThan(100);
    await agent.get('/api/ielts-path/today'); // read again: not stored twice
    expect(await count(2)).toBe(phase2);

    // Starting in phase 2 (Gate 0 put the learner there): its steps are there from the first day
    const other = await signIn(app, await createUser());
    await other.post('/api/ielts-path').send(body);
    await db.update(ieltsPaths).set({ startPhase: 2, startDate: quotaDay() }).where(eq(ieltsPaths.userId, (await db.select().from(ieltsPaths).orderBy(ieltsPaths.createdAt)).at(-1)!.userId));
    const direct = (await other.get('/api/ielts-path/today')).body.today;
    expect(direct.mode).toBe('syllabus');
    expect(direct.position).toMatchObject({ phase: 2, week: 5, day: 1 });
  });

  it('conditional: extra practice for the weak skill, then a retest after a week', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const path = await pathReadyForGate1(agent);
    const gate = await takeGate(agent, 1, { writing: 3.5, speaking: 4 });
    expect(gate.outcome).toBe('conditional');
    expect(gate.evaluation.weak).toEqual(['writing']);
    expect(gate.retest).toMatchObject({ skill: 'writing', status: 'locked' });
    // The path screen keeps Gate 1 in view while its retest is waiting, next to Gate 2
    const view = (await agent.get('/api/ielts-path')).body.path;
    expect(view.previous).toMatchObject({ gate: 1, outcome: 'conditional' });
    expect(view.gate.gate).toBe(2);
    const remedial = (await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id))).filter((r) => (r.ref as { remedial?: number }).remedial === 1);
    expect(remedial).toHaveLength(6);
    expect(remedial.every((r) => r.block === 'writing' && r.status === 'todo')).toBe(true);
    // Locked until a week has passed
    expect((await agent.post('/api/ielts-path/gates/1/retest').send({})).body.code).toBe('retest_locked');
    await db.update(gateAttempts).set({ finishedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(gateAttempts.gate, 1));
    expect((await agent.get('/api/ielts-path/gates/1')).body.gate.retest.status).toBe('due');
    // Today offers the retest
    expect((await agent.get('/api/ielts-path/today')).body.today.retest).toMatchObject({ gate: 1, skill: 'writing', status: 'due' });

    const started = await agent.post('/api/ielts-path/gates/1/retest').send({});
    expect(started.status).toBe(201);
    const session = (await agent.get(`/api/exams/sessions/${started.body.sessionId}`)).body.session;
    expect(session.sections[0].groups.map((g: { id: string }) => g.id)).toEqual(['gate-1-B-writing-1', 'gate-1-B-writing-2']);
    expect((await agent.post('/api/ielts-path/gates/1/retest').send({})).body.sessionId).toBe(started.body.sessionId);

    // The retest is graded: the weak skill reaches its target, so the gate is cleared in full
    await db.update(examSessions).set({ status: 'submitted', submittedAt: new Date(), result: { listening: null, reading: null, writing: { status: 'done', band: 4, tasks: [] }, speaking: null, overall: null } }).where(eq(examSessions.id, started.body.sessionId));
    const after = (await agent.get('/api/ielts-path/gates/1')).body.gate;
    expect(after.retest).toMatchObject({ status: 'done', band: 4 });
    expect(after.bands.writing).toBe(4);
    expect(after.evaluation.outcome).toBe('pass');
  });

  it('fail: a buffer week, the retake is version B from the pool, and two fails stop the path until a new plan', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const path = await pathReadyForGate1(agent);
    await poolItem('pool-l-form-1', 'l-form', 'gate-1-listening');
    await poolItem('pool-r-tfng-1', 'r-tfng', 'gate-1-reading');
    await poolItem('pool-l-form-2', 'l-form', 'gate-1-listening');
    await poolItem('pool-r-tfng-2', 'r-tfng', 'gate-1-reading');

    // Listening 5 of 10 correct = 20/40 = band 5.5? No: 5/10 -> raw 20 -> 5.5, fine; make it fail with writing and speaking too
    const first = await takeGate(agent, 1, { wrongL: 10, wrongR: 10, writing: 3, speaking: 3 });
    expect(first.outcome).toBe('fail');
    expect(first.evaluation.weak.length).toBeGreaterThanOrEqual(2);
    const buffer = (await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id))).filter((r) => (r.ref as { buffer?: number }).buffer === 1);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.every((r) => r.week === 0 && r.phase === 1)).toBe(true);

    // The retake waits for the buffer week
    expect((await agent.post('/api/ielts-path/gates/1/skills/listening/start').send({})).body.code).toBe('gate_steps_left');
    await db.update(pathLessons).set({ status: 'done', doneAt: new Date() }).where(eq(pathLessons.pathId, path.id));
    const retake = await agent.post('/api/ielts-path/gates/1/skills/listening/start').send({});
    expect(retake.status).toBe(201);
    const view = (await agent.get('/api/ielts-path/gates/1')).body.gate;
    expect(view.version).toBe('B');
    expect(view.tries).toBe(1);
    const session = (await agent.get(`/api/exams/sessions/${retake.body.sessionId}`)).body.session;
    expect(session.sections[0].groups[0].id).toMatch(/^pool-l-form-/);
    await answerSession(agent, retake.body.sessionId, 10);
    await takeSkill(agent, 1, 'reading', 10);
    await takeSkill(agent, 1, 'writing');
    await takeSkill(agent, 1, 'speaking');
    await settle(agent, 1);
    await agent.post('/api/ielts-path/gates/1/manual').send({ skill: 'writing', band: 3 });
    await agent.post('/api/ielts-path/gates/1/manual').send({ skill: 'speaking', band: 3 });
    const second = (await agent.get('/api/ielts-path/gates/1')).body.gate;
    expect(second.outcome).toBe('fail');
    expect(second.stopped).toBe(true);
    expect((await agent.get('/api/ielts-path/today')).body.today.gate.stopped).toBe(true);
    expect((await agent.post('/api/ielts-path/gates/1/skills/listening/start').send({})).body.code).toBe('gate_stopped');

    // A new plan lets the learner try again
    const replanned = await agent.post('/api/ielts-path/replan').send({ dailyMinutes: 180 });
    expect(replanned.body.path.dailyMinutes).toBe(180);
    expect((await agent.get('/api/ielts-path/gates/1')).body.gate.stopped).toBe(false);
  });

  it('after Gate 3 a skill below 5.5 moves the exam to weeks 32-36 once the retest is settled', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await pathReadyForGate1(agent);
    const [path] = await db.select().from(ieltsPaths);
    // Gates 1 and 2 were cleared earlier
    for (const gate of [1, 2]) await db.insert(gateAttempts).values({ pathId: path.id, userId: user.id, gate, version: 'A', status: 'finished', outcome: 'pass', bands: { listening: 9, reading: 9, writing: 6, speaking: 6 }, finishedAt: new Date() });
    await db.update(pathLessons).set({ status: 'done', doneAt: new Date() }).where(eq(pathLessons.pathId, path.id));
    await poolItem('pool-l-sec3-1', 'l-sec3', 'gate-3-listening');

    // Listening 4 of 10 right -> band 5.0, half a band short of 5.5: a conditional pass
    const gate = await takeGate(agent, 3, { wrongL: 6, writing: 5, speaking: 5 });
    expect(gate.outcome).toBe('conditional');
    expect(gate.evaluation.weak).toEqual(['listening']);
    expect(gate.decision).toBeNull(); // waits for the retest

    await db.update(gateAttempts).set({ finishedAt: new Date(Date.now() - 8 * 86_400_000) }).where(and(eq(gateAttempts.gate, 3), eq(gateAttempts.status, 'finished')));
    const started = await agent.post('/api/ielts-path/gates/3/retest').send({});
    expect(started.status).toBe(201);
    // The retest brings listening to 5.0 again
    await db.update(examSessions).set({ status: 'submitted', submittedAt: new Date(), result: { listening: { correct: 4, total: 10, band: 5 }, reading: null, writing: null, speaking: null, overall: null } }).where(eq(examSessions.id, started.body.sessionId));
    const settled = (await agent.get('/api/ielts-path/gates/3')).body.gate;
    expect(settled.retest.status).toBe('done');
    expect(settled.decision).toMatchObject({ kind: 'move-exam', choice: null });
    expect((await agent.get('/api/ielts-path')).body.path.previous).toMatchObject({ gate: 3 });
    const accepted = await agent.post('/api/ielts-path/gates/3/decision').send({ choice: 'accept' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.path.examDate).toBe(settled.decision.earliest);
    expect((await agent.post('/api/ielts-path/gates/3/decision').send({ choice: 'decline' })).body.code).toBe('decision_made');
    // Once decided, nothing is waiting any more
    expect((await agent.get('/api/ielts-path')).body.path.previous).toBeNull();
  });

  it('after Gate 4 a writing or speaking band under 5.5 suggests overall 6.5, and accepting lowers the targets', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await pathReadyForGate1(agent);
    const [path] = await db.select().from(ieltsPaths);
    for (const gate of [1, 2, 3]) await db.insert(gateAttempts).values({ pathId: path.id, userId: user.id, gate, version: 'A', status: 'finished', outcome: 'pass', bands: { listening: 9, reading: 9, writing: 6, speaking: 6 }, finishedAt: new Date() });
    await db.update(pathLessons).set({ status: 'done', doneAt: new Date() }).where(eq(pathLessons.pathId, path.id));

    // Writing 5.0 is half a band short of 5.5: a conditional pass, settled by a retest that stays at 5.0
    const gate = await takeGate(agent, 4, { writing: 5, speaking: 5.5 });
    expect(gate.outcome).toBe('conditional');
    expect(gate.decision).toBeNull();
    await db.update(gateAttempts).set({ finishedAt: new Date(Date.now() - 8 * 86_400_000) }).where(and(eq(gateAttempts.gate, 4), eq(gateAttempts.status, 'finished')));
    const started = await agent.post('/api/ielts-path/gates/4/retest').send({});
    expect(started.status).toBe(201);
    await db.update(examSessions).set({ status: 'submitted', submittedAt: new Date(), result: { listening: null, reading: null, writing: { status: 'done', band: 5, tasks: [] }, speaking: null, overall: null } }).where(eq(examSessions.id, started.body.sessionId));
    const settled = (await agent.get('/api/ielts-path/gates/4')).body.gate;
    expect(settled.decision).toEqual({ kind: 'lower-target', overall: 6.5, choice: null });

    const accepted = await agent.post('/api/ielts-path/gates/4/decision').send({ choice: 'accept' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.path.bandTargets).toEqual({ listening: 7, reading: 7, writing: 6, speaking: 6 });
    expect(accepted.body.path.overallTarget).toBe(6.5);
    expect((await agent.get('/api/ielts-path/gates/4')).body.gate.decision.choice).toBe('accept');
  });

  it('declining a decision keeps the plan as it was', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await pathReadyForGate1(agent);
    const [path] = await db.select().from(ieltsPaths);
    for (const gate of [1, 2, 3]) await db.insert(gateAttempts).values({ pathId: path.id, userId: user.id, gate, version: 'A', status: 'finished', outcome: 'pass', bands: { listening: 9, reading: 9, writing: 6, speaking: 6 }, finishedAt: new Date() });
    await db.update(pathLessons).set({ status: 'done', doneAt: new Date() }).where(eq(pathLessons.pathId, path.id));
    await takeGate(agent, 4, { writing: 5, speaking: 5.5 });
    await db.update(gateAttempts).set({ finishedAt: new Date(Date.now() - 8 * 86_400_000) }).where(and(eq(gateAttempts.gate, 4), eq(gateAttempts.status, 'finished')));
    const started = await agent.post('/api/ielts-path/gates/4/retest').send({});
    await db.update(examSessions).set({ status: 'submitted', submittedAt: new Date(), result: { listening: null, reading: null, writing: { status: 'done', band: 5, tasks: [] }, speaking: null, overall: null } }).where(eq(examSessions.id, started.body.sessionId));
    await agent.get('/api/ielts-path/gates/4');
    const declined = await agent.post('/api/ielts-path/gates/4/decision').send({ choice: 'decline' });
    expect(declined.body.path.bandTargets).toEqual(body.bandTargets);
    expect((await agent.get('/api/ielts-path/gates/4')).body.gate.decision.choice).toBe('decline');
  });

  it('saves a matching answer beyond D, up to L (headings, paragraphs and maps have up to twelve options)', async () => {
    const agent = await signIn(app, await createUser());
    await pathReadyForGate1(agent);
    const started = await agent.post('/api/ielts-path/gates/1/skills/reading/start').send({});
    expect(started.status).toBe(201);
    const saved = await agent.patch(`/api/exams/sessions/${started.body.sessionId}`).send({ answers: { 'gate-1-reading:0': 11, 'gate-1-reading:1': 4 } });
    expect(saved.status).toBe(200);
    expect((await agent.patch(`/api/exams/sessions/${started.body.sessionId}`).send({ answers: { 'gate-1-reading:0': 12 } })).status).toBe(400);
  });

  it('gates ask for the pool when a retake needs exercises that do not exist yet', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const path = await pathReadyForGate1(agent);
    await db.insert(gateAttempts).values({ pathId: path.id, userId: user.id, gate: 1, version: 'A', status: 'finished', outcome: 'fail', bands: { listening: 3, reading: 3, writing: 3, speaking: 3 }, finishedAt: new Date() });
    // Gate 5 is a full test from the pool; the pool is empty, so it is not ready
    await db.update(ieltsPaths).set({ startPhase: 5 });
    const started = await agent.post('/api/ielts-path/gates/5/skills/listening/start').send({});
    expect(started.status).toBe(503);
    expect(started.body.code).toBe('gate_not_ready');
  });
});
