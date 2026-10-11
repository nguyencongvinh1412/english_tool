/**
 * Admin API client and types
 */
import { apiFetch } from '@/shared/http';
import type { Role } from '@/shared/types';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string | null;
  dailyAiLimit: number | null;
  effectiveDailyAiLimit: number | null;
  allowedModels: string[] | null;
  effectiveAllowedModels: string[] | null;
  aiUsedToday: number;
}

export interface AdminDefaults {
  learnerDailyAiLimit: number;
  learnerModels: string[];
}

export interface Invite {
  code: string;
  role: Role;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  note: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface UsageRow {
  day: string;
  userId: string;
  email: string;
  feature: string;
  requests: number;
}

export interface UserUpdate {
  role?: Role;
  status?: 'active' | 'disabled';
  dailyAiLimit?: number | null;
  allowedModels?: string[] | null;
}

export interface InviteInput {
  role: Role;
  maxUses: number;
  expiresInDays: number | null;
  note: string | null;
}

export const adminApi = {
  listUsers: () => apiFetch<{ users: AdminUser[]; defaults: AdminDefaults }>('/api/admin/users'),
  updateUser: (id: string, changes: UserUpdate) =>
    apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}`, { method: 'PATCH', json: changes }),
  createPasswordReset: (id: string) =>
    apiFetch<{ token: string; expiresAt: string }>(`/api/admin/users/${id}/password-reset`, { method: 'POST' }),
  listModels: () => apiFetch<{ models: string[] }>('/api/admin/models'),
  listInvites: () => apiFetch<{ invites: Invite[] }>('/api/admin/invites'),
  createInvite: (input: InviteInput) => apiFetch<{ invite: Invite }>('/api/admin/invites', { method: 'POST', json: input }),
  revokeInvite: (code: string) => apiFetch<{ invite: Invite }>(`/api/admin/invites/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  usage: (days: number) => apiFetch<{ since: string; usage: UsageRow[] }>(`/api/admin/usage?days=${days}`),
};
