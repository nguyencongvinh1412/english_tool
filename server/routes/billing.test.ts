import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { aiUsage, appSettings } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { estimateCredits } from '../billing/pricing.js';
import { ensurePlans } from '../billing/plans.js';
import { ensureBuiltinContent } from '../content/seeds.js';
import { putSetting } from '../services/settings.js';
import { decryptSecret, encryptSecret } from '../services/secrets.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);
const message = { messages: [{ role: 'user', content: 'Hello' }], context: { mode: 'conversation', topic: 'Travel' } };

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await ensurePlans();
  await ensureBuiltinContent();
  aiReply.mockReset();
  aiReply.mockResolvedValue('A reply of reasonable length for a chat message.');
});
afterAll(closeDb);

const enforce = () => putSetting('billing', { enforce: true });

describe('credits', () => {
  it('estimates cost per model from tokens', () => {
    // 1,000 input and 1,000 output tokens: Haiku $0.0006, Sonnet $0.012
    const reply = 'x'.repeat(3200);
    expect(estimateCredits('claude-haiku-5-5', 1000, reply)).toBeCloseTo(0.6, 1);
    expect(estimateCredits('claude-sonnet-5-5', 1000, reply)).toBeCloseTo(12, 0);
    expect(estimateCredits('gemini-3-flash', 1000, reply)).toBeGreaterThan(estimateCredits('claude-haiku-5-5', 1000, reply));
  });

  it('counts credits even while plans are not enforced, without limiting anyone', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await agent.post('/api/chat').send(message);
    const me = (await agent.get('/api/auth/me')).body.user;
    expect(me.plan).toMatchObject({ id: 'free', enforced: false });
    expect(me.credits.day.limit).toBeNull();
    expect(me.credits.day.used).toBeGreaterThan(0);
  });
});

describe('plan enforcement', () => {
  it('stops a free learner at the daily credit limit and lifts it with a plan', async () => {
    const user = await createUser();
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const agent = await signIn(app, user);
    await enforce();
    // Free allows 15 credits a day: nearly all of it is already used
    await db.insert(aiUsage).values({ userId: user.id, day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()), feature: 'chat', requestCount: 1, credits: 15 });

    const blocked = await agent.post('/api/chat').send(message);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('credits_exhausted');

    const granted = await admin.post(`/api/admin/users/${user.id}/subscriptions`).send({ planId: 'plus', days: 30, note: 'paid by transfer' });
    expect(granted.status).toBe(201);
    expect((await agent.post('/api/chat').send(message)).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user.plan).toMatchObject({ id: 'plus', enforced: true });
  });

  it('limits models and full tests to what the plan includes', async () => {
    const agent = await signIn(app, await createUser());
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    await enforce();

    expect((await agent.post('/api/chat').send({ ...message, model: 'gemini-3-flash' })).status).toBe(403);
    expect((await agent.post('/api/chat').send({ ...message, model: 'claude-haiku-5-5' })).status).toBe(200);
    expect((await agent.post('/api/exams/toeic/sessions').send({ mode: 'full' })).body.code).toBe('plan_required');
    expect((await agent.post('/api/exams/jlpt/sessions').send({ level: 'N5', mode: 'part', section: 'vocab' })).body.code).toBe('plan_required');
    // Admins are never limited
    expect((await admin.post('/api/chat').send({ ...message, model: 'gemini-3-flash' })).status).toBe(200);
  });

  it('allows a few AI-scored writings a week on the free plan', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await enforce();
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    await db.insert(aiUsage).values({ userId: user.id, day, feature: 'score-writing', requestCount: 2, credits: 3 });
    const res = await agent.post('/api/ai/score-writing').send({ contentId: 'builtin-writing-task2-remote', response: 'A long enough response text for the schema to accept it.' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('plan_limit');
  });

  it('shows the plans, ends the previous plan when a new one is granted, and lets an admin edit plans', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    await admin.put('/api/admin/billing').send({ paymentInstructions: 'Chuyển khoản tới 0123456789, nội dung: email của bạn' });

    const pricing = (await agent.get('/api/billing/plans')).body;
    expect(pricing.plans.map((p: { id: string }) => p.id)).toEqual(['free', 'plus', 'pro']);
    expect(pricing.plans[1].priceVnd).toEqual({ month: 79_000, quarter: 199_000, year: 599_000 });
    expect(pricing.paymentInstructions).toContain('0123456789');

    await admin.post(`/api/admin/users/${user.id}/subscriptions`).send({ planId: 'plus', days: 30 });
    await admin.post(`/api/admin/users/${user.id}/subscriptions`).send({ planId: 'pro', days: 90 });
    const history = (await admin.get(`/api/admin/users/${user.id}/subscriptions`)).body.subscriptions;
    expect(history.map((s: { planId: string; cancelledAt: string | null }) => [s.planId, Boolean(s.cancelledAt)]).sort()).toEqual([['plus', true], ['pro', false]]);

    await admin.put('/api/admin/plans/plus').send({ monthlyCredits: 2000, priceVnd: { month: 99_000, quarter: 249_000, year: 749_000 } });
    expect((await agent.get('/api/billing/plans')).body.plans[1]).toMatchObject({ monthlyCredits: 2000, priceVnd: { month: 99_000 } });

    // Learners cannot use the admin tools
    expect((await agent.put('/api/admin/billing').send({ enforce: true })).status).toBe(403);
    expect((await agent.post(`/api/admin/users/${user.id}/subscriptions`).send({ planId: 'pro', days: 5 })).status).toBe(403);

    // A cancelled or expired plan falls back to free
    const [current] = history.filter((s: { cancelledAt: string | null }) => !s.cancelledAt);
    await admin.delete(`/api/admin/subscriptions/${current.id}`);
    expect((await agent.get('/api/auth/me')).body.user.plan.id).toBe('free');
  });
});

