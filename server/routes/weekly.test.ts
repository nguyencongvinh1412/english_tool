import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { attempts, roadmapTasks, roadmaps } from '../db/schema.js';
import { addDays } from '../roadmap/plan.js';
import { lastFullWeek } from '../roadmap/weekly.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();
const goal = { language: 'en', goalType: 'ielts', targetScore: 6.5, hoursPerWeek: 5 };

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('weekly review', () => {
  it('has nothing to review without a roadmap or in the first week of one', async () => {
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    expect((await agent.get('/api/roadmap/weekly')).body.review).toBeNull();
    await agent.post('/api/roadmap').send(goal);
    expect((await agent.get('/api/roadmap/weekly')).body.review).toBeNull();
  });

  it('counts last week\'s practice against the stage\'s weekly targets', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    const agent = await signIn(app, user);
    await agent.post('/api/roadmap').send(goal);
    const week = lastFullWeek(quotaDay());
    await db.update(roadmaps).set({ startDate: addDays(week.start, -7) }).where(eq(roadmaps.userId, user.id));
    const attempt = (day: string, skill: 'listening' | 'writing', seconds: number) => ({ userId: user.id, activity: skill === 'listening' ? 'dictation' : 'writing-task', skill, language: 'en' as const, day, durationSec: seconds, xp: 0 });
    await db.insert(attempts).values([attempt(week.start, 'listening', 600), attempt(addDays(week.start, 1), 'listening', 900), attempt(addDays(week.start, 2), 'listening', 600), attempt(addDays(week.start, 2), 'listening', 300)]);

    const { review } = (await agent.get('/api/roadmap/weekly')).body;
    expect(review).toMatchObject({ weekStart: week.start, weekEnd: week.end, studyDays: 3, minutes: 40, plannedMinutes: 300, best: 'listening' });
    const listening = review.targets.find((t: { skill?: string }) => t.skill === 'listening');
    expect(listening.have).toBe(4);
    // Reading, writing and speaking were all left alone; ties go to the earlier skill
    expect(review.weak).toBe('reading');
    expect(review.suggestion).toEqual({ skill: 'reading', minutes: 15, days: 2 });
  });

  it('applies the suggestion once as focus tasks on two coming days', async () => {
    const user = await createUser({ cefrLevel: 'B1' });
    const agent = await signIn(app, user);
    await agent.post('/api/roadmap').send(goal);
    expect((await agent.post('/api/roadmap/weekly/apply').send({ skill: 'writing' })).body.added).toBe(2);
    expect((await agent.post('/api/roadmap/weekly/apply').send({ skill: 'writing' })).body.added).toBe(0);
    const rows = await db.select().from(roadmapTasks).where(eq(roadmapTasks.userId, user.id));
    expect(rows.map((r) => r.taskKey)).toEqual(['focus-writing', 'focus-writing']);
    expect(rows.every((r) => r.day > quotaDay())).toBe(true);
    expect((await agent.post('/api/roadmap/weekly/apply').send({ skill: 'dancing' })).status).toBe(400);
  });
});
