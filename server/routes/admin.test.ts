import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { recordUsage } from '../services/aiAccess.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  listAllowedModels: vi.fn(async () => ['claude-haiku-5-5', 'gemini-3-flash', 'gpt-5.5']),
}));

const app = createApp();

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('admin authorization', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });

  it('forbids learners', async () => {
    const learner = await signIn(app, await createUser({ role: 'learner' }));
    const response = await learner.get('/api/admin/users');

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('forbidden');
  });
});

describe('admin user management', () => {
  it('lists users with today usage and effective limits', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const learner = await createUser({ role: 'learner', email: 'learner@test.dev' });
    await recordUsage(learner, 'chat');
    await recordUsage(learner, 'chat');

    const response = await admin.get('/api/admin/users');
    const row = response.body.users.find((u: { id: string }) => u.id === learner.id);

    expect(response.status).toBe(200);
    expect(row).toMatchObject({
      aiUsedToday: 2,
      effectiveDailyAiLimit: 3,
      allowedModels: null,
      effectiveAllowedModels: ['claude-haiku-5-5', 'gemini-3-flash'],
    });
    expect(row).not.toHaveProperty('passwordHash');
  });

  it('assigns models and a custom daily limit to a user', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const learner = await createUser();

    const response = await admin
      .patch(`/api/admin/users/${learner.id}`)
      .send({ allowedModels: ['gpt-5.5'], dailyAiLimit: 50 });
    expect(response.status).toBe(200);

    const list = await admin.get('/api/admin/users');
    const row = list.body.users.find((u: { id: string }) => u.id === learner.id);
    expect(row).toMatchObject({ effectiveAllowedModels: ['gpt-5.5'], effectiveDailyAiLimit: 50 });
  });

  it.each(['claude-opus-5-5', 'claude-fable-5-1'])('refuses to assign blocked model %s', async (model) => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const learner = await createUser();

    const response = await admin.patch(`/api/admin/users/${learner.id}`).send({ allowedModels: [model] });

    expect(response.status).toBe(400);
  });

  it('prevents an admin from locking themselves out', async () => {
    const adminUser = await createUser({ role: 'admin' });
    const admin = await signIn(app, adminUser);

    const response = await admin.patch(`/api/admin/users/${adminUser.id}`).send({ status: 'disabled' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('self_lockout');
  });

  it('disabling a user ends their sessions immediately', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const learnerUser = await createUser();
    const learner = await signIn(app, learnerUser);

    await admin.patch(`/api/admin/users/${learnerUser.id}`).send({ status: 'disabled' });

    expect((await learner.get('/api/auth/me')).status).toBe(401);
  });
});

describe('admin invite codes', () => {
  it('creates, lists, and revokes invite codes', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));

    const created = await admin.post('/api/admin/invites').send({ maxUses: 3, expiresInDays: 7, note: 'Team' });
    expect(created.status).toBe(201);
    expect(created.body.invite.code).toMatch(/^ET-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const listed = await admin.get('/api/admin/invites');
    expect(listed.body.invites).toHaveLength(1);

    const revoked = await admin.delete(`/api/admin/invites/${created.body.invite.code}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.invite.revokedAt).not.toBeNull();

    const register = await request(app).post('/api/auth/register').send({
      email: 'late@test.dev',
      password: 'a-strong-password',
      displayName: 'Late',
      inviteCode: created.body.invite.code,
    });
    expect(register.status).toBe(400);
  });

  it('lists assignable models from the proxy', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));

    const response = await admin.get('/api/admin/models');

    expect(response.body.models).toEqual(['claude-haiku-5-5', 'gemini-3-flash', 'gpt-5.5']);
  });
});
