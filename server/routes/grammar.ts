/**
 * Grammar Routes
 * The grammar map (clusters, points, links), one point's card, and admin review of the AI drafts
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems, grammarPoints, grammarProgress } from '../db/schema.js';
import { recordAttempt } from '../services/progress.js';
import { NEW_POINT, PRACTICE_KIND, generatePracticeSet, masteryOf, schedulePoint, unseenPracticeSet } from '../grammar/practice.js';
import { currentUser, limitAiRequests, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { runAIJson, SCORING_MAX_TOKENS } from '../services/ai.js';
import { GRAMMAR_CLUSTERS, GRAMMAR_POINTS, grammarEdges, type GrammarPointMeta } from '../grammar/map.js';
import { grammarContent, grammarDraftPrompt, type GrammarContent } from '../grammar/content.js';
import { answerGrammarQuestion, recentMistakes, tagTestMistakes } from '../grammar/mistakes.js';

const STATUSES = ['draft', 'reviewed'] as const;
const saveSchema = z.object({ content: grammarContent, status: z.enum(STATUSES) });
const draftSchema = z.object({ model: z.string().max(100).optional() });
const tagSchema = z.object({
  mistakes: z
    .array(z.object({ prompt: z.string().trim().min(1).max(600), correct: z.string().trim().min(1).max(200), chosen: z.string().trim().max(200).optional() }))
    .min(1)
    .max(15),
  model: z.string().max(100).optional(),
});
const askSchema = z.object({ question: z.string().trim().min(3).max(400), model: z.string().max(100).optional() });
const resultSchema = z.object({
  correct: z.number().int().min(0).max(50),
  total: z.number().int().min(1).max(50),
  durationSec: z.number().int().min(0).max(4 * 60 * 60).optional(),
});

const metaOf = (id: string): GrammarPointMeta => {
  const meta = GRAMMAR_POINTS.find((p) => p.id === id);
  if (!meta) throw new HttpError(404, 'Grammar point not found.', 'not_found');
  return meta;
};

const linkOf = (id: string) => {
  const meta = GRAMMAR_POINTS.find((p) => p.id === id);
  return meta ? { id, title: meta.title, cefr: meta.cefr, cluster: meta.cluster } : null;
};
const links = (ids: string[] | undefined) => (ids ?? []).map(linkOf).filter((l) => l !== null);

/**
 * Creates the grammar router
 * @returns Router mounted at /api
 */
