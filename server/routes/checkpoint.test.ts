import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { placementQuestions, roadmapTasks } from '../db/schema.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();
type Agent = Awaited<ReturnType<typeof signIn>>;
const goal = { language: 'en', goalType: 'toeic', targetScore: 600, hoursPerWeek: 5 };

/** Approved questions at B1 for each skill, with the right answer always at index 1 */
async function seedBank(skills: string[] = ['vocabulary', 'grammar', 'reading', 'listening']) {
  await db.insert(placementQuestions).values(
    skills.flatMap((skill) =>
      Array.from({ length: 6 }, (_, i) => ({ id: `t:${skill}:${i}`, language: 'en' as const, skill, level: 'B1', prompt: `${skill} question ${i}`, context: skill === 'reading' || skill === 'listening' ? 'Some text.' : null, options: ['a', 'b', 'c', 'd'], answerIndex: 1, source: 'manual', status: 'approved' }))
    )
  );
}

async function setup(skills?: string[]) {
  await seedBank(skills);
  const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
  await agent.post('/api/roadmap').send(goal);
  return agent;
}

const start = (agent: Agent, body: object = { stageIndex: 0, early: true }) => agent.post('/api/roadmap/checkpoint/start').send(body);
const answersFor = (questions: { id: string }[], pick: (id: string, i: number) => number) => Object.fromEntries(questions.map((q, i) => [q.id, pick(q.id, i)]));

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await db.delete(placementQuestions);
});
afterAll(closeDb);

describe('stage checkpoint', () => {
  it('needs a roadmap, and stays locked until the stage is 80% done unless taken early', async () => {
    await seedBank();
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    expect((await start(agent)).status).toBe(404);
    await agent.post('/api/roadmap').send(goal);
    const locked = await start(agent, { stageIndex: 0 });
    expect(locked.status).toBe(400);
    expect(locked.body.code).toBe('locked');
    expect((await start(agent)).status).toBe(201);
  });

  it('serves questions without the answers and resumes the open attempt', async () => {
    const agent = await setup();
    const first = (await start(agent)).body;
    expect(first.questions.length).toBe(18);
    expect(JSON.stringify(first)).not.toContain('answerIndex');
    const again = (await start(agent)).body;
    expect(again.id).toBe(first.id);
    expect(again.questions.map((q: { id: string }) => q.id)).toEqual(first.questions.map((q: { id: string }) => q.id));
  });

  it('passes when the answers are right, and marks the stage as passed', async () => {
    const agent = await setup();
    const attempt = (await start(agent)).body;
    const done = (await agent.post(`/api/roadmap/checkpoint/${attempt.id}/submit`).send({ answers: answersFor(attempt.questions, () => 1) })).body;
    expect(done.passed).toBe(true);
    expect(done.result.overall).toBe(1);
    expect((await agent.post(`/api/roadmap/checkpoint/${attempt.id}/submit`).send({ answers: {} })).status).toBe(400);

    const view = (await agent.get('/api/roadmap')).body;
    expect(view.progress.stages[0].passed).toBe(true);
    expect(view.checkpoint.passed).toBe(true);
  });

  it('fails when one skill is under 50% and explains where, then sets up a remedial week', async () => {
    const agent = await setup();
    const attempt = (await start(agent)).body;
    // Everything right except reading, all wrong
    const skillOf = new Map<string, string>(attempt.questions.map((q: { id: string; skill: string }) => [q.id, q.skill]));
    const done = (await agent.post(`/api/roadmap/checkpoint/${attempt.id}/submit`).send({ answers: answersFor(attempt.questions, (id) => (skillOf.get(id) === 'reading' ? 0 : 1)) })).body;
    expect(done.passed).toBe(false);
    expect(done.result.weak).toEqual(['reading']);
    expect(done.result.skills.reading.verdict).toBe('low');

    const created = (await agent.post(`/api/roadmap/checkpoint/${attempt.id}/remedial`).send()).body;
    expect(created.tasks).toBeGreaterThan(0);
    const rows = await db.select().from(roadmapTasks);
    expect(rows.every((r) => r.taskKey === 'focus-reading')).toBe(true);
    // The stage is not passed, so the roadmap cannot be completed yet
    expect((await agent.get('/api/roadmap')).body.progress.stages[0].passed).toBe(false);
  });

  it('keeps the usual tasks on a day that already has a stored focus task', async () => {
    const agent = await setup();
    const attempt = (await start(agent)).body;
    const skillOf = new Map<string, string>(attempt.questions.map((q: { id: string; skill: string }) => [q.id, q.skill]));
    await agent.post(`/api/roadmap/checkpoint/${attempt.id}/submit`).send({ answers: answersFor(attempt.questions, (id) => (skillOf.get(id) === 'reading' ? 0 : 1)) });
    const before = (await agent.get('/api/today?minutes=45')).body.tasks.length;
    await agent.post(`/api/roadmap/checkpoint/${attempt.id}/remedial`).send();
    // Pretend tomorrow is today: move the stored focus task to today and open Today again
    const { quotaDay } = await import('../services/aiAccess.js');
    const focus = (await db.select().from(roadmapTasks)).find((r) => r.taskKey === 'focus-reading')!;
    await db.update(roadmapTasks).set({ day: quotaDay() }).where(eq(roadmapTasks.id, focus.id));
    const after = (await agent.get('/api/today?minutes=45')).body.tasks;
    expect(after.some((t: { id: string }) => t.id === 'focus-reading')).toBe(true);
    expect(after.length).toBeGreaterThanOrEqual(before);
  });

  it('does not offer a remedial week after a pass', async () => {
    const agent = await setup();
    const attempt = (await start(agent)).body;
    await agent.post(`/api/roadmap/checkpoint/${attempt.id}/submit`).send({ answers: answersFor(attempt.questions, () => 1) });
    expect((await agent.post(`/api/roadmap/checkpoint/${attempt.id}/remedial`).send()).status).toBe(400);
  });

  it('leaves out a skill with too few questions, and says so when none are left', async () => {
    const agent = await setup(['vocabulary', 'grammar']);
    const attempt = (await start(agent)).body;
    expect([...new Set(attempt.questions.map((q: { skill: string }) => q.skill))].sort()).toEqual(['grammar', 'vocabulary']);

    await db.delete(placementQuestions);
    const other = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    await other.post('/api/roadmap').send(goal);
    expect((await start(other)).status).toBe(503);
  });

  it('has no checkpoint for the exam-practice stage or a stage that does not exist', async () => {
    const agent = await setup();
    expect((await start(agent, { stageIndex: 2, early: true })).body.code).toBe('not_a_level_stage');
    expect((await start(agent, { stageIndex: 9, early: true })).status).toBe(404);
  });

  it('keeps one learner out of another\'s attempt', async () => {
    const agent = await setup();
    const attempt = (await start(agent)).body;
    const stranger = await signIn(app, await createUser());
    expect((await stranger.get(`/api/roadmap/checkpoint/${attempt.id}`)).status).toBe(404);
    expect((await stranger.post(`/api/roadmap/checkpoint/${attempt.id}/submit`).send({ answers: {} })).status).toBe(404);
  });
});
