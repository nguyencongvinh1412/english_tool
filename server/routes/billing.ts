/**
 * Billing Routes
 * Plans for learners (pricing page), and admin tools: edit plans, grant plans by hand, turn plan
 * enforcement on, write payment instructions, and choose the AI source (proxy or official APIs)
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiUsage, plans, subscriptions, users } from '../db/schema.js';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { activeSubscription, billingEnforced, entitlementsOf, loadPlans, PLAN_IDS, type PlanLimits } from '../billing/plans.js';
import { getSetting, putSetting } from '../services/settings.js';
import { aiSettingsView, saveAiSettings } from '../services/aiProvider.js';
import { isCliProxyConfigured, isModelAllowed } from '../services/cliproxy.js';
import { runAI } from '../services/ai.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const planId = z.enum(PLAN_IDS);

const limitsSchema = z.object({
  weeklyWriting: z.number().int().min(0).max(1000).nullable(),
  weeklySpeaking: z.number().int().min(0).max(1000).nullable(),
  fullTests: z.boolean(),
  importedTests: z.boolean(),
});

const priceSchema = z.object({
  month: z.number().int().min(0).max(100_000_000),
  quarter: z.number().int().min(0).max(100_000_000),
  year: z.number().int().min(0).max(100_000_000),
});

const updatePlanSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    monthlyCredits: z.number().int().min(0).max(1_000_000),
    dailyCredits: z.number().int().min(0).max(1_000_000),
    models: z.array(z.string().min(1).max(100)).max(20).refine((models) => models.every(isModelAllowed), 'Contains a blocked model'),
    limits: limitsSchema,
    priceVnd: priceSchema.nullable(),
    isPublic: z.boolean(),
  })
  .partial()
  .strict();

const grantSchema = z
  .object({
    planId,
    /** Either a number of days or an exact end date */
    days: z.number().int().min(1).max(3660).optional(),
    endsAt: z.coerce.date().optional(),
    source: z.enum(['admin', 'trial', 'payment', 'referral']).default('admin'),
    note: z.string().trim().max(300).optional(),
  })
  .refine((body) => body.days !== undefined || body.endsAt !== undefined, { message: 'days or endsAt is required', path: ['days'] });

const billingSettingsSchema = z
  .object({
    enforce: z.boolean(),
    /** Shown on the pricing page: how to pay (bank, QR, contact) */
    paymentInstructions: z.string().trim().max(2000),
  })
  .partial()
  .strict();

const aiSettingsSchema = z
  .object({
    mode: z.enum(['proxy', 'official']),
    /** A key to save; an empty string removes the saved key */
    keys: z.object({ anthropic: z.string().trim().max(300).optional(), gemini: z.string().trim().max(300).optional() }).partial(),
  })
  .partial()
  .strict();

const testSchema = z.object({ model: z.string().trim().min(1).max(100) });

/**
 * Creates the billing router
 * @returns Router mounted at /api
 */
