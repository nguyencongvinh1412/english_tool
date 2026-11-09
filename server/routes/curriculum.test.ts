import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { attempts, skillLevels } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureSkillUnits } from '../curriculum/data.js';
import { UNITS, unitContent } from '../curriculum/units.js';
import { openFlags } from './curriculum.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(async () => 'Mock reply'),
  listAllowedModels: vi.fn(async () => ['claude-haiku-5-5']),
}));
const aiReply = vi.mocked(sendChatMessage);

const app = createApp();
const UNIT_DIR = path.resolve(process.cwd(), 'server/content/en/units');

const FEEDBACK = {
  overallBand: 6,
  criteria: ['TF', 'ORG', 'LR', 'GRA'].map((key) => ({ key, name: key, band: 6, comment: 'ok' })),
  strengths: ['Clear purpose'],
  improvements: ['Add a closing line'],
  corrections: [{ original: 'informations', corrected: 'information', explanation: 'Uncountable' }],
  improvedVersion: 'Dear Sir or Madam, …',
  checklist: [
    { id: 'polite-questions', met: 'partly', comment: 'One direct question.' },
    { id: 'four-parts', met: 'yes', comment: 'All parts are there.' },
    { id: 'made-up', met: 'yes', comment: 'Not in the lesson.' },
  ],
};

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await ensureSkillUnits();
  aiReply.mockClear();
});
afterAll(closeDb);

describe('lesson drafts', () => {
  it('has a valid draft for every lesson', async () => {
    const files = (await readdir(UNIT_DIR)).filter((f) => f.endsWith('.json'));
    expect(files.map((f) => f.replace('.json', '')).sort()).toEqual(UNITS.map((u) => u.id).sort());
    for (const file of files) {
      const content = unitContent.parse(JSON.parse(await readFile(path.join(UNIT_DIR, file), 'utf8')));
      expect(content.drills.some((d) => d.type === 'order'), file).toBe(true);
    }
  });
});

describe('openFlags', () => {
  const units = UNITS.slice(0, 4);
  const ids = units.map((u) => u.id);
  const ready = new Set(ids);

  it('opens lessons one after another', () => {
    expect(openFlags(units, new Set(), ready, null)).toEqual([true, false, false, false]);
    expect(openFlags(units, new Set(ids.slice(0, 2)), ready, null)).toEqual([true, true, true, false]);
  });

  it('skips lessons below the learner level and lessons not written yet', () => {
    // Units 0-1 are A2: a B1 learner starts at the first B1 lesson
    expect(openFlags(units, new Set(), ready, 'B1')).toEqual([true, true, true, false]);
    expect(openFlags(units, new Set(), new Set(ids.slice(1)), null)).toEqual([true, true, false, false]);
  });
});

describe('learning path', () => {
  it('lists the writing path with the learner progress and level', async () => {
    const user = await createUser();
    await db.insert(skillLevels).values({ userId: user.id, language: 'en', skill: 'writing', level: 'B1', confidence: 'low', source: 'placement' });
    const learner = await signIn(app, user);

    const { body } = await learner.get('/api/learn/writing').expect(200);
    expect(body.learnerLevel).toBe('B1');
    expect(body.units).toHaveLength(UNITS.length);
    expect(body.units.map((u: { open: boolean }) => u.open)).toEqual([true, true, true, false, false, false]);
    expect(body.units[0]).toMatchObject({ id: 'email-basics', ready: true, progress: null });

    expect((await learner.get('/api/learn/speaking')).status).toBe(404);
    expect((await request(app).get('/api/learn/writing')).status).toBe(401);
  });

  it('serves a lesson, and keeps locked lessons readable but not practisable', async () => {
    const learner = await signIn(app, await createUser());
    const { body } = await learner.get('/api/learn/units/email-basics').expect(200);
    expect(body).toMatchObject({ open: true, unit: { order: 1, level: 'A2' }, next: { id: 'email-invitation' } });
    expect(body.content.checklist.length).toBeGreaterThanOrEqual(3);

    const locked = await learner.get('/api/learn/units/email-complaint').expect(200);
    expect(locked.body.open).toBe(false);
    const write = await learner.post('/api/learn/units/email-complaint/write').send({ response: 'Dear Sir or Madam, …' });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe('locked');
    expect(aiReply).not.toHaveBeenCalled();

    expect((await learner.get('/api/learn/units/no-such-unit')).status).toBe(404);
  });

  it('saves drills, scores the task with the lesson checklist and opens the next lesson', async () => {
    const learner = await signIn(app, await createUser());
    const drills = await learner.post('/api/learn/units/email-basics/drills').send({ correct: 4, total: 5 }).expect(200);
    expect(drills.body.progress).toMatchObject({ drillScore: 80, completedAt: null });

    aiReply.mockResolvedValueOnce(JSON.stringify(FEEDBACK));
    const scored = await learner
      .post('/api/learn/units/email-basics/write')
      .send({ response: 'Dear Sir or Madam, I am writing to ask about your course. Could you send me informations?' })
      .expect(200);

    const prompt = aiReply.mock.calls[0][0];
    expect(prompt.messages[0].content).toContain('four-parts:');
    expect(prompt.messages[0].content).toContain('LEARNER RESPONSE');
    // Only the lesson's points, in the lesson's order
    expect(scored.body.feedback.checklist.map((c: { id: string }) => c.id)).toEqual(['four-parts', 'polite-questions']);
    expect(scored.body.progress).toMatchObject({ drillScore: 80, bestBand: 6, attempts: 1 });
    expect(scored.body.progress.completedAt).not.toBeNull();
    expect(scored.body.attempt).toMatchObject({ activity: 'writing-task', contentRef: 'unit:email-basics', score: 6 });

    aiReply.mockResolvedValueOnce(JSON.stringify({ ...FEEDBACK, overallBand: 5 }));
    const again = await learner.post('/api/learn/units/email-basics/write').send({ response: 'Another try at the email.' }).expect(200);
    expect(again.body.progress).toMatchObject({ bestBand: 6, attempts: 2 });

    const path = await learner.get('/api/learn/writing').expect(200);
    expect(path.body.units[1].open).toBe(true);
    expect(path.body.units[2].open).toBe(false);
    expect(await db.select().from(attempts)).toHaveLength(2);
  });
});

describe('admin review of lessons', () => {
  it('lists, edits and protects edited lessons from draft reloads', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const learner = await signIn(app, await createUser());
    expect((await learner.get('/api/admin/units')).status).toBe(403);

    const list = await admin.get('/api/admin/units').expect(200);
    expect(list.body.units.find((u: { id: string }) => u.id === 'email-basics')).toMatchObject({ status: 'draft', edited: false });

    const { body } = await admin.get('/api/admin/units/email-basics').expect(200);
    const content = { ...body.content, task: { ...body.content.task, title: 'Edited title' } };
    await admin.put('/api/admin/units/email-basics').send({ content, status: 'reviewed' }).expect(200);
    expect((await admin.put('/api/admin/units/email-basics').send({ content: { objectives: [] }, status: 'reviewed' })).status).toBe(400);

    await ensureSkillUnits();
    const lesson = await learner.get('/api/learn/units/email-basics').expect(200);
    expect(lesson.body.content.task.title).toBe('Edited title');
  });
});
