/**
 * Deep Word review routes
 * Spaced reviews of words studied in depth (one exercise per word, a different kind each time), the depth statistics,
 * and the admin tools to check the AI-written word notes.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deepWordAttempts, deepWordContent, deepWordProgress, vocabItems } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { contentPrompt, deepContentSchema, ensureFixes, findContent, prepareFixes, type DeepContent } from '../deepword/content.js';
import { nextReview, repeatReview, type ReviewKind } from '../deepword/schedule.js';
import { blank, clozePool, pickKind, sameSentence, sameWord } from '../deepword/review.js';
import { checkSentence, resultsOf, verdictOf, type SentenceCheck } from '../deepword/sentence.js';
import { applyResult, type Aspect, type Cells, type Result } from '../deepword/stage.js';
import { awayFromReviews, cellsOf, dueWords, evidenceOf, prefsOf, progressDto, publicWord, REVIEW_SESSION, reviewMinutes, stageOf } from '../deepword/service.js';
import { GENERATE_TIMEOUT_MS, runAIJson } from '../services/ai.js';

const itemId = z.string().min(4).max(200).startsWith('en:');
const answerSchema = z.object({
  itemId,
  kind: z.enum(['recall', 'cloze', 'fix', 'sentence']),
  ref: z.number().int().min(0).max(50).default(0),
  answer: z.string().trim().max(400).default(''),
  /** Sentence kind without AI: how many of the checklist items the learner ticked */
  selfCheck: z.object({ ticked: z.number().int().min(0).max(6), total: z.number().int().min(1).max(6) }).optional(),
  model: z.string().max(100).optional(),
});

type Fix = { wrong: string; right: string; note: string };
type Example = { text: string; vi: string };

/** Attempts of each review kind per word, to rotate through that word's sentences */
async function kindCounts(userId: string, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: deepWordAttempts.itemId, kind: deepWordAttempts.kind, n: sql<number>`count(*)::int` })
    .from(deepWordAttempts)
    .where(and(eq(deepWordAttempts.userId, userId), inArray(deepWordAttempts.itemId, ids), inArray(deepWordAttempts.kind, ['review-cloze', 'review-fix'])))
    .groupBy(deepWordAttempts.itemId, deepWordAttempts.kind);
  return new Map(rows.map((r) => [`${r.id}:${r.kind}`, r.n]));
}

/** The attempt kind stored for a review kind (the sentence kind is shared with the first session) */
const attemptKind = (kind: ReviewKind) => (kind === 'sentence' ? 'sentence' : `review-${kind}`);

/**
 * Creates the Deep Word review router
 * @returns Router mounted at /api
 */
