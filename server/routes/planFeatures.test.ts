import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { placementQuestions, roadmaps } from '../db/schema.js';
import { ensurePlans } from '../billing/plans.js';
import { addDays } from '../roadmap/plan.js';
import { lastFullWeek } from '../roadmap/weekly.js';
import { quotaDay } from '../services/aiAccess.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { putSetting } from '../services/settings.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);
const goal = { language: 'en', goalType: 'toeic', targetScore: 600, hoursPerWeek: 5 };

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await ensurePlans();
  await db.delete(placementQuestions);
  aiReply.mockReset();
  await putSetting('billing', { enforce: true });
  await db.insert(placementQuestions).values(
    ['vocabulary', 'grammar', 'reading', 'listening'].flatMap((skill) =>
      Array.from({ length: 6 }, (_, i) => ({ id: `t:${skill}:${i}`, language: 'en' as const, skill, level: 'B1', prompt: `${skill} question ${i}`, context: null, options: ['a', 'b', 'c', 'd'], answerIndex: 1, source: 'manual', status: 'approved' }))
    )
  );
});
afterAll(closeDb);

async function learner(plan?: 'plus') {
  const user = await createUser({ cefrLevel: 'B1' });
  const agent = await signIn(app, user);
  await agent.post('/api/roadmap').send(goal);
  if (plan) {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    await admin.post(`/api/admin/users/${user.id}/subscriptions`).send({ planId: plan, days: 30, note: 'test' });
  }
  return { user, agent };
}

describe('Plus features of the roadmap', () => {
  it('keeps the full checkpoint for Plus and gives it more questions than the short one', async () => {
    const free = await learner();
    const refused = await free.agent.post('/api/roadmap/checkpoint/start').send({ stageIndex: 0, early: true, full: true });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('plan_required');
    const short = await free.agent.post('/api/roadmap/checkpoint/start').send({ stageIndex: 0, early: true });
    expect(short.status).toBe(201);
    expect(short.body.questions).toHaveLength(18);

    const plus = await learner('plus');
    const full = await plus.agent.post('/api/roadmap/checkpoint/start').send({ stageIndex: 0, early: true, full: true });
    expect(full.status).toBe(201);
    expect(full.body.questions.length).toBeGreaterThan(18);
  });

  it('gives the weekly note from the AI to Plus only, from the numbers of the review', async () => {
    aiReply.mockResolvedValue(JSON.stringify({ text: 'You studied on three days and listening went best. Next week, give reading a little time.' }));
    const free = await learner();
    expect((await free.agent.post('/api/roadmap/weekly/ai').send({})).status).toBe(403);

    const plus = await learner('plus');
    const week = lastFullWeek(quotaDay());
    await db.update(roadmaps).set({ startDate: addDays(week.start, -7) }).where(eq(roadmaps.userId, plus.user.id));
    const note = await plus.agent.post('/api/roadmap/weekly/ai').send({});
    expect(note.status).toBe(200);
    expect(note.body.text).toContain('listening went best');
    expect(JSON.stringify(aiReply.mock.calls[0][0].messages)).toContain('shareOfTargetsMet');
  });

  it('has no note to write before there is a week to review', async () => {
    const plus = await learner('plus');
    const none = await plus.agent.post('/api/roadmap/weekly/ai').send({});
    expect(none.status).toBe(404);
    expect(aiReply).not.toHaveBeenCalled();
  });
});
