/**
 * Database Schema
 * Drizzle table definitions; run `npm run db:generate` after changing this file
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRole = pgEnum('user_role', ['admin', 'learner']);
export const userStatus = pgEnum('user_status', ['active', 'disabled']);
export const uiLocale = pgEnum('ui_locale', ['en', 'vi']);
export const examType = pgEnum('exam_type', ['none', 'toeic', 'ielts']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Always stored lowercase */
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    role: userRole('role').notNull().default('learner'),
    status: userStatus('status').notNull().default('active'),
    /** Null means the LEARNER_DAILY_AI_LIMIT default */
    dailyAiLimit: integer('daily_ai_limit'),
    /** Null means the LEARNER_MODELS default */
    allowedModels: text('allowed_models').array(),
    uiLocale: uiLocale('ui_locale').notNull().default('en'),
    targetExam: examType('target_exam').notNull().default('none'),
    targetScore: integer('target_score'),
    cefrLevel: text('cefr_level'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('users_email_unique').on(sql`lower(${table.email})`)]
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token; the raw token only lives in the cookie */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)]
);

export const inviteCodes = pgTable('invite_codes', {
  code: text('code').primaryKey(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  /** Role granted to users who register with this code */
  role: userRole('role').notNull().default('learner'),
  maxUses: integer('max_uses').notNull().default(1),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  note: text('note'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiUsage = pgTable(
  'ai_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Calendar day in Asia/Ho_Chi_Minh */
    day: date('day').notNull(),
    feature: text('feature').notNull(),
    requestCount: integer('request_count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day, table.feature] })]
);

export type User = typeof users.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;
