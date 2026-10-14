/**
 * Plans, pricing and admin billing tools (mirrors server/routes/billing.ts)
 */
import { apiFetch } from './http';

export type PlanId = 'free' | 'plus' | 'pro';

export interface PlanLimits {
  weeklyWriting: number | null;
  weeklySpeaking: number | null;
  fullTests: boolean;
  importedTests: boolean;
}

export interface PlanPrices {
  month: number;
  quarter: number;
  year: number;
}

export interface PublicPlan {
  id: PlanId;
  name: string;
  monthlyCredits: number;
  dailyCredits: number;
  models: string[];
  limits: PlanLimits;
  priceVnd: PlanPrices | null;
}

export interface PricingInfo {
  plans: PublicPlan[];
  current: {
    planId: PlanId;
    endsAt: string | null;
    enforced: boolean;
    credits: { day: { used: number; limit: number | null }; month: { used: number; limit: number | null } };
  };
  paymentInstructions: string;
}

export interface AdminPlan extends PublicPlan {
  sortOrder: number;
  isPublic: boolean;
}

export interface AdminBilling {
  enforce: boolean;
  paymentInstructions: string;
  plans: AdminPlan[];
  paidUsers: Partial<Record<PlanId, number>>;
  month: { credits: number; requests: number };
}

export interface Subscription {
  id: string;
  planId: PlanId;
  startsAt: string;
  endsAt: string;
  source: 'admin' | 'trial' | 'payment' | 'referral';
  note: string | null;
  cancelledAt: string | null;
}

export type ProviderId = 'anthropic' | 'gemini';

export interface AiSettings {
  mode: 'proxy' | 'official';
  canStoreKeys: boolean;
  proxyConfigured: boolean;
  keys: Record<ProviderId, { source: 'admin' | 'env' | null; last4: string | null }>;
}

export const billingApi = {
  plans: () => apiFetch<PricingInfo>('/api/billing/plans'),
  admin: () => apiFetch<AdminBilling>('/api/admin/billing'),
  saveSettings: (settings: { enforce?: boolean; paymentInstructions?: string }) => apiFetch<{ ok: true }>('/api/admin/billing', { method: 'PUT', json: settings }),
  savePlan: (id: PlanId, plan: Partial<Omit<AdminPlan, 'id' | 'sortOrder'>>) => apiFetch<{ ok: true }>(`/api/admin/plans/${id}`, { method: 'PUT', json: plan }),
  subscriptions: (userId: string) => apiFetch<{ subscriptions: Subscription[] }>(`/api/admin/users/${userId}/subscriptions`),
  grant: (userId: string, grant: { planId: PlanId; days: number; source?: Subscription['source']; note?: string }) =>
    apiFetch<{ active: boolean }>(`/api/admin/users/${userId}/subscriptions`, { method: 'POST', json: grant }),
  cancel: (id: string) => apiFetch<void>(`/api/admin/subscriptions/${id}`, { method: 'DELETE' }),
  aiSettings: () => apiFetch<AiSettings>('/api/admin/ai-settings'),
  saveAiSettings: (update: { mode?: AiSettings['mode']; keys?: Partial<Record<ProviderId, string>> }) =>
    apiFetch<AiSettings>('/api/admin/ai-settings', { method: 'PUT', json: update }),
  testAi: (model: string) => apiFetch<{ ok: boolean; ms: number; reply?: string; error?: string }>('/api/admin/ai-settings/test', { method: 'POST', json: { model } }),
};

/** "79.000 đ" */
export const formatVnd = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;

/**
 * Credits the user can still use now: the smaller of what is left today and this month; null without limits
 */
export function creditsLeft(credits: PricingInfo['current']['credits']): number | null {
  if (credits.day.limit === null || credits.month.limit === null) return null;
  return Math.max(0, Math.floor(Math.min(credits.day.limit - credits.day.used, credits.month.limit - credits.month.used)));
}
