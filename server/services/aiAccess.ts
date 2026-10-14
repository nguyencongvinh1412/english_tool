/**
 * AI Access Control
 * Per-user daily quota and per-user model allowlist for every AI call
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiUsage, type User } from '../db/schema.js';
import { config } from '../config.js';
import { HttpError } from '../http/errors.js';
import { isModelAllowed, getDefaultModel } from './cliproxy.js';
import { entitlementsOf, weeklyScoring } from '../billing/plans.js';
import { estimateCredits } from '../billing/pricing.js';

/** Quota days follow Vietnam time so the limit resets at local midnight */
const QUOTA_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Today's date in the quota time zone
 * @returns Date string in YYYY-MM-DD format
 */
export function quotaDay(now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: QUOTA_TIME_ZONE }).format(now);
}

/**
 * Daily AI request limit for a user
 * @returns Limit, or null for unlimited (admins)
 */
export function getDailyLimit(user: User): number | null {
  if (user.role === 'admin') return null;
  return user.dailyAiLimit ?? config.LEARNER_DAILY_AI_LIMIT;
}

/**
 * Total AI requests a user made today across all features
 */
export async function getUsageToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsage.requestCount}), 0)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.day, quotaDay())));

  return row?.total ?? 0;
}

/**
 * Throws 429 if the user is over a limit: the daily request cap (abuse guard) and, when plans are
 * enforced, the plan's credits and weekly scoring allowance
 * @param feature - What the call is for, to apply the weekly scoring limits
 */
export async function assertQuota(user: User, feature?: string): Promise<void> {
  const limit = getDailyLimit(user);
  if (limit !== null && (await getUsageToday(user.id)) >= limit) {
    throw new HttpError(429, 'You have used all of your AI requests for today. Please come back tomorrow.', 'quota_exceeded');
  }

  const entitlements = await entitlementsOf(user);
  if (!entitlements.enforced) return;

  const { day, month } = entitlements.credits;
  if (day.limit !== null && day.used >= day.limit) {
    throw new HttpError(429, 'You have used all of your AI credits for today. Upgrade your plan or come back tomorrow.', 'credits_exhausted');
  }
  if (month.limit !== null && month.used >= month.limit) {
    throw new HttpError(429, 'You have used all of your AI credits for this month. Upgrade your plan to continue.', 'credits_exhausted');
  }

  const weekly = feature === 'score-writing' ? entitlements.limits.weeklyWriting : feature === 'score-speaking' ? entitlements.limits.weeklySpeaking : null;
  if (weekly !== null) {
    const used = await weeklyScoring(user.id);
    if ((feature === 'score-writing' ? used.writing : used.speaking) >= weekly) {
      throw new HttpError(429, `Your plan allows ${weekly} AI-scored ${feature === 'score-writing' ? 'writing' : 'speaking'} tasks a week. Upgrade your plan for more.`, 'plan_limit');
    }
  }
}

/** Throws 403 when the user's plan does not include a feature */
export async function assertFeature(user: User, feature: 'fullTests' | 'importedTests'): Promise<void> {
  const { limits } = await entitlementsOf(user);
  if (!limits[feature]) {
    throw new HttpError(403, feature === 'fullTests' ? 'Full tests are part of the Plus plan.' : 'This test is not included in your plan.', 'plan_required');
  }
}

/** What an AI call used, to estimate its cost */
export interface UsageDetails {
  model: string;
  inputTokens: number;
  reply: string;
}

/**
 * Counts one AI request against the user's quota and adds its estimated cost in credits
 * @param feature - Which feature made the call, e.g. "chat"
 */
export async function recordUsage(user: User, feature: string, details?: UsageDetails): Promise<void> {
  const credits = details ? estimateCredits(details.model, details.inputTokens, details.reply) : 0;
  await db
    .insert(aiUsage)
    .values({ userId: user.id, day: quotaDay(), feature, requestCount: 1, credits })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.day, aiUsage.feature],
      set: { requestCount: sql`${aiUsage.requestCount} + 1`, credits: sql`${aiUsage.credits} + ${credits}` },
    });
}

/**
 * Models a user may use
 * @returns Allowed model IDs, or null if any non-blocked model is allowed (admins)
 */
export function getAllowedModels(user: User): string[] | null {
  if (user.role === 'admin') return null;
  return (user.allowedModels ?? config.LEARNER_MODELS).filter(isModelAllowed);
}

/**
 * Models a user may use now: their own list if an admin set one, else the plan's models when plans are
 * enforced, else the default list
 * @returns Allowed model IDs, or null if any non-blocked model is allowed (admins)
 */
export async function effectiveModels(user: User): Promise<string[] | null> {
  if (user.role === 'admin') return null;
  const { models } = await entitlementsOf(user);
  if (models === null) return getAllowedModels(user);
  return (user.allowedModels ?? models).filter(isModelAllowed);
}

/**
 * Picks the model for a request, enforcing the user's allowlist
 *
 * @param user - Requesting user
 * @param requested - Model the client asked for, if any
 * @returns Model ID to use
 * @throws HttpError 403 if the model is not allowed for this user
 */
export async function resolveModel(user: User, requested: string | undefined): Promise<string> {
  if (requested !== undefined && !isModelAllowed(requested)) {
    throw new HttpError(403, 'This model is not allowed.', 'model_forbidden');
  }

  const allowed = await effectiveModels(user);

  if (allowed === null) {
    return requested ?? getDefaultModel();
  }

  if (allowed.length === 0) {
    throw new HttpError(403, 'No AI models are assigned to your account.', 'model_forbidden');
  }

  if (requested === undefined) {
    return allowed[0];
  }

  if (!allowed.includes(requested)) {
    throw new HttpError(403, 'This model is not available for your account.', 'model_forbidden');
  }

  return requested;
}
