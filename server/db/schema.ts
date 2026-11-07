/**
 * Database Schema
 * Drizzle table definitions; run `npm run db:generate` after changing this file
 */
import {
  boolean,
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
  smallint,
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
    /** Estimated cost in credits (1 credit is about 1/1000 USD) */
    credits: real('credits').notNull().default(0),
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
    /** JLPT imports: the test's level (N5-N1) */
    level: text('level'),
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

/**
 * Library items a learner hid from their own list. The library is shared, so "remove" means hide for
 * this learner only; the item stays for everyone else.
 */
export const contentHidden = pgTable(
  'content_hidden',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contentId: text('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.contentId] })]
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

/**
 * Japanese kanji and vocabulary for flashcards. Source fields come from server/content/ja/vocab-data.json
 * (refreshed on startup); Vietnamese fields are added later by AI and kept across refreshes.
 */
export const vocabItems = pgTable(
  'vocab_items',
  {
    /** "k:学" for kanji, "w:勉強|べんきょう (する)" for words */
    id: text('id').primaryKey(),
    /** kanji | word */
    kind: text('kind').notNull(),
    /** N5 to N1; CEFR level for English (empty when unknown) */
    level: text('level').notNull(),
    /** Learning order within the level (kanji by frequency) */
    position: integer('position').notNull(),
    term: text('term').notNull(),
    /** Word reading in kana */
    reading: text('reading'),
    readingsOn: text('readings_on').array(),
    readingsKun: text('readings_kun').array(),
    meaningsEn: text('meanings_en').array().notNull(),
    strokes: integer('strokes'),
    /** Sino-Vietnamese candidates from KANJIDIC2 */
    hanVietOptions: text('han_viet_options').array(),
    /** Chosen Sino-Vietnamese reading (AI picks one of the options) */
    hanViet: text('han_viet'),
    meaningVi: text('meaning_vi'),
    /** Example sentence with furigana markup, and its Vietnamese translation */
    example: text('example'),
    exampleVi: text('example_vi'),
    /** ja (kanji and words above) or en */
    language: studyLanguage('language').notNull().default('ja'),
    /** English decks: en-core-A1, en-toeic-1, en-ielts-1... (Japanese decks use kind + level) */
    deck: text('deck'),
    /** English: part of speech and IPA; collocations are added by the AI */
    pos: text('pos'),
    ipa: text('ipa'),
    collocations: text('collocations').array(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('vocab_items_deck_idx').on(table.kind, table.level, table.position),
    index('vocab_items_en_deck_idx').on(table.deck, table.position),
  ]
);

/**
 * A learner's spaced-repetition state for one card
 */
export const srsCards = pgTable(
  'srs_cards',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    /** learning (short steps) | review (days) */
    state: text('state').notNull().default('learning'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    intervalDays: real('interval_days').notNull().default(0),
    ease: real('ease').notNull().default(2.5),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    /** First time the card was shown, for the daily new-card limit */
    introducedAt: timestamp('introduced_at', { withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.itemId] }), index('srs_cards_user_due_idx').on(table.userId, table.dueAt)]
);

/**
 * Words a learner saved while reading, listening or by hand; reviewed as their own deck
 */
export const wordBank = pgTable(
  'word_bank',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    /** reading | listening | manual */
    source: text('source').notNull(),
    /** The sentence the word was met in */
    context: text('context'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.itemId] }), index('word_bank_user_created_idx').on(table.userId, table.createdAt)]
);

/**
 * Explanation of each English grammar point (structure lives in server/grammar/map.ts). Loaded from the
 * AI drafts in server/content/en/grammar; once an admin edits a point, the database version is kept.
 */
