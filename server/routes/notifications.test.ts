import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { attempts } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();
const goal = { language: 'en', goalType: 'ielts', targetScore: 6.5, hoursPerWeek: 5 };

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('notifications', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });

  it('reminds once a day, only after the chosen time and only when nothing was studied', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);

    expect((await agent.get('/api/notifications?time=19:59')).body.notifications).toEqual([]);
    const first = (await agent.get('/api/notifications?time=20:05')).body;
    expect(first.unread).toBe(1);
    expect(first.notifications[0]).toMatchObject({ kind: 'reminder', read: false });
    // Asking again does not repeat it
    expect((await agent.get('/api/notifications?time=21:30')).body.notifications).toHaveLength(1);
  });

  it('stays quiet when the learner has already studied today', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await db.insert(attempts).values({ userId: user.id, activity: 'dictation', skill: 'listening', language: 'en', day: quotaDay(), durationSec: 300, xp: 0 });
    expect((await agent.get('/api/notifications?time=22:00')).body.notifications).toEqual([]);
  });

  it('keeps settings, honours them, and marks notifications read', async () => {
    const agent = await signIn(app, await createUser());
    expect((await agent.get('/api/notifications/settings')).body.settings).toEqual({ dailyReminder: true, reminderTime: '20:00', checkpointAlert: true, weeklySummary: true });

    expect((await agent.put('/api/notifications/settings').send({ dailyReminder: false, reminderTime: '07:30', checkpointAlert: true, weeklySummary: true })).status).toBe(200);
    expect((await agent.get('/api/notifications?time=23:00')).body.notifications).toEqual([]);
    expect((await agent.put('/api/notifications/settings').send({ dailyReminder: true, reminderTime: '25:00', checkpointAlert: true, weeklySummary: true })).status).toBe(400);

    await agent.put('/api/notifications/settings').send({ dailyReminder: true, reminderTime: '07:30', checkpointAlert: true, weeklySummary: true });
    const { notifications } = (await agent.get('/api/notifications?time=23:00')).body;
    expect(notifications).toHaveLength(1);
    await agent.post('/api/notifications/read').send({});
    expect((await agent.get('/api/notifications')).body.unread).toBe(0);
  });

  it('adds the weekly note once per week for a learner with a roadmap', async () => {
    const agent = await signIn(app, await createUser({ cefrLevel: 'B1' }));
    await agent.post('/api/roadmap').send(goal);
    const kinds = async () => (await agent.get('/api/notifications?time=08:00')).body.notifications.map((n: { kind: string }) => n.kind);
    expect(await kinds()).toEqual(['weekly']);
    expect(await kinds()).toEqual(['weekly']);
  });
});
