import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { contentItems, skillLevels } from '../db/schema.js';
import { ensureGateContent, GATE_GROUPS } from '../ieltsPath/gateContent.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();
const TARGETS = { listening: 7.5, reading: 7.5, writing: 6.5, speaking: 6.5 };
const body = { bandTargets: TARGETS, examDate: '2099-05-10', dailyMinutes: 180, restDays: [0] };

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await ensureGateContent();
});
afterAll(closeDb);

type Agent = Awaited<ReturnType<typeof signIn>>;

/** Answers every question of a gate group set; `wrong` of them (from the start) are answered wrongly */
function answersFor(groupIds: string[], wrong = 0): Record<string, number | string> {
  const answers: Record<string, number | string> = {};
  let index = 0;
  for (const id of groupIds) {
    const group = GATE_GROUPS.find((g) => g.id === id)!;
    const questions = (group.payload as { questions: { type: string; answerIndex?: number; answer?: string; answers?: string[] }[] }).questions;
    questions.forEach((q, i) => {
      const bad = index++ < wrong;
      const key = `${id}:${i}`;
      if (q.type === 'mcq') answers[key] = bad ? (q.answerIndex! + 1) % 4 : q.answerIndex!;
      else if (q.type === 'tfng') answers[key] = bad ? (['true', 'false', 'not_given'].indexOf(q.answer!) + 1) % 3 : ['true', 'false', 'not_given'].indexOf(q.answer!);
      else answers[key] = bad ? 'nothing' : q.answers![0];
    });
  }
  return answers;
}

async function takeSkill(agent: Agent, skill: string, groupIds: string[], wrong: number) {
  const started = await agent.post(`/api/ielts-path/gates/0/skills/${skill}/start`).send({});
  expect(started.status).toBe(201);
  const sessionId = started.body.sessionId as string;
  // Starting again resumes the same session
  expect((await agent.post(`/api/ielts-path/gates/0/skills/${skill}/start`).send({})).body.sessionId).toBe(sessionId);
  expect((await agent.patch(`/api/exams/sessions/${sessionId}`).send({ answers: answersFor(groupIds, wrong) })).status).toBe(200);
  const submitted = await agent.post(`/api/exams/sessions/${sessionId}/submit`).send({});
  expect(submitted.status).toBe(200);
  return submitted.body.session;
}

describe('IELTS Path', () => {
  it('validates the targets', async () => {
    const agent = await signIn(app, await createUser());
    expect((await agent.post('/api/ielts-path').send({ ...body, bandTargets: { ...TARGETS, writing: 8, speaking: 8 } })).status).toBe(400);
    expect((await agent.post('/api/ielts-path').send({ ...body, dailyMinutes: 20 })).status).toBe(400);
    expect((await agent.get('/api/ielts-path')).body.path).toBeNull();
  });

  it('runs Gate 0 with writing and speaking skipped and sets a cautious starting phase', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const created = await agent.post('/api/ielts-path').send(body);
    expect(created.status).toBe(201);
    expect(created.body.path).toMatchObject({ overallTarget: 7, endPhase: 6, startPhase: null, plan: null });
    expect(created.body.path.gate0.status).toBe('not_started');

    // Listening and reading cannot be skipped
    expect((await agent.post('/api/ielts-path/gates/0/skills/listening/skip').send({})).status).toBe(400);
    await agent.post('/api/ielts-path/gates/0/skills/writing/skip').send({});
    const skipped = await agent.post('/api/ielts-path/gates/0/skills/speaking/skip').send({});
    expect(skipped.body.gate.skills.filter((s: { status: string }) => s.status === 'skipped')).toHaveLength(2);

    // 20 listening questions, 10 wrong -> 20/40 -> 5.5; 26 reading questions, 10 wrong -> 25/40 -> 6.0
    const listening = await takeSkill(agent, 'listening', ['gate-0-listening-1', 'gate-0-listening-2'], 10);
    expect(listening.result.listening).toMatchObject({ correct: 10, total: 20, band: 5.5 });
    await takeSkill(agent, 'reading', ['gate-0-reading-1', 'gate-0-reading-2'], 10);

    const gate = (await agent.get('/api/ielts-path/gates/0')).body.gate;
    expect(gate.status).toBe('finished');
    expect(gate.bands).toEqual({ listening: 5.5, reading: 6, writing: null, speaking: null });

    // L/R meet Gate 3 (5.5); without writing and speaking the start is one phase earlier than 4
    const path = (await agent.get('/api/ielts-path')).body.path;
    expect(path.startPhase).toBe(3);
    expect(path.plan.phases).toEqual([3, 4, 5, 6]);
    expect(path.plan.syllabusWeeks).toBe(18);

    const levels = await db.select().from(skillLevels).where(eq(skillLevels.userId, user.id));
    expect(levels.map((l) => [l.skill, l.band, l.source]).sort()).toEqual([
      ['listening', 5.5, 'gate'],
      ['reading', 6, 'gate'],
    ]);

    // Gate 0 cannot be taken again
    expect((await agent.post('/api/ielts-path/gates/0/skills/listening/start').send({})).status).toBe(409);
  });

  it('keeps gate groups out of the practice library and test bank', async () => {
    const rows = await db.select({ status: contentItems.status }).from(contentItems);
    expect(rows.length).toBe(GATE_GROUPS.length);
    expect(rows.every((r) => r.status === 'archived')).toBe(true);
    const agent = await signIn(app, await createUser());
    const listed = await agent.get('/api/content?kind=speaking-ielts');
    expect(listed.body.items ?? []).toHaveLength(0);
  });

  it('updates the settings and archives the path', async () => {
    const agent = await signIn(app, await createUser());
    await agent.post('/api/ielts-path').send(body);
    const updated = await agent.patch('/api/ielts-path').send({ dailyMinutes: 240, examDate: null });
    expect(updated.body.path).toMatchObject({ dailyMinutes: 240, examDate: null });
    expect((await agent.delete('/api/ielts-path')).status).toBe(204);
    expect((await agent.get('/api/ielts-path')).body.path).toBeNull();
  });
});
