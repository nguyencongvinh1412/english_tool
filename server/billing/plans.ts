/**
 * Plans and entitlements: which plan a user has, what it allows, and how many credits are left
 */
import { and, desc, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiUsage, plans, subscriptions, type Plan, type Subscription, type User } from '../db/schema.js';
import { getSetting } from '../services/settings.js';

export interface PlanLimits {
  /** AI-scored writing / speaking per rolling 7 days; null means no limit */
  weeklyWriting: number | null;
  weeklySpeaking: number | null;
  /** Full, per-part and section tests (mini tests are always allowed) */
  fullTests: boolean;
  /** Tests imported from books (copyrighted material an admin chooses to share) */
  importedTests: boolean;
}

export const FREE_PLAN_ID = 'free';
export const PLAN_IDS = ['free', 'plus', 'pro'] as const;

/** Defaults written to the database on first start; admins can edit them afterwards */
export const DEFAULT_PLANS: (typeof plans.$inferInsert)[] = [
  {
    id: 'free',
    name: 'Free',
    sortOrder: 0,
    monthlyCredits: 150,
    dailyCredits: 15,
    models: ['claude-haiku-5-5'],
    limits: { weeklyWriting: 2, weeklySpeaking: 2, fullTests: false, importedTests: false } satisfies PlanLimits,
    priceVnd: null,
  },
  {
    id: 'plus',
    name: 'Plus',
    sortOrder: 1,
    monthlyCredits: 1200,
    dailyCredits: 100,
    models: ['claude-haiku-5-5', 'gemini-3-flash'],
    limits: { weeklyWriting: null, weeklySpeaking: null, fullTests: true, importedTests: false } satisfies PlanLimits,
    priceVnd: { month: 79_000, quarter: 199_000, year: 599_000 },
  },
  {
    id: 'pro',
    name: 'Pro',
    sortOrder: 2,
    monthlyCredits: 2500,
    dailyCredits: 200,
    models: ['claude-haiku-5-5', 'gemini-3-flash', 'claude-sonnet-5-5'],
    limits: { weeklyWriting: null, weeklySpeaking: null, fullTests: true, importedTests: false } satisfies PlanLimits,
    priceVnd: { month: 149_000, quarter: 399_000, year: 1_199_000 },
  },
];

/** Inserts the default plans that do not exist yet */
export async function ensurePlans(): Promise<void> {
  await db.insert(plans).values(DEFAULT_PLANS).onConflictDoNothing();
}

/** Plans by id; a plan missing from the table falls back to its default */
export async function loadPlans(): Promise<Plan[]> {
  const rows = await db.select().from(plans).orderBy(plans.sortOrder);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const now = new Date();
  return DEFAULT_PLANS.map((d) => byId.get(d.id)! ?? ({ ...d, isPublic: true, updatedAt: now, priceVnd: d.priceVnd ?? null } as Plan)).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** The subscription in force now, if any (the one that ends last) */
export async function activeSubscription(userId: string, now = new Date()): Promise<Subscription | undefined> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), lte(subscriptions.startsAt, now), gt(subscriptions.endsAt, now), isNull(subscriptions.cancelledAt)))
    .orderBy(desc(subscriptions.endsAt))
    .limit(1);
  return row;
}

/** Whether plans are enforced; off means everyone keeps the open access the app had before plans */
export async function billingEnforced(): Promise<boolean> {
  return (await getSetting<{ enforce: boolean }>('billing'))?.enforce === true;
}

/** Start of today and of this month in Vietnam time, as YYYY-MM-DD */
function vietnamDates(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
  const weekAgo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  return { day, month: `${day.slice(0, 7)}-01`, weekAgo };
}

export interface Entitlements {
  /** False while plans are not enforced: nothing is limited */
  enforced: boolean;
  plan: Plan;
  /** When a paid plan ends; null for free and for admins */
  endsAt: Date | null;
  /** Models this user may use; null for any */
  models: string[] | null;
  limits: PlanLimits;
  credits: { day: { used: number; limit: number | null }; month: { used: number; limit: number | null } };
}

const OPEN_LIMITS: PlanLimits = { weeklyWriting: null, weeklySpeaking: null, fullTests: true, importedTests: true };

/**
 * What a user may do now. Admins and everyone while plans are not enforced get open access, but credits are
 * still counted so real usage can be measured before enforcing.
 */
export async function entitlementsOf(user: User, now = new Date()): Promise<Entitlements> {
  const [all, enforced, subscription] = await Promise.all([loadPlans(), billingEnforced(), activeSubscription(user.id, now)]);
  const plan = all.find((p) => p.id === (subscription?.planId ?? FREE_PLAN_ID)) ?? all[0];
  const open = user.role === 'admin' || !enforced;
  const { day, month } = vietnamDates(now);

  const [row] = await db
    .select({
      today: sql<number>`coalesce(sum(${aiUsage.credits}) filter (where ${aiUsage.day} = ${day}), 0)::float`,
      thisMonth: sql<number>`coalesce(sum(${aiUsage.credits}), 0)::float`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, user.id), gte(aiUsage.day, month)));

  return {
    enforced: enforced && user.role !== 'admin',
    plan,
    endsAt: subscription?.endsAt ?? null,
    models: open ? null : plan.models,
    limits: open ? OPEN_LIMITS : (plan.limits as PlanLimits),
    credits: {
      day: { used: round(row?.today ?? 0), limit: open ? null : plan.dailyCredits },
      month: { used: round(row?.thisMonth ?? 0), limit: open ? null : plan.monthlyCredits },
    },
  };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** AI-scored writing and speaking a user did in the last 7 days */
export async function weeklyScoring(userId: string, now = new Date()): Promise<{ writing: number; speaking: number }> {
  const { weekAgo } = vietnamDates(now);
  const rows = await db
    .select({ feature: aiUsage.feature, count: sql<number>`sum(${aiUsage.requestCount})::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.day, weekAgo), sql`${aiUsage.feature} in ('score-writing', 'score-speaking')`))
    .groupBy(aiUsage.feature);
  return { writing: rows.find((r) => r.feature === 'score-writing')?.count ?? 0, speaking: rows.find((r) => r.feature === 'score-speaking')?.count ?? 0 };
}
