import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { attempts, passwordResets, users } from '../db/schema.js';
import { createUser, resetDb, signIn, TEST_PASSWORD } from '../test/helpers.js';

const app = createApp();
const NEW_PASSWORD = 'a-brand-new-password';

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

describe('password reset links', () => {
  it('lets the user set a new password once and signs out their devices', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const learner = await createUser();
    const learnerAgent = await signIn(app, learner);

    const created = await admin.post(`/api/admin/users/${learner.id}/password-reset`);
    expect(created.status).toBe(201);
    const { token } = created.body;

    const reset = await request(app).post('/api/auth/password-reset').send({ token, password: NEW_PASSWORD });
    expect(reset.status).toBe(204);

    expect((await learnerAgent.get('/api/auth/me')).status).toBe(401);
    expect((await login(learner.email, TEST_PASSWORD)).status).toBe(401);
    expect((await login(learner.email, NEW_PASSWORD)).status).toBe(200);

    const reused = await request(app).post('/api/auth/password-reset').send({ token, password: 'another-password-1' });
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('invalid_reset_token');
  });

  it('rejects expired links and links replaced by a newer one', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const learner = await createUser();
    const first = (await admin.post(`/api/admin/users/${learner.id}/password-reset`)).body.token;
    const second = (await admin.post(`/api/admin/users/${learner.id}/password-reset`)).body.token;

    expect((await request(app).post('/api/auth/password-reset').send({ token: first, password: NEW_PASSWORD })).status).toBe(400);

    await db.update(passwordResets).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).post('/api/auth/password-reset').send({ token: second, password: NEW_PASSWORD })).status).toBe(400);
  });

  it('is admin-only to create', async () => {
    const learner = await createUser();
    const agent = await signIn(app, learner);
    expect((await agent.post(`/api/admin/users/${learner.id}/password-reset`)).status).toBe(403);
  });
});

describe('deleting your account', () => {
  it('needs the password, then removes the user and their data', async () => {
    const learner = await createUser();
    const agent = await signIn(app, learner);
    await db.insert(attempts).values({ userId: learner.id, activity: 'dictation', skill: 'listening', day: '2026-10-10', xp: 10 });

    const wrong = await agent.delete('/api/me').send({ password: 'not-my-password' });
    expect(wrong.status).toBe(400);

    expect((await agent.delete('/api/me').send({ password: TEST_PASSWORD })).status).toBe(204);
    expect(await db.select().from(users).where(eq(users.id, learner.id))).toEqual([]);
    expect(await db.select().from(attempts).where(eq(attempts.userId, learner.id))).toEqual([]);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('keeps at least one admin', async () => {
    const admin = await createUser({ role: 'admin' });
    const agent = await signIn(app, admin);
    const res = await agent.delete('/api/me').send({ password: TEST_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('last_admin');

    await createUser({ role: 'admin' });
    expect((await agent.delete('/api/me').send({ password: TEST_PASSWORD })).status).toBe(204);
  });
});
