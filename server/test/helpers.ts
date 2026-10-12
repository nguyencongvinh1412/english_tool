/**
 * Test Helpers
 * Database reset and signed-in supertest agents
 */
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { Express } from 'express';
import { db } from '../db/client.js';
import { inviteCodes, users, type User } from '../db/schema.js';
import { hashPassword } from '../auth/password.js';

export const TEST_PASSWORD = 'correct-horse-battery';

/** Hash computed once; scrypt is deliberately slow */
let passwordHashPromise: Promise<string> | null = null;

/**
 * Removes all rows from every table between tests
 */
export async function resetDb(): Promise<void> {
  await db.execute(sql`TRUNCATE users, sessions, password_resets, srs_cards, vocab_items, invite_codes, ai_usage, attempts, content_items, exam_sessions, import_jobs, media_assets RESTART IDENTITY CASCADE`);
}

/**
 * Inserts a user with TEST_PASSWORD
 */
export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}): Promise<User> {
  passwordHashPromise ??= hashPassword(TEST_PASSWORD);

  const [user] = await db
    .insert(users)
    .values({
      email: `user-${Math.random().toString(36).slice(2, 10)}@test.dev`,
      passwordHash: await passwordHashPromise,
      displayName: 'Test User',
      ...overrides,
    })
    .returning();

  return user;
}

/**
 * Inserts an invite code
 */
export async function createInvite(overrides: Partial<typeof inviteCodes.$inferInsert> = {}) {
  const [invite] = await db
    .insert(inviteCodes)
    .values({ code: `ET-TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, ...overrides })
    .returning();

  return invite;
}

/**
 * Returns a supertest agent signed in as the given user (cookies persist across requests)
 */
export async function signIn(app: Express, user: User) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });

  if (response.status !== 200) {
    throw new Error(`signIn failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return agent;
}
