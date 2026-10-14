/**
 * Grammar Routes
 * The grammar map (clusters, points, links), one point's card, and admin review of the AI drafts
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { grammarPoints } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { runAIJson } from '../services/ai.js';
import { GRAMMAR_CLUSTERS, GRAMMAR_POINTS, grammarEdges, type GrammarPointMeta } from '../grammar/map.js';
import { grammarContent, grammarDraftPrompt, type GrammarContent } from '../grammar/content.js';

const STATUSES = ['draft', 'reviewed'] as const;
const saveSchema = z.object({ content: grammarContent, status: z.enum(STATUSES) });
const draftSchema = z.object({ model: z.string().max(100).optional() });

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
      { feature: 'grammar-draft', model, timeoutMs: 240_000, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] },
      grammarContent
    );
    content.contrastNotes = content.contrastNotes.filter((n) => meta.contrasts?.includes(n.with));
    res.json({ content });
  });

  return router;
}
