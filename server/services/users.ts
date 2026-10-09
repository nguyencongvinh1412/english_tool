/**
 * User Helpers
 * Shapes users for API responses and bootstraps the first admin
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, type User } from '../db/schema.js';
import { config } from '../config.js';
import { hashPassword } from '../auth/password.js';
import { getAllowedModels, getDailyLimit, getUsageToday } from './aiAccess.js';

/**
 * Normalizes an email for storage and lookup
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * User fields safe to send to the client (never the password hash)
 */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    uiLocale: user.uiLocale,
    targetExam: user.targetExam,
    targetScore: user.targetScore,
    cefrLevel: user.cefrLevel,
    createdAt: user.createdAt,
  };
}

/**
 * Public user plus today's AI quota, for GET /api/auth/me
 */
export async function toCurrentUser(user: User) {
  return {
    ...toPublicUser(user),
    aiQuota: {
      used: await getUsageToday(user.id),
      limit: getDailyLimit(user),
    },
    allowedModels: getAllowedModels(user),
  };
}

/**
 * Finds a user by email (case-insensitive)
 */
export async function findUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, normalizeEmail(email)))
    .limit(1);
  return user;
}

/**
 * Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if no admin exists
 * Does nothing once an admin exists, so changing the env later has no effect
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const [existingAdmin] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
  if (existingAdmin) return;

  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    console.warn('No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD to create one.');
    return;
  }

  const existingUser = await findUserByEmail(config.ADMIN_EMAIL);
  if (existingUser) {
    await db.update(users).set({ role: 'admin', updatedAt: new Date() }).where(eq(users.id, existingUser.id));
    console.log(`Promoted ${existingUser.email} to admin.`);
    return;
  }

  await db.insert(users).values({
    email: normalizeEmail(config.ADMIN_EMAIL),
    passwordHash: await hashPassword(config.ADMIN_PASSWORD),
    displayName: 'Admin',
    role: 'admin',
  });
  console.log(`Created admin account ${normalizeEmail(config.ADMIN_EMAIL)}.`);
}
