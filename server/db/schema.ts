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
  real,
  timestamp,
  date,
  primaryKey,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRole = pgEnum('user_role', ['admin', 'learner']);
export const userStatus = pgEnum('user_status', ['active', 'disabled']);
export const uiLocale = pgEnum('ui_locale', ['en', 'vi']);
export const examType = pgEnum('exam_type', ['none', 'toeic', 'ielts', 'jlpt']);
/** Language being learned (the UI language is separate: uiLocale) */
export const studyLanguage = pgEnum('study_language', ['en', 'ja']);

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
    targetScore: real('target_score'),
    cefrLevel: text('cefr_level'),
    /** Language the app shows lessons for; switched in the sidebar */
    studyLanguage: studyLanguage('study_language').notNull().default('en'),
    /** Japanese goal, N5 (beginner) to N1 */
    jaTargetLevel: text('ja_target_level'),
    /** Set when the user finishes the onboarding step; null shows onboarding */
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
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

/**
 * One-time password reset links an admin creates for a user who forgot their password.
 * Only the SHA-256 of the token is stored; the raw token lives in the link.
 */
export const passwordResets = pgTable(
  'password_resets',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('password_resets_user_id_idx').on(table.userId)]
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

export const skill = pgEnum('skill', ['listening', 'reading', 'speaking', 'writing']);

/**
 * One finished practice activity; drives XP, streaks, history and per-skill stats
 */
export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** e.g. dictation, pronunciation, conversation, scenario (validated in the API, text so new activities need no migration) */
    activity: text('activity').notNull(),
    skill: skill('skill').notNull(),
    /** Language practised, so progress can be shown per language */
    language: studyLanguage('language').notNull().default('en'),
    /** Stable id of what was practiced, e.g. a lesson or scenario id */
    contentRef: text('content_ref'),
    title: text('title'),
    score: real('score'),
    maxScore: real('max_score'),
    durationSec: integer('duration_sec'),
    xp: integer('xp').notNull().default(0),
    /** Calendar day in Asia/Ho_Chi_Minh, for streaks and daily charts */
    day: date('day').notNull(),
    details: jsonb('details'),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('attempts_user_completed_idx').on(table.userId, table.completedAt),
    index('attempts_user_day_idx').on(table.userId, table.day),
  ]
);

export const mediaKind = pgEnum('media_kind', ['image', 'audio', 'document']);

/**
 * Uploaded files (PDF/DOCX sources, page renders, cropped photos, audio tracks)
 */
export const mediaAssets = pgTable('media_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: mediaKind('kind').notNull(),
  /** Path inside the storage driver, e.g. "ab/abcd...ef.mp3" */
  storageKey: text('storage_key').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  originalName: text('original_name'),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const importStatus = pgEnum('import_status', ['uploaded', 'parsing', 'review', 'published', 'failed']);

/**
 * One imported test: source document, extracted pages, the parsed draft the admin
 * reviews, and progress of the AI parsing
 */
export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    exam: examType('exam').notNull(),
    /** Test label shown to learners, e.g. "ETS 2024 Test 3" */
    title: text('title').notNull(),
    status: importStatus('status').notNull().default('uploaded'),
    documentAssetId: uuid('document_asset_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
    /** Page ranges the admin marked: { questions: [from, to], answers?: [...], transcripts?: [...] } */
    ranges: jsonb('ranges').notNull().default({}),
    /** Extracted pages: [{ n, text, imageAssetId? }] */
    pages: jsonb('pages').notNull().default([]),
    /** Parsed test the admin edits before publishing */
    draft: jsonb('draft'),
    /** Parsing progress: { step, done, total } */
    progress: jsonb('progress'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [index('import_jobs_created_idx').on(table.createdAt)]
);

export const contentSource = pgEnum('content_source', ['builtin', 'ai', 'imported']);
export const contentStatus = pgEnum('content_status', ['draft', 'published', 'archived']);

/**
 * Shared bank of practice content: reading passages, listening scripts, speaking sets,
 * writing prompts. AI-generated items are kept so every learner can reuse them.
 */
export const contentItems = pgTable(
  'content_items',
  {
    /** Text id so built-in items keep stable ids like "builtin-reading-coffee" */
    id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
    /** e.g. reading-passage, listening-quiz (validated in the API, text so new kinds need no migration) */
    kind: text('kind').notNull(),
    skill: skill('skill').notNull(),
    exam: examType('exam').notNull().default('none'),
    language: studyLanguage('language').notNull().default('en'),
    /** Exam part, e.g. toeic-5 or ielts-w2; null for general practice */
    part: text('part'),
    /** CEFR level, e.g. B1 */
    level: text('level'),
    title: text('title').notNull(),
    topic: text('topic'),
    payload: jsonb('payload').notNull(),
    source: contentSource('source').notNull(),
    status: contentStatus('status').notNull().default('published'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    /** Imported test this group came from; groups of one import form an official-style test */
    importId: uuid('import_id').references(() => importJobs.id, { onDelete: 'set null' }),
    /** Position of the group inside its imported test */
    importOrder: integer('import_order'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('content_items_kind_level_idx').on(table.kind, table.status, table.level),
    index('content_items_import_idx').on(table.importId),
  ]
);

export const examStatus = pgEnum('exam_status', ['in_progress', 'submitted']);

/**
 * One mock-test sitting: which content groups it uses, the learner's answers
 * (autosaved), the time limit and, once submitted, the scored result
 */
export const examSessions = pgTable(
  'exam_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exam: examType('exam').notNull(),
    /** mini | part | full (validated in the API) */
    mode: text('mode').notNull(),
    /** Ordered sections: [{ part, groupIds }] */
    blueprint: jsonb('blueprint').notNull(),
    /** Question id -> chosen option index */
    answers: jsonb('answers').notNull().default({}),
    /** Question ids the learner flagged for review */
    flags: jsonb('flags').notNull().default([]),
    status: examStatus('status').notNull().default('in_progress'),
    timeLimitSec: integer('time_limit_sec').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** Scores per part and section, set on submit */
    result: jsonb('result'),
  },
  (table) => [index('exam_sessions_user_started_idx').on(table.userId, table.startedAt)]
);

export type User = typeof users.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type ContentItem = typeof contentItems.$inferSelect;
export type ExamSession = typeof examSessions.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;
