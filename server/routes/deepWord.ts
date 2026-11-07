/**
 * Deep Word Routes
 * Learning English words in depth: settings, the queue, the five-stage session, exercises that fill the depth of a
 * word (form, meaning, use; recognising and producing), and the word page and notebook.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deepWordAttempts, deepWordLinks, deepWordPrefs, deepWordProgress, deepWordQueue, vocabItems, wordBank } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { quotaDay } from '../services/aiAccess.js';
import { enWordId } from '../vocab/data.js';
import { ensureContent, findContent, prepareContent } from '../deepword/content.js';
import { firstSchedule } from '../deepword/schedule.js';
import { checkProduction, resultsOf, verdictOf } from '../deepword/sentence.js';
import { applyResult, type Aspect, type Cells, type Level, type Result } from '../deepword/stage.js';
import { awayFromReviews, cellsOf, dueWords, forgetfulWords, lapsesOf, evidenceOf, fillQueue, MAX_DEFERRALS, MAX_PER_DAY, prefsOf, progressDto, publicWord, queueWords, REVIEW_SESSION, reviewMinutes, stageCounts, stageOf, startedToday, todaysWord } from '../deepword/service.js';

const itemId = z.string().min(4).max(200).startsWith('en:');
const modelField = z.string().max(100).optional();

const prefsSchema = z.object({
  enabled: z.boolean().optional(),
  perDay: z.number().int().min(1).max(MAX_PER_DAY).optional(),
  profile: z
    .object({
      work: z.string().trim().max(80).optional(),
      interests: z.array(z.string().trim().min(1).max(40)).max(5).optional(),
      situations: z.array(z.string().trim().min(1).max(40)).max(5).optional(),
    })
    .optional(),
  profileSkipped: z.boolean().optional(),
});

const startSchema = z.object({ itemId: itemId.optional(), relearn: z.boolean().optional(), model: modelField });
const saveSchema = z.object({ itemId, stage: z.number().int().min(1).max(5), data: z.record(z.string(), z.unknown()).optional() });
const attemptSchema = z.object({
  itemId,
  kind: z.enum(['guess', 'recall', 'listen']),
  aspect: z.enum(['form', 'meaning', 'use']),
  level: z.enum(['r', 'p']).default('r'),
  result: z.enum(['pass', 'partial', 'fail']),
  assisted: z.boolean().default(false),
});
const produceSchema = z
  .object({
    itemId,
    kind: z.enum(['sentence', 'speak', 'paragraph', 'scenario']).default('sentence'),
    text: z.string().trim().min(3).max(800),
    situation: z.string().trim().max(500).optional(),
    alsoUse: z.array(z.string().trim().min(1).max(40)).max(2).optional(),
    model: modelField,
  })
  .refine((b) => b.kind === 'paragraph' || b.text.length <= 400, { message: 'Too long for one sentence.', path: ['text'] })
  .refine((b) => b.kind !== 'scenario' || Boolean(b.situation), { message: 'The situation is missing.', path: ['situation'] });
const selfCheckSchema = z.object({ itemId, ticked: z.number().int().min(0).max(6), total: z.number().int().min(1).max(6) });
const completeSchema = z.object({ itemId, link: z.array(itemId).max(6).default([]), note: z.string().trim().max(500).optional() });

/** Words a learner may connect to a studied word: its family, close words and contrasts that exist in the word list */
async function relatedCandidates(word: string, content: NonNullable<Awaited<ReturnType<typeof findContent>>> | null) {
  if (!content) return [];
  const names = new Set<string>([...content.wordFamily, ...content.synonyms, ...(content.contrast as { word: string }[]).map((c) => c.word)].map((w) => w.toLowerCase().trim()).filter((w) => /^[a-z' -]+$/.test(w) && w !== word.toLowerCase()));
  if (names.size === 0) return [];
  const rows = await db.select().from(vocabItems).where(inArray(vocabItems.id, [...names].map(enWordId)));
  return rows.map(publicWord);
}

/** Two wrong meanings from other words, in the language of the right one, for the "guess the meaning" question */
async function meaningChoices(item: typeof vocabItems.$inferSelect, vietnamese: boolean) {
  const useVi = vietnamese && Boolean(item.meaningVi);
  const others = await db
    .select()
    .from(vocabItems)
    .where(and(eq(vocabItems.language, 'en'), sql`${vocabItems.id} <> ${item.id}`, useVi ? sql`${vocabItems.meaningVi} is not null` : sql`true`))
    .orderBy(sql`random()`)
    .limit(2);
  return {
    lang: useVi ? ('vi' as const) : ('en' as const),
    answer: useVi ? item.meaningVi! : (item.meaningsEn[0] ?? ''),
    wrong: others.map((o) => (useVi ? o.meaningVi! : (o.meaningsEn[0] ?? ''))),
  };
}

async function loadWord(id: string) {
  const [item] = await db.select().from(vocabItems).where(eq(vocabItems.id, id)).limit(1);
  if (!item || item.language !== 'en') throw new HttpError(404, 'Word not found.', 'not_found');
  return item;
}

async function loadProgress(userId: string, id: string) {
  const [row] = await db.select().from(deepWordProgress).where(and(eq(deepWordProgress.userId, userId), eq(deepWordProgress.itemId, id))).limit(1);
  if (!row) throw new HttpError(404, 'Start this word first.', 'not_started');
  return row;
}

/**
 * Creates the Deep Word router
 * @returns Router mounted at /api
 */
export function createDeepWordRouter(): Router {
  const router = Router();

  /** GET /deep/overview - Settings, today's word, the queue and how deep the learner's words are */
  router.get('/deep/overview', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const prefs = await prefsOf(user.id);
    const today = await todaysWord(user, prefs);
    const [queue, counts, doneToday, due] = await Promise.all([prefs.enabled ? queueWords(user.id) : Promise.resolve([]), stageCounts(user.id), startedToday(user.id), dueWords(user.id)]);
    const session = Math.min(due.length, REVIEW_SESSION);
    res.json({
      forgetful: await forgetfulWords(user.id),
      review: { due: due.length, session, minutes: session ? reviewMinutes(session) : 0, welcomeBack: await awayFromReviews(user.id, due.length) },
      prefs: { enabled: prefs.enabled, perDay: prefs.perDay, profile: prefs.profile, profileSkipped: prefs.profileSkipped },
      today,
      doneToday,
      queue,
      stages: counts,
      beginner: ['A1', 'A2'].includes(user.cefrLevel ?? ''),
    });
  });

  /** PUT /deep/prefs - Turn Deep Word on or off, words per day, and the context profile */
  router.put('/deep/prefs', requireAuth, async (req, res) => {
    const body = prefsSchema.parse(req.body);
    const user = currentUser(req);
    const current = await prefsOf(user.id);
    const next = {
      enabled: body.enabled ?? current.enabled,
      perDay: body.perDay ?? current.perDay,
      profile: body.profile ?? current.profile,
      profileSkipped: body.profileSkipped ?? (body.profile ? false : current.profileSkipped),
    };
    await db
      .insert(deepWordPrefs)
      .values({ userId: user.id, ...next })
      .onConflictDoUpdate({ target: deepWordPrefs.userId, set: { ...next, updatedAt: new Date() } });
    res.json({ prefs: next });
  });

  /** POST /deep/queue - Add a word to study in depth (its deep content is written in the background) */
  router.post('/deep/queue', requireAuth, async (req, res) => {
    const body = z.object({ itemId }).parse(req.body);
    const user = currentUser(req);
    await loadWord(body.itemId);
    const [started] = await db.select({ id: deepWordProgress.itemId }).from(deepWordProgress).where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, body.itemId))).limit(1);
    if (!started) {
      await db.insert(deepWordQueue).values({ userId: user.id, itemId: body.itemId, source: 'manual' }).onConflictDoNothing();
      prepareContent(user, body.itemId);
    }
    res.status(201).json({ queued: !started });
  });

  /** DELETE /deep/queue/:itemId - Take a word off the queue */
  router.delete('/deep/queue/:itemId', requireAuth, async (req, res) => {
    await db.delete(deepWordQueue).where(and(eq(deepWordQueue.userId, currentUser(req).id), eq(deepWordQueue.itemId, String(req.params.itemId))));
    res.status(204).end();
  });

  /**
   * POST /deep/session/start - Open the session of a word (today's word when none is named). Writes the word's deep
   * content first when it does not exist yet.
   */
  router.post('/deep/session/start', requireAuth, limitAiRequests, async (req, res) => {
    const body = startSchema.parse(req.body);
    const user = currentUser(req);
    const prefs = await prefsOf(user.id);

    let id = body.itemId;
    if (!id) {
      const today = await todaysWord(user, { ...prefs, enabled: true });
      if (!today.word) throw new HttpError(409, today.state === 'done' ? 'You have studied today’s word.' : 'No word is ready.', today.state === 'done' ? 'deep_daily_limit' : 'deep_empty');
      id = today.word.id;
    }

    const item = await loadWord(id);
    const [existing] = await db.select().from(deepWordProgress).where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, id))).limit(1);
    if (!existing && (await startedToday(user.id)) >= prefs.perDay) {
      throw new HttpError(409, 'You have studied today’s word.', 'deep_daily_limit');
    }

    const content = await ensureContent(user, id, body.model);

    let row = existing;
    if (!row) {
      // A second request for this word can get here during the wait for its content; it opens the same session
      const [created] = await db
        .insert(deepWordProgress)
        .values({ userId: user.id, itemId: id, startedDay: quotaDay(), sessionData: { startCells: cellsOf({ formR: 0, formP: 0, meaningR: 0, meaningP: 0, useR: 0, useP: 0 }) } })
        .onConflictDoNothing()
        .returning();
      row = created ?? (await loadProgress(user.id, id));
      await db.delete(deepWordQueue).where(and(eq(deepWordQueue.userId, user.id), eq(deepWordQueue.itemId, id)));
    } else if (row.completedAt) {
      // Studying a finished word again opens a new session; the depth reached so far is kept
      [row] = await db
        .update(deepWordProgress)
        .set({ completedAt: null, sessionStage: body.relearn ? 2 : 1, sessionData: { startCells: cellsOf(row) }, updatedAt: new Date() })
        .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, id)))
        .returning();
    }

    res.json({
      word: publicWord(item),
      content: { ...content, generatedAt: undefined, fixes: undefined },
      progress: progressDto(row),
      beginner: ['A1', 'A2'].includes(user.cefrLevel ?? ''),
      profile: prefs.profile,
      choices: await meaningChoices(item, user.uiLocale === 'vi'),
    });
  });

  /** POST /deep/session/save - Remember the stage and answers of an open session, to continue later */
  router.post('/deep/session/save', requireAuth, async (req, res) => {
    const body = saveSchema.parse(req.body);
    const user = currentUser(req);
    const row = await loadProgress(user.id, body.itemId);
    const merged = { ...(row.sessionData as Record<string, unknown>), ...(body.data ?? {}) };
    if (JSON.stringify(merged).length > 8000) throw new HttpError(413, 'Too much session data.', 'too_large');
    await db.update(deepWordProgress).set({ sessionStage: body.stage, sessionData: merged, updatedAt: new Date() }).where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, body.itemId)));
    res.status(204).end();
  });

  /** POST /deep/attempt - Record a recognition exercise (a guess, a recall, listening) and update the word's depth */
  router.post('/deep/attempt', requireAuth, async (req, res) => {
    const body = attemptSchema.parse(req.body);
    const user = currentUser(req);
    const row = await loadProgress(user.id, body.itemId);
    const evidence = await evidenceOf(user.id, body.itemId);
    const cells = applyResult(cellsOf(row), body.aspect as Aspect, body.level as Level, body.result as Result, body.assisted, evidence);
    const stage = stageOf(cells, evidence);
    await db.insert(deepWordAttempts).values({ userId: user.id, itemId: body.itemId, kind: body.kind, aspect: body.aspect, result: body.result, assisted: body.assisted });
    const [saved] = await db
      .update(deepWordProgress)
      .set({ ...cells, stage, updatedAt: new Date() })
      .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, body.itemId)))
      .returning();
    res.json({ progress: progressDto(saved) });
  });

  /** POST /deep/produce - AI feedback on a sentence the learner wrote; updates form, meaning and use (producing) */
  router.post('/deep/produce', requireAuth, limitAiRequests, async (req, res) => {
    const body = produceSchema.parse(req.body);
    const user = currentUser(req);
    const row = await loadProgress(user.id, body.itemId);
    const item = await loadWord(body.itemId);

    const check = await checkProduction(user, item, { kind: body.kind, text: body.text, situation: body.situation, alsoUse: body.alsoUse }, body.model);
    const verdict = verdictOf(check);
    const unaided = verdict === 'good';
    const evidence = await evidenceOf(user.id, body.itemId, unaided);
    const results = resultsOf(check);
    let cells: Cells = cellsOf(row);
    for (const aspect of ['form', 'meaning', 'use'] as const) cells = applyResult(cells, aspect, 'p', results[aspect], false, evidence);
    const stage = stageOf(cells, evidence);

    await db.insert(deepWordAttempts).values({
      userId: user.id,
      itemId: body.itemId,
      kind: body.kind,
      aspect: 'use',
      result: verdict === 'good' ? 'pass' : verdict === 'almost' ? 'partial' : 'fail',
      assisted: false,
      userText: body.text,
      feedback: check,
    });
    const [saved] = await db
      .update(deepWordProgress)
      .set({ ...cells, stage, updatedAt: new Date() })
      .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, body.itemId)))
      .returning();
    res.json({ check, verdict, progress: progressDto(saved) });
  });

  /** POST /deep/self-check - Production checked by the learner with a checklist (when AI credits are used up): counts as helped */
  router.post('/deep/self-check', requireAuth, async (req, res) => {
    const body = selfCheckSchema.parse(req.body);
    const user = currentUser(req);
    const row = await loadProgress(user.id, body.itemId);
    const result: Result = body.ticked >= body.total ? 'pass' : 'partial';
    const evidence = await evidenceOf(user.id, body.itemId);
    const cells = applyResult(cellsOf(row), 'use', 'p', result, true, evidence);
    const stage = stageOf(cells, evidence);
    await db.insert(deepWordAttempts).values({ userId: user.id, itemId: body.itemId, kind: 'self-check', aspect: 'use', result, assisted: true });
    const [saved] = await db
      .update(deepWordProgress)
      .set({ ...cells, stage, updatedAt: new Date() })
      .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, body.itemId)))
      .returning();
    res.json({ progress: progressDto(saved) });
  });

  /** POST /deep/defer - "Later" on the production stage; offered a limited number of times */
  router.post('/deep/defer', requireAuth, async (req, res) => {
    const body = z.object({ itemId }).parse(req.body);
    const user = currentUser(req);
    const row = await loadProgress(user.id, body.itemId);
    if (row.deferredCount >= MAX_DEFERRALS) throw new HttpError(409, 'This stage cannot be postponed again.', 'defer_limit');
    const [saved] = await db
      .update(deepWordProgress)
      .set({ deferredCount: row.deferredCount + 1, updatedAt: new Date() })
      .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, body.itemId)))
      .returning();
    res.json({ progress: progressDto(saved) });
  });

  /** GET /deep/related/:itemId - Words the learner can connect to this one at the end of a session */
  router.get('/deep/related/:itemId', requireAuth, async (req, res) => {
    const id = itemId.parse(req.params.itemId);
    const item = await loadWord(id);
    res.json({ words: await relatedCandidates(item.term, await findContent(id)) });
  });

  /** POST /deep/session/complete - Finish a session: schedule the first review and save the words the learner connected */
  router.post('/deep/session/complete', requireAuth, async (req, res) => {
    const body = completeSchema.parse(req.body);
    const user = currentUser(req);
    const row = await loadProgress(user.id, body.itemId);
    if (row.useP < 1 && row.deferredCount === 0) throw new HttpError(409, 'Use the word once, or choose to do it later.', 'production_required');

    const now = new Date();
    const schedule = firstSchedule(now);
    const start = ((row.sessionData as { startCells?: Cells }).startCells ?? null) as Cells | null;
    const [saved] = await db
      .update(deepWordProgress)
      .set({ completedAt: now, nextReviewAt: schedule[0], reviewStep: 0, note: body.note ?? row.note, updatedAt: now })
      .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, body.itemId)))
      .returning();

    // The word joins the learner's saved words, so it is reviewed like the others
    await db.insert(wordBank).values({ userId: user.id, itemId: body.itemId, source: 'manual' }).onConflictDoNothing();

    const targets = body.link.filter((id) => id !== body.itemId);
    if (targets.length > 0) {
      const existing = await db.select({ id: vocabItems.id }).from(vocabItems).where(inArray(vocabItems.id, targets));
      if (existing.length > 0) await db.insert(deepWordLinks).values(existing.map((t) => ({ userId: user.id, fromItem: body.itemId, toItem: t.id, kind: 'related' }))).onConflictDoNothing();
    }
    res.json({ progress: progressDto(saved), startCells: start, schedule, deferred: row.useP < 1 });
  });

  /** GET /deep/word/:itemId - The word page: content, depth, the learner's own sentences, connected words */
  router.get('/deep/word/:itemId', requireAuth, async (req, res) => {
    const id = itemId.parse(req.params.itemId);
    const user = currentUser(req);
    const item = await loadWord(id);
    const [content, progress, sentences, links, queued] = await Promise.all([
      findContent(id),
      db.select().from(deepWordProgress).where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, id))).limit(1),
      db
        .select()
        .from(deepWordAttempts)
        .where(and(eq(deepWordAttempts.userId, user.id), eq(deepWordAttempts.itemId, id), eq(deepWordAttempts.kind, 'sentence')))
        .orderBy(desc(deepWordAttempts.createdAt))
        .limit(10),
      db
        .select({ item: vocabItems })
        .from(deepWordLinks)
        .innerJoin(vocabItems, eq(vocabItems.id, deepWordLinks.toItem))
        .where(and(eq(deepWordLinks.userId, user.id), eq(deepWordLinks.fromItem, id))),
      db.select({ id: deepWordQueue.itemId }).from(deepWordQueue).where(and(eq(deepWordQueue.userId, user.id), eq(deepWordQueue.itemId, id))).limit(1),
    ]);
    res.json({
      word: publicWord(item),
      content: content ? { ...content, generatedAt: undefined, fixes: undefined } : null,
      progress: progress[0] ? progressDto(progress[0]) : null,
      sentences: sentences.map((s) => ({ id: s.id, text: s.userText, result: s.result, improved: (s.feedback as { improved?: string } | null)?.improved ?? null, at: s.createdAt })),
      links: links.map((l) => publicWord(l.item)),
      queued: queued.length > 0,
      lapses: (await lapsesOf(user.id, [id])).get(id) ?? 0,
    });
  });

  /** GET /deep/notebook - Words studied in depth, deepest last; optional stage and text filters */
  router.get('/deep/notebook', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const stage = z.coerce.number().int().min(1).max(5).optional().parse(req.query.stage);
    const q = z.string().trim().max(60).optional().parse(req.query.q);
    const weak = z.enum(['form', 'meaning', 'use']).optional().parse(req.query.weak);
    const weakCell = weak ? { form: deepWordProgress.formP, meaning: deepWordProgress.meaningP, use: deepWordProgress.useP }[weak] : null;
    const rows = await db
      .select({ item: vocabItems, progress: deepWordProgress })
      .from(deepWordProgress)
      .innerJoin(vocabItems, eq(vocabItems.id, deepWordProgress.itemId))
      .where(and(eq(deepWordProgress.userId, user.id), stage ? eq(deepWordProgress.stage, stage) : undefined, weakCell ? sql`${weakCell} < 2 and ${deepWordProgress.completedAt} is not null` : undefined, q ? sql`${vocabItems.term} ilike ${`%${q.replace(/[%_]/g, '')}%`}` : undefined))
      .orderBy(asc(deepWordProgress.stage), desc(deepWordProgress.updatedAt));
    res.json({ words: rows.map(({ item, progress }) => ({ ...publicWord(item), progress: progressDto(progress) })) });
  });

  /** POST /deep/queue/refill - Top up the queue (used when the learner opens the queue) */
  router.post('/deep/queue/refill', requireAuth, async (req, res) => {
    const user = currentUser(req);
    await fillQueue(user);
    res.json({ queue: await queueWords(user.id) });
  });

  return router;
}
