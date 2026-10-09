import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(async () => 'Mock reply'),
  listAllowedModels: vi.fn(async () => ['claude-haiku-5-5', 'gpt-5.5']),
}));

const app = createApp();
const message = { messages: [{ role: 'user', content: 'Hello' }] };

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  vi.mocked(sendChatMessage).mockClear();
});
afterAll(closeDb);

describe('POST /api/chat', () => {
  it('requires sign-in', async () => {
    expect((await request(app).post('/api/chat').send(message)).status).toBe(401);
  });

  it('uses the first assigned model when none is requested', async () => {
    const learner = await signIn(app, await createUser());

    const response = await learner.post('/api/chat').send(message);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Mock reply');
    expect(vi.mocked(sendChatMessage).mock.calls[0][0].model).toBe('claude-haiku-5-5');
  });

  it('rejects models outside the learner allowlist and blocked models', async () => {
    const learner = await signIn(app, await createUser());

    const unassigned = await learner.post('/api/chat').send({ ...message, model: 'gpt-5.5' });
    const blocked = await learner.post('/api/chat').send({ ...message, model: 'claude-opus-5-5' });

    expect(unassigned.status).toBe(403);
    expect(blocked.status).toBe(403);
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('honours per-user model assignments', async () => {
    const learner = await signIn(app, await createUser({ allowedModels: ['gpt-5.5'] }));

    expect((await learner.post('/api/chat').send({ ...message, model: 'gpt-5.5' })).status).toBe(200);
    expect((await learner.post('/api/chat').send({ ...message, model: 'claude-haiku-5-5' })).status).toBe(403);
  });

  it('lets admins use any non-blocked model but never opus or fable', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));

    expect((await admin.post('/api/chat').send({ ...message, model: 'gpt-5.5' })).status).toBe(200);
    expect((await admin.post('/api/chat').send({ ...message, model: 'claude-fable-5-1' })).status).toBe(403);
  });

  it('enforces the daily quota and reports usage', async () => {
    const learner = await signIn(app, await createUser());

    for (let i = 0; i < 3; i++) {
      expect((await learner.post('/api/chat').send(message)).status).toBe(200);
    }
    const blocked = await learner.post('/api/chat').send(message);

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('quota_exceeded');
    expect(sendChatMessage).toHaveBeenCalledTimes(3);
    expect((await learner.get('/api/auth/me')).body.user.aiQuota).toEqual({ used: 3, limit: 3 });
  });

  it('applies a per-user limit override and no limit for admins', async () => {
    const learner = await signIn(app, await createUser({ dailyAiLimit: 1 }));
    const admin = await signIn(app, await createUser({ role: 'admin' }));

    expect((await learner.post('/api/chat').send(message)).status).toBe(200);
    expect((await learner.post('/api/chat').send(message)).status).toBe(429);

    for (let i = 0; i < 5; i++) {
      expect((await admin.post('/api/chat').send(message)).status).toBe(200);
    }
  });

  it('does not count failed AI calls against the quota', async () => {
    const learner = await signIn(app, await createUser());
    vi.mocked(sendChatMessage).mockRejectedValueOnce(new Error('boom'));

    expect((await learner.post('/api/chat').send(message)).status).toBe(500);
    expect((await learner.get('/api/auth/me')).body.user.aiQuota.used).toBe(0);
  });
});

describe('GET /api/chat/models', () => {
  it('returns only assigned models that the proxy offers', async () => {
    // gemini-3-flash is assigned by default but missing from the mocked proxy list
    const learner = await signIn(app, await createUser());

    const response = await learner.get('/api/chat/models');

    expect(response.body).toEqual({ models: ['claude-haiku-5-5'], defaultModel: 'claude-haiku-5-5' });
  });

  it('returns every proxy model for admins', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));

    const response = await admin.get('/api/chat/models');

    expect(response.body.models).toEqual(['claude-haiku-5-5', 'gpt-5.5']);
  });
});