export function createBillingRouter(): Router {
  const router = Router();

  /**
   * GET /billing/plans - Public plans, the caller's plan and how to pay
   */
  router.get('/billing/plans', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const [all, entitlements, settings] = await Promise.all([loadPlans(), entitlementsOf(user), getSetting<{ paymentInstructions?: string }>('billing')]);
    res.json({
      plans: all
        .filter((p) => p.isPublic)
        .map((p) => ({ id: p.id, name: p.name, monthlyCredits: p.monthlyCredits, dailyCredits: p.dailyCredits, models: p.models, limits: p.limits as PlanLimits, priceVnd: p.priceVnd })),
      current: { planId: entitlements.plan.id, endsAt: entitlements.endsAt, enforced: entitlements.enforced, credits: entitlements.credits },
      paymentInstructions: settings?.paymentInstructions ?? '',
    });
  });

  const admin = Router();
  admin.use(requireAuth, requireRole('admin'));

  /**
   * GET /admin/billing - Settings, all plans, and how many users and credits each plan has
   */
  admin.get('/billing', async (_req, res) => {
    const settings = await getSetting<{ paymentInstructions?: string }>('billing');
    const now = new Date();
    const counts = await db
      .select({ planId: subscriptions.planId, users: sql<number>`count(distinct ${subscriptions.userId})::int` })
      .from(subscriptions)
      .where(and(gt(subscriptions.endsAt, now), isNull(subscriptions.cancelledAt)))
      .groupBy(subscriptions.planId);
    const [{ credits, requests }] = await db
      .select({ credits: sql<number>`coalesce(sum(${aiUsage.credits}), 0)::float`, requests: sql<number>`coalesce(sum(${aiUsage.requestCount}), 0)::int` })
      .from(aiUsage)
      .where(sql`${aiUsage.day} >= date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date`);
    res.json({
      enforce: await billingEnforced(),
      paymentInstructions: settings?.paymentInstructions ?? '',
      plans: await loadPlans(),
      paidUsers: Object.fromEntries(counts.map((c) => [c.planId, c.users])),
      month: { credits: Math.round(credits * 10) / 10, requests },
    });
  });

  /**
   * PUT /admin/billing - Turn enforcement on or off, edit the payment instructions
   */
  admin.put('/billing', async (req, res) => {
    const body = billingSettingsSchema.parse(req.body);
    const current = (await getSetting<{ enforce?: boolean; paymentInstructions?: string }>('billing')) ?? {};
    await putSetting('billing', { ...current, ...body });
    res.json({ ok: true });
  });

  /**
   * PUT /admin/plans/:id - Edit a plan's limits, models and prices
   */
  admin.put('/plans/:id', async (req, res) => {
    const id = planId.parse(req.params.id);
    const body = updatePlanSchema.parse(req.body);
    // Make sure the row exists before editing (first edit of a default plan)
    const current = (await loadPlans()).find((p) => p.id === id)!;
    const values = { ...current, ...body, updatedAt: new Date() };
    await db.insert(plans).values(values).onConflictDoUpdate({ target: plans.id, set: values });
    res.json({ ok: true });
  });

  /**
   * GET /admin/users/:id/subscriptions - A user's plan history
   */
  admin.get('/users/:id/subscriptions', async (req, res) => {
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, z.uuid().parse(req.params.id))).orderBy(desc(subscriptions.createdAt));
    res.json({ subscriptions: rows });
  });

  /**
   * POST /admin/users/:id/subscriptions - Give a user a plan for a number of days (replaces the current one)
   */
  admin.post('/users/:id/subscriptions', async (req, res) => {
    const userId = z.uuid().parse(req.params.id);
    const body = grantSchema.parse(req.body);
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new HttpError(404, 'User not found.', 'not_found');

    const startsAt = new Date();
    const endsAt = body.endsAt ?? new Date(startsAt.getTime() + body.days! * DAY_MS);
    if (endsAt <= startsAt) throw new HttpError(400, 'The end date must be in the future.', 'bad_date');

    await db.transaction(async (tx) => {
      // One plan at a time: end the current one now
      await tx
        .update(subscriptions)
        .set({ cancelledAt: startsAt })
        .where(and(eq(subscriptions.userId, userId), gt(subscriptions.endsAt, startsAt), isNull(subscriptions.cancelledAt)));
      await tx.insert(subscriptions).values({ userId, planId: body.planId, startsAt, endsAt, source: body.source, note: body.note ?? null, createdBy: currentUser(req).id });
    });
    res.status(201).json({ active: Boolean(await activeSubscription(userId)) });
  });

  /**
   * DELETE /admin/subscriptions/:id - End a subscription now
   */
  admin.delete('/subscriptions/:id', async (req, res) => {
    const [row] = await db.update(subscriptions).set({ cancelledAt: new Date() }).where(eq(subscriptions.id, z.uuid().parse(req.params.id))).returning({ id: subscriptions.id });
    if (!row) throw new HttpError(404, 'Subscription not found.', 'not_found');
    res.status(204).end();
  });

  /**
   * GET /admin/ai-settings - The AI source and which keys are set (masked)
   */
  admin.get('/ai-settings', async (_req, res) => {
    res.json(await aiSettingsView(isCliProxyConfigured()));
  });

  /**
   * PUT /admin/ai-settings - Switch between the proxy and the official APIs, save or remove keys
   */
  admin.put('/ai-settings', async (req, res) => {
    const body = aiSettingsSchema.parse(req.body);
    await saveAiSettings(body);
    res.json(await aiSettingsView(isCliProxyConfigured()));
  });

  /**
   * POST /admin/ai-settings/test - Send a tiny request with the current source to check it works
   */
  admin.post('/ai-settings/test', async (req, res) => {
    const { model } = testSchema.parse(req.body);
    const started = Date.now();
    try {
      const reply = await runAI(currentUser(req), { feature: 'ai-test', model, system: 'Reply with OK.', messages: [{ role: 'user', content: 'ping' }], timeoutMs: 30_000 });
      res.json({ ok: true, ms: Date.now() - started, reply: reply.slice(0, 40) });
    } catch (error) {
      res.json({ ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : 'Failed' });
    }
  });

  router.use('/admin', admin);
  return router;
}