export const grammarPoints = pgTable('grammar_points', {
  id: text('id').primaryKey(),
  content: jsonb('content').notNull(),
  /** draft | reviewed */
  status: text('status').notNull().default('draft'),
  /** Edited in the app: draft files no longer overwrite it */
  edited: boolean('edited').notNull().default(false),
  /** Hash of the draft file last loaded */
  seedHash: text('seed_hash'),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A learner's mastery of each grammar point, scheduled like a flashcard from practice scores
 */
export const grammarProgress = pgTable(
  'grammar_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pointId: text('point_id').notNull(),
    state: text('state').notNull().default('learning'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    intervalDays: real('interval_days').notNull().default(0),
    ease: real('ease').notNull().default(2.5),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    /** Practice sets already done, so the next one is new */
    seenSets: text('seen_sets').array().notNull().default(sql`'{}'::text[]`),
    lastScore: real('last_score'),
    practicedAt: timestamp('practiced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.pointId] }), index('grammar_progress_user_due_idx').on(table.userId, table.dueAt)]
);

/**
 * One row per learner, language and day: how much they knew at the end of it (words seen and mastered, grammar
 * points practised and mastered), written as they study, so the progress page can draw trends
 */
export const progressSnapshots = pgTable(
  'progress_snapshots',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    language: studyLanguage('language').notNull(),
    /** Calendar day in Asia/Ho_Chi_Minh */
    day: date('day').notNull(),
    data: jsonb('data').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.language, table.day] })]
);

/**
 * A learner's personal mind map: a tree of short notes, each optionally linked to a grammar point or a word.
 * `doc` is validated in server/maps/doc.ts; `version` grows on every save so two open tabs cannot overwrite each other.
 */
export const mindMaps = pgTable(
  'mind_maps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    language: studyLanguage('language').notNull().default('en'),
    title: text('title').notNull(),
    doc: jsonb('doc').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('mind_maps_user_updated_idx').on(table.userId, table.updatedAt)]
);

/**
 * What a map looked like before the AI changed it, so the change can be undone. Only the last few are kept per map.
 */
export const mindMapVersions = pgTable(
  'mind_map_versions',
  {
    mapId: uuid('map_id')
      .notNull()
      .references(() => mindMaps.id, { onDelete: 'cascade' }),
    /** The map's version number when this copy was taken */
    version: integer('version').notNull(),
    title: text('title').notNull(),
    doc: jsonb('doc').notNull(),
    /** What replaced this copy: the learner's own edits, an AI update, or a restore */
    reason: text('reason').notNull().default('ai'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.mapId, table.version] })]
);

/**
 * A map the AI proposed and the learner has not accepted yet. Nothing touches `mind_maps` until it is confirmed;
 * cancelling (or letting it expire) deletes the draft, name included.
 */
export const mindMapDrafts = pgTable(
  'mind_map_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The map being updated; null when the draft creates a new one */
    mapId: uuid('map_id').references(() => mindMaps.id, { onDelete: 'cascade' }),
    /** The map's version the proposal was made from: a different version means it changed meanwhile */
    baseVersion: integer('base_version'),
    language: studyLanguage('language').notNull().default('en'),
    title: text('title').notNull(),
    doc: jsonb('doc').notNull(),
    /** What differs from the current map (empty for a new one), computed on the server */
    changes: jsonb('changes').notNull().default([]),
    summary: text('summary'),
    instruction: text('instruction'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('mind_map_drafts_user_idx').on(table.userId, table.createdAt)]
);

/**
 * Grammar mistakes a learner made, tagged with the grammar point they belong to (from AI-scored
 * writing and from wrong test answers), so the map can say what to review
 */
export const grammarMistakes = pgTable(
  'grammar_mistakes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pointId: text('point_id').notNull(),
    /** writing | test */
    source: text('source').notNull(),
    /** What the learner wrote or chose, and the right form */
    wrong: text('wrong'),
    right: text('right'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('grammar_mistakes_user_idx').on(table.userId, table.createdAt)]
);

/**
 * Subscription plans: what each plan allows (credits, models, features) and what it costs
 */