export function createDeepReviewRouter(): Router {
  const router = Router();

  /** GET /deep/review - The next short session of due words, each with its exercise. `ai=0` offers only kinds that need no AI. */
  router.get('/deep/review', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const ai = req.query.ai !== '0';
    const prefs = await prefsOf(user.id);
    const due = await dueWords(user.id);
    const batch = due.slice(0, REVIEW_SESSION);
    const counts = await kindCounts(user.id, batch.map((d) => d.item.id));

    const items = [];
    for (const { item, progress } of batch) {
      const content = await findContent(item.id);
      if (!content) continue;
      const fixes = content.fixes as Fix[];
      if (fixes.length === 0 && ai) prepareFixes(user, item.id);
      const pool = clozePool(item.term, item.example, item.exampleVi, content.examples as Example[], content.collocations as { example: string }[]);
      const kind = pickKind({
        step: progress.reviewStep,
        lastKind: progress.lastKind,
        lastGood: progress.lastGood,
        needsSentence: progress.useP < 1,
        available: { recall: true, cloze: pool.length > 0, fix: fixes.length > 0, sentence: ai },
      });
      const base = { word: publicWord(item), stage: progress.stage, cells: cellsOf(progress) };
      if (kind === 'recall') items.push({ ...base, exercise: { kind, definition: content.simpleDefinition, pos: item.pos, first: item.term[0], length: item.term.length } });
      else if (kind === 'cloze') {
        const ref = (counts.get(`${item.id}:review-cloze`) ?? 0) % pool.length;
        const b = blank(pool[ref].text, item.term)!;
        items.push({ ...base, exercise: { kind, ref, text: b.text, vi: pool[ref].vi ?? null, first: b.answer[0], length: b.answer.length } });
      } else if (kind === 'fix') {
        const ref = (counts.get(`${item.id}:review-fix`) ?? 0) % fixes.length;
        items.push({ ...base, exercise: { kind, ref, wrong: fixes[ref].wrong } });
      } else {
        const topics = [prefs.profile.work, ...(prefs.profile.situations ?? []), ...(prefs.profile.interests ?? [])].filter(Boolean) as string[];
        items.push({ ...base, exercise: { kind, topic: topics.length ? topics[progress.reviewStep % topics.length] : null, firstSentence: progress.useP < 1 } });
      }
    }

    res.json({ due: due.length, minutes: reviewMinutes(items.length), items, welcomeBack: await awayFromReviews(user.id, due.length) });
  });

  /** POST /deep/review/answer - Grade one review exercise, update the word's depth and set its next review */
  router.post('/deep/review/answer', requireAuth, async (req, res) => {
    const body = answerSchema.parse(req.body);
    const user = currentUser(req);
    const [row] = await db
      .select({ item: vocabItems, progress: deepWordProgress })
      .from(deepWordProgress)
      .innerJoin(vocabItems, eq(vocabItems.id, deepWordProgress.itemId))
      .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, body.itemId)))
      .limit(1);
    if (!row || !row.progress.completedAt) throw new HttpError(404, 'This word is not ready for review.', 'not_started');
    const { item, progress } = row;
    const content = await findContent(body.itemId);
    if (!content) throw new HttpError(404, 'This word has no notes yet.', 'not_found');

    let result: Result = 'fail';
    let assisted = false;
    let aspectResults: Partial<Record<Aspect, Result>> = {};
    let explanation: Record<string, unknown> = {};
    let check: SentenceCheck | null = null;

    if (body.kind === 'recall') {
      result = sameWord(body.answer, item.term) ? 'pass' : 'fail';
      aspectResults = { meaning: result };
      explanation = { answer: item.term };
    } else if (body.kind === 'cloze') {
      const pool = clozePool(item.term, item.example, item.exampleVi, content.examples as Example[], content.collocations as { example: string }[]);
      if (pool.length === 0) throw new HttpError(409, 'No sentence for this word.', 'no_exercise');
      const source = pool[body.ref % pool.length];
      const b = blank(source.text, item.term)!;
      result = sameWord(body.answer, item.term, b.answer) ? 'pass' : 'fail';
      aspectResults = { form: result };
      explanation = { answer: b.answer, sentence: source.text };
    } else if (body.kind === 'fix') {
      const fixes = content.fixes as Fix[];
      if (fixes.length === 0) throw new HttpError(409, 'No sentence to fix for this word.', 'no_exercise');
      const fix = fixes[body.ref % fixes.length];
      explanation = { right: fix.right, note: fix.note };
      if (sameSentence(body.answer, fix.right)) result = 'pass';
      else if (sameSentence(body.answer, fix.wrong) || body.answer.length < 3) result = 'fail';
      else {
        // A different correction can still be right: let the AI judge it
        try {
          check = await checkSentence(user, item, body.answer, body.model);
          result = check.meaningOk && check.formOk && check.naturalOk ? 'pass' : 'fail';
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          result = 'partial';
          assisted = true;
        }
      }
      aspectResults = { use: result };
    } else if (body.selfCheck) {
      result = 'partial';
      assisted = true;
      aspectResults = { use: 'partial' };
    } else {
      if (body.answer.length < 3) throw new HttpError(400, 'Write a sentence.', 'bad_request');
      limitAiRequests(req, {} as Response, () => undefined);
      check = await checkSentence(user, item, body.answer, body.model);
      const verdict = verdictOf(check);
      result = verdict === 'good' ? 'pass' : verdict === 'almost' ? 'partial' : 'fail';
      aspectResults = resultsOf(check);
      explanation = { improved: check.improved };
    }

    const unaided = result === 'pass' && !assisted;
    const evidence = await evidenceOf(user.id, body.itemId, unaided);
    const before: Cells = cellsOf(progress);
    let cells: Cells = before;
    for (const [aspect, r] of Object.entries(aspectResults) as [Aspect, Result][]) cells = applyResult(cells, aspect, 'p', r, assisted, evidence);
    const stage = stageOf(cells, evidence);

    const now = new Date();
    const outcome = result === 'pass' && !assisted ? 'good' : result === 'fail' ? 'bad' : 'same';
    const schedule = outcome === 'same' ? repeatReview(progress.reviewStep, now) : nextReview(progress.reviewStep, outcome === 'good', now);

    await db.insert(deepWordAttempts).values({
      userId: user.id,
      itemId: body.itemId,
      kind: body.selfCheck && body.kind === 'sentence' ? 'self-check' : attemptKind(body.kind),
      aspect: Object.keys(aspectResults)[0] ?? 'use',
      result,
      assisted,
      userText: body.answer || null,
      feedback: check,
    });
    const [saved] = await db
      .update(deepWordProgress)
      .set({ ...cells, stage, reviewStep: schedule.step, nextReviewAt: schedule.dueAt, lastKind: body.kind, lastGood: outcome !== 'bad', lastReviewedAt: now, updatedAt: now })
      .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, body.itemId)))
      .returning();

    res.json({ result, outcome, assisted, explanation, check, cellsBefore: before, progress: progressDto(saved) });
  });

  /** GET /deep/stats - How deep the learner's words are, and what to do about it */
  router.get('/deep/stats', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const rows = await db.select().from(deepWordProgress).where(and(eq(deepWordProgress.userId, user.id), sql`${deepWordProgress.completedAt} is not null`));
    const stages = [0, 0, 0, 0, 0];
    const weak = { form: 0, meaning: 0, use: 0 };
    for (const r of rows) {
      stages[r.stage - 1]++;
      if (r.formP < 2) weak.form++;
      if (r.meaningP < 2) weak.meaning++;
      if (r.useP < 2) weak.use++;
    }
    // Words whose latest exercise of producing the word was right and needed no help
    const latest = await db.execute(sql`
      select count(*) filter (where result = 'pass' and not assisted)::int as ok, count(*)::int as total
      from (
        select distinct on (item_id) result, assisted from deep_word_attempts
        where user_id = ${user.id} and kind in ('sentence', 'speak', 'paragraph', 'scenario', 'review-fix', 'review-cloze', 'review-recall')
        order by item_id, created_at desc
      ) t`);
    const list = (Array.isArray(latest) ? latest : (latest as unknown as { rows: unknown[] }).rows) as { ok: number; total: number }[];
    const first = list[0] ?? { ok: 0, total: 0 };
    res.json({ total: rows.length, stages, weak, unaided: { ok: Number(first.ok), of: Number(first.total) }, recognisedOnly: stages[0] + stages[1] });
  });

  /** GET /admin/deep-words - Word notes, newest first (admin) */
  router.get('/admin/deep-words', requireAuth, requireRole('admin'), async (req: Request, res) => {
    const q = z.string().trim().max(60).optional().parse(req.query.q);
    const rows = await db
      .select({ id: deepWordContent.itemId, term: vocabItems.term, status: deepWordContent.status, generatedAt: deepWordContent.generatedAt })
      .from(deepWordContent)
      .innerJoin(vocabItems, eq(vocabItems.id, deepWordContent.itemId))
      .where(q ? sql`${vocabItems.term} ilike ${`%${q.replace(/[%_]/g, '')}%`}` : undefined)
      .orderBy(desc(deepWordContent.generatedAt))
      .limit(100);
    res.json({ words: rows });
  });

  /** GET /admin/deep-words/:itemId - The editable notes of a word (admin) */
  router.get('/admin/deep-words/:itemId', requireAuth, requireRole('admin'), async (req, res) => {
    const content = await findContent(itemId.parse(req.params.itemId));
    if (!content) throw new HttpError(404, 'No notes for this word.', 'not_found');
    res.json({
      content: { simpleDefinition: content.simpleDefinition, coreUse: content.coreUse, synonyms: content.synonyms, antonyms: content.antonyms, contrast: content.contrast, wordFamily: content.wordFamily, collocations: content.collocations, register: content.register, examples: content.examples, fixes: content.fixes },
      status: content.status,
    });
  });

  /** PUT /admin/deep-words/:itemId - Save edited notes; `approved` marks them as checked (admin) */
  router.put('/admin/deep-words/:itemId', requireAuth, requireRole('admin'), async (req, res) => {
    const id = itemId.parse(req.params.itemId);
    const body = z.object({ content: deepContentSchema, status: z.enum(['ai', 'approved']) }).parse(req.body);
    const updated = await db.update(deepWordContent).set({ ...body.content, status: body.status }).where(eq(deepWordContent.itemId, id)).returning({ id: deepWordContent.itemId });
    if (updated.length === 0) throw new HttpError(404, 'No notes for this word.', 'not_found');
    res.status(204).end();
  });

  /** POST /admin/deep-words/:itemId/regenerate - Write fresh notes with the AI, replacing the saved ones (admin) */
  router.post('/admin/deep-words/:itemId/regenerate', requireAuth, requireRole('admin'), limitAiRequests, async (req, res) => {
    const id = itemId.parse(req.params.itemId);
    const user = currentUser(req);
    const [item] = await db.select().from(vocabItems).where(eq(vocabItems.id, id)).limit(1);
    if (!item) throw new HttpError(404, 'Word not found.', 'not_found');
    const prompt = contentPrompt(item);
    const content: DeepContent = await runAIJson(user, { feature: 'deep-word-content', system: prompt.system, messages: [{ role: 'user', content: prompt.user }], timeoutMs: GENERATE_TIMEOUT_MS }, deepContentSchema);
    await db.insert(deepWordContent).values({ itemId: id, ...content }).onConflictDoUpdate({ target: deepWordContent.itemId, set: { ...content, status: 'ai', generatedAt: new Date() } });
    res.json({ content });
  });

  /** POST /deep/review/fixes/:itemId - Write the missing "fix the sentence" exercises of a word (older notes have none) */
  router.post('/deep/review/fixes/:itemId', requireAuth, limitAiRequests, async (req, res) => {
    res.json({ fixes: (await ensureFixes(currentUser(req), itemId.parse(req.params.itemId))).length });
  });

  return router;
}