export function createGrammarRouter(): Router {
  const router = Router();

  /**
   * GET /grammar - The whole map; each point's summary is included for search
   */
  router.get('/grammar', requireAuth, async (_req, res) => {
    const rows = await db.select({ id: grammarPoints.id, content: grammarPoints.content, status: grammarPoints.status }).from(grammarPoints);
    const byId = new Map(rows.map((r) => [r.id, r]));
    res.json({
      clusters: GRAMMAR_CLUSTERS,
      points: GRAMMAR_POINTS.map((p) => {
        const row = byId.get(p.id);
        return {
          id: p.id,
          cluster: p.cluster,
          title: p.title,
          cefr: p.cefr,
          hasTimeline: Boolean(p.timeline),
          ready: Boolean(row),
          status: row?.status ?? null,
          summary: row ? (row.content as GrammarContent).summary : null,
          signals: row ? (row.content as GrammarContent).signals : [],
        };
      }),
      edges: grammarEdges(),
    });
  });

  /**
   * GET /grammar/progress - The learner's mastery of every practised point, and what is due
   */
  router.get('/grammar/progress', requireAuth, async (req, res) => {
    const rows = await db.select().from(grammarProgress).where(eq(grammarProgress.userId, currentUser(req).id));
    const now = Date.now();
    res.json({
      points: rows.map((r) => ({
        pointId: r.pointId,
        mastery: masteryOf(r.intervalDays),
        due: r.dueAt.getTime() <= now,
        dueAt: r.dueAt,
        lastScore: r.lastScore,
      })),
    });
  });

  /**
   * GET /grammar/mistakes - Grammar points the learner got wrong recently, and which to review now
   */
  router.get('/grammar/mistakes', requireAuth, async (req, res) => {
    res.json({ mistakes: await recentMistakes(currentUser(req).id) });
  });

  /**
   * POST /grammar/tag-mistakes - Finds the grammar point behind wrong test answers and records them
   */
  router.post('/grammar/tag-mistakes', requireAuth, limitAiRequests, async (req, res) => {
    const body = tagSchema.parse(req.body);
    res.json({ points: await tagTestMistakes(currentUser(req), body.mistakes, body.model) });
  });

  /**
   * POST /grammar/ask - Answer a grammar question with links to the points that explain it
   */
  router.post('/grammar/ask', requireAuth, limitAiRequests, async (req, res) => {
    const body = askSchema.parse(req.body);
    const result = await answerGrammarQuestion(currentUser(req), body.question, body.model);
    res.json({ ...result, points: result.points.map((id) => linkOf(id)).filter((l) => l !== null) });
  });

  /**
   * GET /grammar/:id - One point's card with its links
   */
  router.get('/grammar/:id', requireAuth, async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const [row] = await db.select().from(grammarPoints).where(eq(grammarPoints.id, meta.id)).limit(1);
    res.json({
      point: {
        ...meta,
        content: (row?.content as GrammarContent | undefined) ?? null,
        status: row?.status ?? null,
        builds: links(meta.builds),
        // Points that build on this one
        leadsTo: links(GRAMMAR_POINTS.filter((p) => p.builds?.includes(meta.id)).map((p) => p.id)),
        // Contrasts are listed on both sides
        contrasts: links([...new Set([...(meta.contrasts ?? []), ...GRAMMAR_POINTS.filter((p) => p.contrasts?.includes(meta.id)).map((p) => p.id)])]),
        related: links([...new Set([...(meta.related ?? []), ...GRAMMAR_POINTS.filter((p) => p.related?.includes(meta.id)).map((p) => p.id)])]),
      },
    });
  });

  /**
   * POST /grammar/:id/practice - A practice set the learner has not done yet (generated when none is left)
   */
  router.post('/grammar/:id/practice', requireAuth, limitAiRequests, async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const { model } = draftSchema.parse(req.body ?? {});
    const user = currentUser(req);
    const [progress] = await db
      .select({ seenSets: grammarProgress.seenSets })
      .from(grammarProgress)
      .where(and(eq(grammarProgress.userId, user.id), eq(grammarProgress.pointId, meta.id)));
    const set = (await unseenPracticeSet(meta.id, progress?.seenSets ?? [])) ?? (await generatePracticeSet(user, meta, model));
    res.json({ set: { id: set.id, items: (set.payload as { items: unknown[] }).items } });
  });

  /**
   * POST /grammar/:id/practice/:setId/result - Score of a finished set: schedules the next review and records XP
   */
  router.post('/grammar/:id/practice/:setId/result', requireAuth, async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const body = resultSchema.parse(req.body);
    const user = currentUser(req);
    const setId = String(req.params.setId);
    const [set] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(eq(contentItems.id, setId), eq(contentItems.kind, PRACTICE_KIND), eq(contentItems.part, meta.id)));
    if (!set) throw new HttpError(404, 'Practice set not found.', 'not_found');

    const [current] = await db.select().from(grammarProgress).where(and(eq(grammarProgress.userId, user.id), eq(grammarProgress.pointId, meta.id)));
    const score = Math.min(1, body.correct / body.total);
    const next = schedulePoint(current ? { state: current.state as 'learning' | 'review', intervalDays: current.intervalDays, ease: current.ease, reps: current.reps, lapses: current.lapses } : NEW_POINT, score);
    const values = {
      state: next.state,
      dueAt: next.dueAt,
      intervalDays: next.intervalDays,
      ease: next.ease,
      reps: next.reps,
      lapses: next.lapses,
      lastScore: score,
      practicedAt: new Date(),
    };
    await db
      .insert(grammarProgress)
      .values({ userId: user.id, pointId: meta.id, ...values, seenSets: [setId] })
      .onConflictDoUpdate({
        target: [grammarProgress.userId, grammarProgress.pointId],
        set: { ...values, seenSets: sql`array_append(array_remove(${grammarProgress.seenSets}, ${setId}), ${setId})` },
      });

    const { xpEarned } = await recordAttempt(user.id, {
      activity: 'grammar',
      contentRef: meta.id,
      title: meta.title.en,
      score: body.correct,
      maxScore: body.total,
      durationSec: body.durationSec,
    });
    res.json({ progress: { pointId: meta.id, mastery: masteryOf(next.intervalDays), dueAt: next.dueAt, lastScore: score }, xpEarned });
  });

  /**
   * GET /admin/grammar - Review status of every point
   */
  router.get('/admin/grammar', requireAuth, requireRole('admin'), async (_req, res) => {
    const rows = await db.select().from(grammarPoints);
    const byId = new Map(rows.map((r) => [r.id, r]));
    res.json({
      points: GRAMMAR_POINTS.map((p) => {
        const row = byId.get(p.id);
        return { id: p.id, cluster: p.cluster, title: p.title, cefr: p.cefr, status: row?.status ?? null, edited: row?.edited ?? false, updatedAt: row?.updatedAt ?? null };
      }),
    });
  });

  /**
   * PUT /admin/grammar/:id - Save an edited explanation and its review status
   */
  router.put('/admin/grammar/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const body = saveSchema.parse(req.body);
    const user = currentUser(req);
    const values = {
      content: body.content,
      status: body.status,
      edited: true,
      reviewedBy: body.status === 'reviewed' ? user.id : null,
      updatedAt: new Date(),
    };
    await db
      .insert(grammarPoints)
      .values({ id: meta.id, ...values })
      .onConflictDoUpdate({ target: grammarPoints.id, set: values });
    res.json({ ok: true });
  });

  /**
   * POST /admin/grammar/:id/draft - A fresh AI draft for the admin to look at (not saved)
   */
  router.post('/admin/grammar/:id/draft', requireAuth, requireRole('admin'), limitAiRequests, async (req, res) => {
    const meta = metaOf(String(req.params.id));
    const { model } = draftSchema.parse(req.body ?? {});
    const prompt = grammarDraftPrompt(meta);
    const content = await runAIJson(
      currentUser(req),
      { feature: 'grammar-draft', model, timeoutMs: 240_000, maxTokens: SCORING_MAX_TOKENS, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] },
      grammarContent
    );
    content.contrastNotes = content.contrastNotes.filter((n) => meta.contrasts?.includes(n.with));
    res.json({ content });
  });

  return router;
}