export const plans = pgTable('plans', {
  /** free | plus | pro */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  /** AI credits per calendar month and per day (Vietnam time) */
  monthlyCredits: integer('monthly_credits').notNull(),
  dailyCredits: integer('daily_credits').notNull(),
  models: text('models').array().notNull(),
  /** { weeklyWriting, weeklySpeaking: number | null, fullTests, importedTests: boolean } */
  limits: jsonb('limits').notNull(),
  /** { month, quarter, year } in VND; null for free */
  priceVnd: jsonb('price_vnd'),
  /** Shown on the pricing page */
  isPublic: boolean('is_public').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A period during which a user has a plan. The current plan is the latest unexpired one; without it the user is on free.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** admin | trial | payment | referral */
    source: text('source').notNull(),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('subscriptions_user_idx').on(table.userId, table.endsAt)]
);

/**
 * Settings an admin changes in the app: billing enforcement, AI source, payment instructions
 */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A learner's roadmap: where they start, where they want to be, by when, and the stages in between.
 * Stages and the time plan are generated by rules (server/roadmap/plan.ts) and stored as they were when the
 * roadmap was made; progress is always computed live from what the learner has done. At most one roadmap is
 * active per learner and language; changing a goal archives the old one.
 */
export const roadmaps = pgTable(
  'roadmaps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    language: studyLanguage('language').notNull(),
    /** toeic | ielts | jlpt | cefr (general) */
    goalType: text('goal_type').notNull(),
    /** TOEIC total or IELTS overall band; null for JLPT and general goals */
    targetScore: real('target_score'),
    /** CEFR level (English) or JLPT level (Japanese) the goal corresponds to */
    targetLevel: text('target_level').notNull(),
    /** Optional minimum level per skill, e.g. { listening: "B1" } */
    minSkillLevels: jsonb('min_skill_levels').notNull().default({}),
    deadline: date('deadline'),
    hoursPerWeek: real('hours_per_week').notNull(),
    /** Weekdays (0 = Sunday) the learner does not study */
    restDays: integer('rest_days').array().notNull().default(sql`'{}'::integer[]`),
    startDate: date('start_date').notNull(),
    fromLevel: text('from_level').notNull(),
    /** self (picked by the learner) | derived (from their study data) | measured (placement test) */
    levelSource: text('level_source').notNull().default('self'),
    stages: jsonb('stages').notNull(),
    plan: jsonb('plan').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('roadmaps_one_active').on(table.userId, table.language).where(sql`${table.status} = 'active'`),
    index('roadmaps_user_idx').on(table.userId),
  ]
);

/**
 * What a learner is meant to do on a given day of their roadmap. Created the first time Today is opened that day;
 * an unfinished learning task is moved to a later day (rolled_from keeps where it came from) instead of being lost.
 * "Done" is also checked live against what the learner has actually practised.
 */
export const roadmapTasks = pgTable(
  'roadmap_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roadmapId: uuid('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    /** Stable id of the task within a day, e.g. "skill-listening" */
    taskKey: text('task_key').notNull(),
    /** The task as shown in Today (type and its details) */
    task: jsonb('task').notNull(),
    /** todo | done */
    status: text('status').notNull().default('todo'),
    rolledFrom: date('rolled_from'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('roadmap_tasks_day_key').on(table.roadmapId, table.day, table.taskKey), index('roadmap_tasks_user_day_idx').on(table.userId, table.day)]
);

/**
 * Multiple-choice questions used to measure a learner's level (the placement test). Built from the vocabulary list
 * and from existing practice content, with room for AI-written and hand-written ones; only approved questions are
 * asked. The right answer never leaves the server while a test is running.
 */