describe('AI source', () => {
  it('encrypts saved keys, shows them masked and switches requests to the official API', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    expect(decryptSecret(encryptSecret('sk-test-1234'))).toBe('sk-test-1234');

    const initial = (await admin.get('/api/admin/ai-settings')).body;
    expect(initial).toMatchObject({ mode: 'proxy', canStoreKeys: true, keys: { anthropic: { source: null }, gemini: { source: null } } });

    // Official mode without a key says so
    await admin.put('/api/admin/ai-settings').send({ mode: 'official' });
    expect((await admin.post('/api/chat').send({ ...message, model: 'claude-haiku-5-5' })).status).toBe(503);

    const saved = await admin.put('/api/admin/ai-settings').send({ keys: { anthropic: 'sk-ant-secret-WXYZ' } });
    expect(saved.body.keys.anthropic).toEqual({ source: 'admin', last4: 'WXYZ' });
    expect(JSON.stringify(saved.body)).not.toContain('sk-ant-secret');
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'ai'));
    expect(JSON.stringify(row.value)).not.toContain('sk-ant-secret');

    expect((await admin.post('/api/chat').send({ ...message, model: 'claude-haiku-5-5' })).status).toBe(200);
    expect(aiReply.mock.calls.at(-1)?.[1]).toMatchObject({ url: 'https://api.anthropic.com/v1/chat/completions', apiKey: 'sk-ant-secret-WXYZ', reasoning: false });

    // Models without an official API are refused; the models list only offers what has a key
    expect((await admin.post('/api/chat').send({ ...message, model: 'gpt-5.5' })).status).toBe(503);
    expect((await admin.get('/api/chat/models')).body.models).toEqual(['claude-haiku-5-5']);

    // Back to the proxy: no target, the proxy settings apply
    await admin.put('/api/admin/ai-settings').send({ mode: 'proxy', keys: { anthropic: '' } });
    await admin.post('/api/chat').send({ ...message, model: 'claude-haiku-5-5' });
    expect(aiReply.mock.calls.at(-1)?.[1]).toBeUndefined();
  });

  it('tests the connection and keeps the keys admin-only', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    aiReply.mockResolvedValueOnce('OK');
    expect((await admin.post('/api/admin/ai-settings/test').send({ model: 'claude-haiku-5-5' })).body).toMatchObject({ ok: true, reply: 'OK' });
    aiReply.mockRejectedValueOnce(new Error('Authentication failed'));
    expect((await admin.post('/api/admin/ai-settings/test').send({ model: 'claude-haiku-5-5' })).body).toMatchObject({ ok: false, error: 'Authentication failed' });

    const learner = await signIn(app, await createUser());
    expect((await learner.get('/api/admin/ai-settings')).status).toBe(403);
    expect((await learner.put('/api/admin/ai-settings').send({ mode: 'official' })).status).toBe(403);
  });
});
