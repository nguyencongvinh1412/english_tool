import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { inviteCodes } from '../db/schema.js';
import { createInvite, createUser, resetDb, signIn, TEST_PASSWORD } from '../test/helpers.js';

const app = createApp();

const validRegistration = {
  email: 'New.Learner@Test.dev',
  password: 'a-strong-password',
  displayName: 'New Learner',
};

beforeAll(runMigrations);
beforeEach(resetDb);
afterAll(closeDb);

describe('POST /api/auth/register', () => {
  it('creates an account with a valid invite, signs in, and grants the invite role', async () => {
    const invite = await createInvite({ role: 'learner' });
    const agent = request.agent(app);

    const response = await agent
      .post('/api/auth/register')
      .send({ ...validRegistration, inviteCode: invite.code.toLowerCase() });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: 'new.learner@test.dev', role: 'learner' });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.headers['set-cookie'][0]).toMatch(/et_session=.+; .*HttpOnly/);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.aiQuota).toEqual({ used: 0, limit: 3 });
  });

  it('rejects an unknown invite code', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegistration, inviteCode: 'ET-NOPE-NOPE' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_invite');
  });

  it.each([
    ['exhausted', { maxUses: 1, usedCount: 1 }],
    ['revoked', { revokedAt: new Date() }],
    ['expired', { expiresAt: new Date(Date.now() - 1000) }],
  ])('rejects an %s invite code', async (_label, overrides) => {
    const invite = await createInvite(overrides);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegistration, inviteCode: invite.code });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_invite');
  });

  it('rejects a duplicate email case-insensitively without consuming the invite', async () => {
    await createUser({ email: 'new.learner@test.dev' });
    const invite = await createInvite({ maxUses: 5 });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegistration, inviteCode: invite.code });

    expect(response.status).toBe(409);
    const [after] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, invite.code));
    expect(after.usedCount).toBe(0);
  });

  it('counts each successful registration against max uses', async () => {
    const invite = await createInvite({ maxUses: 2 });

    for (const email of ['a@test.dev', 'b@test.dev']) {
      const ok = await request(app)
        .post('/api/auth/register')
        .send({ ...validRegistration, email, inviteCode: invite.code });
      expect(ok.status).toBe(201);
    }

    const third = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegistration, email: 'c@test.dev', inviteCode: invite.code });
    expect(third.status).toBe(400);
  });

  it('validates the password length', async () => {
    const invite = await createInvite();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegistration, password: 'short', inviteCode: invite.code });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.issues[0].path).toBe('password');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the right password and records last login', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.id).toBe(user.id);
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const user = await createUser();

    const wrongPassword = await request(app).post('/api/auth/login').send({ email: user.email, password: 'nope-nope-nope' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'ghost@test.dev', password: TEST_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });

  it('rate limits repeated failures', async () => {
    const user = await createUser({ email: 'limited@test.dev' });

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    }
    const blocked = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('rate_limited');
  });

  it('refuses disabled accounts', async () => {
    const user = await createUser({ status: 'disabled' });

    const response = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('account_disabled');
  });
});

describe('sessions', () => {
  it('logout ends the session', async () => {
    const agent = await signIn(app, await createUser());

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('blocks state-changing requests from another origin', async () => {
    const agent = await signIn(app, await createUser());

    const response = await agent.patch('/api/me').set('Origin', 'https://evil.example').send({ displayName: 'Hacked' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('bad_origin');
  });
});

describe('/api/me', () => {
  it('updates own profile fields and ignores unknown ones', async () => {
    const agent = await signIn(app, await createUser());

    const ok = await agent.patch('/api/me').send({ displayName: 'Vinh', uiLocale: 'vi', targetExam: 'ielts' });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ displayName: 'Vinh', uiLocale: 'vi', targetExam: 'ielts' });

    const escalation = await agent.patch('/api/me').send({ role: 'admin' });
    expect(escalation.status).toBe(400);
  });

  it('changing the password signs out other devices but keeps this one', async () => {
    const user = await createUser();
    const laptop = await signIn(app, user);
    const phone = await signIn(app, user);

    const response = await laptop
      .post('/api/me/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'brand-new-password' });

    expect(response.status).toBe(204);
    expect((await laptop.get('/api/auth/me')).status).toBe(200);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
  });

  it('requires the current password to change it', async () => {
    const agent = await signIn(app, await createUser());

    const response = await agent
      .post('/api/me/password')
      .send({ currentPassword: 'not-my-password', newPassword: 'brand-new-password' });

    expect(response.status).toBe(400);
  });
});