export const placementQuestions = pgTable(
  'placement_questions',
  {
    id: text('id').primaryKey(),
    language: studyLanguage('language').notNull(),
    /** vocabulary | grammar | reading | listening */
    skill: text('skill').notNull(),
    /** CEFR level of the question */
    level: text('level').notNull(),
    prompt: text('prompt').notNull(),
    /** Passage (reading) or transcript (listening) the question is about */
    context: text('context'),
    options: jsonb('options').notNull(),
    answerIndex: integer('answer_index').notNull(),
    /** vocab | content | ai | manual */
    source: text('source').notNull(),
    ref: text('ref'),
    /** draft | approved | retired */
    status: text('status').notNull().default('approved'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('placement_questions_pick_idx').on(table.language, table.skill, table.level, table.status)]
);

/**
 * One run of the placement test. The state holds, per skill, the questions asked so far and whether each was right,
 * so a paused test resumes where it stopped.
 */
export const placementSessions = pgTable(
  'placement_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    language: studyLanguage('language').notNull(),
    /** in_progress | finished */
    status: text('status').notNull().default('in_progress'),
    state: jsonb('state').notNull(),
    result: jsonb('result'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [index('placement_sessions_user_idx').on(table.userId, table.language)]
);

/**
 * The latest measured level per skill for a learner (from the placement test, or set by hand)
 */
export const skillLevels = pgTable(
  'skill_levels',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    language: studyLanguage('language').notNull(),
    skill: text('skill').notNull(),
    level: text('level').notNull(),
    /** low | medium | high */
    confidence: text('confidence').notNull(),
    /** placement | manual */
    source: text('source').notNull(),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.language, table.skill] })]
);

/**
 * One attempt at a stage checkpoint (the short, free version): a fixed set of questions at the stage's level,
 * graded when the learner submits. A learner who has not finished has one open attempt per stage.
 */
export const checkpointAttempts = pgTable(
  'checkpoint_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roadmapId: uuid('roadmap_id')
      .notNull()
      .references(() => roadmaps.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stageIndex: integer('stage_index').notNull(),
    /** Question ids asked, in order, with the skill each belongs to */
    questions: jsonb('questions').notNull(),
    /** in_progress | finished */
    status: text('status').notNull().default('in_progress'),
    /** Scores per skill and overall, the verdict and why */
    result: jsonb('result'),
    passed: boolean('passed'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [index('checkpoint_attempts_roadmap_idx').on(table.roadmapId, table.stageIndex)]
);

export type User = typeof users.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Roadmap = typeof roadmaps.$inferSelect;
export type RoadmapTask = typeof roadmapTasks.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type VocabItem = typeof vocabItems.$inferSelect;
export type SrsCard = typeof srsCards.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type ContentItem = typeof contentItems.$inferSelect;
export type ExamSession = typeof examSessions.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;

/**
 * Small key-value settings kept by the server, e.g. which dictionary data version is loaded
 */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});


/**
 * What a learner wants to be reminded about (FR-RM-61): at most one reminder a day, in the app
 */
export const notificationPrefs = pgTable('notification_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  dailyReminder: boolean('daily_reminder').notNull().default(true),
  /** Local time of day, "HH:MM" */
  reminderTime: text('reminder_time').notNull().default('20:00'),
  checkpointAlert: boolean('checkpoint_alert').notNull().default(true),
  weeklySummary: boolean('weekly_summary').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Notifications shown in the app's notification centre. One per `dedupeKey`, so a reminder is never repeated.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** reminder, checkpoint or weekly */
    kind: text('kind').notNull(),
    /** Values the text is written with, so it shows in the learner's language */
    params: jsonb('params').notNull().default({}),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('notifications_user_key_idx').on(table.userId, table.dedupeKey), index('notifications_user_created_idx').on(table.userId, table.createdAt)]
);


/**
 * Deep Word Learning: what is known about a word beyond its dictionary entry. Shared by every learner, written by the
 * AI when the word first enters someone's queue, and editable by an admin.
 */
export const deepWordContent = pgTable('deep_word_content', {
  itemId: text('item_id')
    .primaryKey()
    .references(() => vocabItems.id, { onDelete: 'cascade' }),
  /** The meaning in plain English */
  simpleDefinition: text('simple_definition').notNull(),
  synonyms: text('synonyms').array().notNull().default(sql`'{}'::text[]`),
  antonyms: text('antonyms').array().notNull().default(sql`'{}'::text[]`),
  /** [{ word, difference }]: close words and how this one differs */
  contrast: jsonb('contrast').notNull().default([]),
  wordFamily: text('word_family').array().notNull().default(sql`'{}'::text[]`),
  /** [{ phrase, example }] */
  collocations: jsonb('collocations').notNull().default([]),
  /** Formality and where the word is used */
  register: text('register').notNull().default(''),
  /** [{ text, vi }]: example sentences written by the AI */
  examples: jsonb('examples').notNull().default([]),
  /** Short note on how a beginner should use the word */
  coreUse: text('core_use').notNull().default(''),
  /** ai (not reviewed) | approved (an admin checked it) */
  status: text('status').notNull().default('ai'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A learner's depth of knowledge of one word: three aspects (form, meaning, use), each known by recognising it
 * (r) and by producing it (p). Each cell is 0 (not yet), 1 (in progress) or 2 (done).
 */
export const deepWordProgress = pgTable(
  'deep_word_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    formR: smallint('form_r').notNull().default(0),
    formP: smallint('form_p').notNull().default(0),
    meaningR: smallint('meaning_r').notNull().default(0),
    meaningP: smallint('meaning_p').notNull().default(0),
    useR: smallint('use_r').notNull().default(0),
    useP: smallint('use_p').notNull().default(0),
    /** Overall level, 1 (met) to 5 (used without help) */
    stage: smallint('stage').notNull().default(1),
    /** Stage of the session the learner was in, 1 to 5 (resume point) */
    sessionStage: smallint('session_stage').notNull().default(1),
    /** Answers kept while the session is open, so leaving does not lose them */
    sessionData: jsonb('session_data').notNull().default({}),
    /** Day the session was started (quota day), for the words-per-day limit */
    startedDay: date('started_day').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** How many times the learner chose "later" for the production stage */
    deferredCount: integer('deferred_count').notNull().default(0),
    note: text('note'),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
    /** Position in the 1, 3, 7, 14, 30 day ladder */
    reviewStep: smallint('review_step').notNull().default(0),
    /** Kind of the last review, so the next one differs */
    lastKind: text('last_kind'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
    index('deep_word_progress_user_day_idx').on(table.userId, table.startedDay),
    index('deep_word_progress_user_review_idx').on(table.userId, table.nextReviewAt),
  ]
);

/**
 * Words waiting to be studied in depth
 */
export const deepWordQueue = pgTable(
  'deep_word_queue',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    /** bank | suggest | manual | lookup | roadmap */
    source: text('source').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.itemId] }), index('deep_word_queue_user_added_idx').on(table.userId, table.addedAt)]
);

/**
 * One try at an exercise on a word: what the learner wrote or answered and how it went
 */
export const deepWordAttempts = pgTable(
  'deep_word_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    /** guess | recall | sentence | self-check */
    kind: text('kind').notNull(),
    /** form | meaning | use */
    aspect: text('aspect').notNull(),
    /** pass | partial | fail */
    result: text('result').notNull(),
    /** True when the learner was shown the answer or checked it themselves */
    assisted: boolean('assisted').notNull().default(false),
    /** What the learner wrote (a sentence), when the exercise has text */
    userText: text('user_text'),
    feedback: jsonb('feedback'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('deep_word_attempts_user_item_idx').on(table.userId, table.itemId, table.createdAt)]
);

/**
 * Deep Word settings and the context profile the AI uses to write examples about the learner's life
 */
export const deepWordPrefs = pgTable('deep_word_prefs', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  /** New words a day: 1 or 2 */
  perDay: smallint('per_day').notNull().default(1),
  /** { work, interests[], situations[] } */
  profile: jsonb('profile').notNull().default({}),
  /** The learner chose to skip the profile */
  profileSkipped: boolean('profile_skipped').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Words a learner connected to a word they studied (family, similar, used together)
 */
export const deepWordLinks = pgTable(
  'deep_word_links',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromItem: text('from_item')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    toItem: text('to_item')
      .notNull()
      .references(() => vocabItems.id, { onDelete: 'cascade' }),
    /** family | synonym | collocate | related */
    kind: text('kind').notNull().default('related'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.fromItem, table.toItem] })]
);

export type DeepWordProgress = typeof deepWordProgress.$inferSelect;
