/**
 * Mind Map AI Routes
 * The AI never edits a saved map: it makes a draft. The learner confirms it (it becomes, or replaces, a map),
 * renames it, or cancels it (the draft and any new name are gone). After a confirmed update the old version can
 * be restored.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gt, lt, notInArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { mindMapDrafts, mindMaps, mindMapVersions, type User } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { SCORING_MAX_TOKENS, SCORING_TIMEOUT_MS, runAIJson } from '../services/ai.js';
import { MAX_MAPS_PER_USER, DocError, type MapDoc } from '../maps/doc.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { MAX_ISSUES, checkPrompt, checkSchema, cleanIssues, referenceFor, verdictSchema, verifyPrompt, type MapIssue } from '../maps/check.js';
import { diffDocs, learnerContext, lookupWords, proposalPrompt, proposalSchema, docToTree, treeToDoc, wordsIn, type Mode } from '../maps/ai.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Drafts a learner can have waiting, and how many old versions a map keeps for undo */
const MAX_DRAFTS = 3;
const KEEP_VERSIONS = 10;

const idSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(100);

const proposeSchema = z
  .object({
    intent: z.enum(['create', 'topic', 'update']),
    mapId: idSchema.optional(),
    topic: z.string().trim().min(3).max(200).optional(),
    instruction: z.string().trim().max(400).optional(),
    model: z.string().trim().max(100).optional(),
    /** Problems found by the check that the AI should fix */
    issues: z.array(z.object({ nodeId: z.string().max(24), problem: z.string().max(500), suggestion: z.string().max(500).default('') })).max(MAX_ISSUES).optional(),
  })
  .refine((b) => b.intent !== 'update' || b.mapId, { message: 'mapId is required to update a map', path: ['mapId'] })
  .refine((b) => b.intent !== 'topic' || b.topic, { message: 'topic is required', path: ['topic'] });

const renameSchema = z.object({ title: titleSchema });
const confirmSchema = z.object({ title: titleSchema.optional() });
const restoreSchema = z.object({ version: z.number().int().min(1) });

type DraftRow = typeof mindMapDrafts.$inferSelect;

/**
 * Draft as sent to the client, with what it would change
 */
async function present(draft: DraftRow) {
  const changes = draft.changes as { type: string }[];
  const counts = { added: 0, changed: 0, moved: 0, removed: 0 };
  for (const change of changes) counts[change.type as keyof typeof counts]++;
  const doc = draft.doc as MapDoc;
  let mapTitle: string | null = null;
  if (draft.mapId) {
    const [map] = await db.select({ title: mindMaps.title }).from(mindMaps).where(eq(mindMaps.id, draft.mapId)).limit(1);
    mapTitle = map?.title ?? null;
  }
  return {
    id: draft.id,
    kind: draft.mapId ? ('update' as const) : ('create' as const),
    mapId: draft.mapId,
    mapTitle,
    title: draft.title,
    summary: draft.summary,
    doc,
    nodeCount: Object.keys(doc.nodes).length,
    changes,
    counts,
    expiresAt: draft.expiresAt,
  };
}

async function ownDraft(userId: string, id: string): Promise<DraftRow> {
  const [draft] = await db
    .select()
    .from(mindMapDrafts)
    .where(and(eq(mindMapDrafts.id, id), eq(mindMapDrafts.userId, userId), gt(mindMapDrafts.expiresAt, new Date())))
    .limit(1);
  if (!draft) throw new HttpError(404, 'This proposal is no longer available.', 'not_found');
  return draft;
}

/**
 * Asks the AI and turns its answer into a draft
 */
async function propose(user: User, body: z.infer<typeof proposeSchema>) {
  let base: { id: string; title: string; doc: MapDoc; version: number } | null = null;
  if (body.intent === 'update') {
    const [map] = await db.select().from(mindMaps).where(and(eq(mindMaps.id, body.mapId!), eq(mindMaps.userId, user.id))).limit(1);
    if (!map) throw new HttpError(404, 'Map not found.', 'not_found');
    base = { id: map.id, title: map.title, doc: map.doc as MapDoc, version: map.version };
  } else {
    const [{ owned }] = await db.select({ owned: count() }).from(mindMaps).where(eq(mindMaps.userId, user.id));
    if (owned >= MAX_MAPS_PER_USER) throw new HttpError(409, `You can keep up to ${MAX_MAPS_PER_USER} maps. Delete one to make room.`, 'map_limit');
  }

  const mode: Mode = body.intent === 'update' ? 'update' : body.intent === 'topic' ? 'topic' : 'learned';
  const request = [
    body.topic && `Topic: ${body.topic}`,
    body.instruction && `Instruction: ${body.instruction}`,
    base && `Current map (JSON):\n${JSON.stringify(docToTree(base.doc))}`,
    base && body.issues?.length
      ? `Problems to fix (change only what is needed to fix them):\n${body.issues.map((i) => `- node "${base.doc.nodes[i.nodeId]?.text ?? i.nodeId}" (id ${i.nodeId}): ${i.problem}${i.suggestion ? ` Suggestion: ${i.suggestion}` : ''}`).join('\n')}`
      : '',
    `Learner data:\n${await learnerContext(user)}`,
    mode === 'update' && !body.instruction && !body.issues?.length ? 'Instruction: bring the map up to date with what the learner has studied.' : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const proposal = await runAIJson(
    user,
    { feature: 'mindmap-propose', model: body.model, system: proposalPrompt(user, mode), messages: [{ role: 'user', content: request }], timeoutMs: SCORING_TIMEOUT_MS, maxTokens: SCORING_MAX_TOKENS },
    proposalSchema
  );

  let doc: MapDoc;
  try {
    doc = treeToDoc(proposal.root, base?.doc ?? null, await lookupWords(wordsIn(proposal.root), user.studyLanguage));
  } catch (error) {
    if (error instanceof DocError) throw new HttpError(502, 'The AI returned a map that could not be used. Please try again.', 'ai_invalid_output');
    throw error;
  }

  // An update keeps the learner's own title unless the AI had a reason to change it
  const title = base ? base.title : proposal.title;
  await db.delete(mindMapDrafts).where(and(eq(mindMapDrafts.userId, user.id), lt(mindMapDrafts.expiresAt, new Date())));
  const [draft] = await db
    .insert(mindMapDrafts)
    .values({
      userId: user.id,
      mapId: base?.id ?? null,
      baseVersion: base?.version ?? null,
      language: user.studyLanguage,
      title,
      doc,
      changes: base ? diffDocs(base.doc, doc) : [],
      summary: proposal.summary || null,
      instruction: body.instruction ?? body.topic ?? null,
      expiresAt: new Date(Date.now() + DAY_MS),
    })
    .returning();

  // Keep only the newest few waiting drafts
  const keep = await db.select({ id: mindMapDrafts.id }).from(mindMapDrafts).where(eq(mindMapDrafts.userId, user.id)).orderBy(desc(mindMapDrafts.createdAt)).limit(MAX_DRAFTS);
  await db.delete(mindMapDrafts).where(and(eq(mindMapDrafts.userId, user.id), notInArray(mindMapDrafts.id, keep.map((k) => k.id))));
  return draft;
}

/**
 * Creates the mind map AI router
 * @returns Router mounted at /api
 */
export function createMapsAiRouter(): Router {
  const router = Router();

  /**
   * POST /maps/propose - The AI drafts a new map (from what was studied, or a topic) or an update of one
   */
  router.post('/maps/propose', requireAuth, limitAiRequests, async (req, res) => {
    const draft = await propose(currentUser(req), proposeSchema.parse(req.body));
    res.status(201).json({ draft: await present(draft) });
  });

  /**
   * POST /maps/:id/check - Two AI passes: list possible problems, then keep only the ones a stricter reviewer confirms
   */
  router.post('/maps/:id/check', requireAuth, limitAiRequests, async (req, res) => {
    const user = currentUser(req);
    const id = idSchema.parse(req.params.id);
    const { model } = z.object({ model: z.string().trim().max(100).optional() }).parse(req.body ?? {});
    const [map] = await db.select().from(mindMaps).where(and(eq(mindMaps.id, id), eq(mindMaps.userId, user.id))).limit(1);
    if (!map) throw new HttpError(404, 'Map not found.', 'not_found');

    const doc = map.doc as MapDoc;
    const reference = await referenceFor(doc);
    const catalog = user.studyLanguage === 'en' ? GRAMMAR_POINTS.map((p) => `${p.id} | ${p.title.en}`).join('\n') : '(none for this language)';
    const common = { feature: 'mindmap-check', model, timeoutMs: SCORING_TIMEOUT_MS, maxTokens: SCORING_MAX_TOKENS };

    const first = await runAIJson(
      user,
      { ...common, system: checkPrompt(user), messages: [{ role: 'user', content: `Map (JSON):\n${JSON.stringify(docToTree(doc))}\n\nReference cards:\n${reference}\n\nGrammar catalog:\n${catalog}` }] },
      checkSchema
    );
    const candidates = cleanIssues(first.issues, doc);
    if (candidates.length === 0) {
      res.json({ issues: [], version: map.version });
      return;
    }

    // Second pass: a stricter reviewer drops what is not really wrong
    const review = candidates.map((c, index) => JSON.stringify({ index, nodeId: c.nodeId, node: c.nodeText, kind: c.kind, problem: c.problem, suggestion: c.suggestion })).join('\n');
    const { verdicts } = await runAIJson(user, { ...common, system: verifyPrompt(user), messages: [{ role: 'user', content: `Reference cards:\n${reference}\n\nMap (JSON):\n${JSON.stringify(docToTree(doc))}\n\nIssues:\n${review}` }] }, verdictSchema);
    const keep = new Set(verdicts.filter((v) => v.keep).map((v) => v.index));
    const issues: MapIssue[] = candidates.flatMap((c, i) => (keep.has(i) ? [{ id: `i${i + 1}`, ...c }] : []));
    res.json({ issues, version: map.version });
  });

  router.get('/maps/drafts/:id', requireAuth, async (req, res) => {
    res.json({ draft: await present(await ownDraft(currentUser(req).id, idSchema.parse(req.params.id))) });
  });

  /**
   * PATCH /maps/drafts/:id - Rename the draft (applied to the map only when it is confirmed)
   */
  router.patch('/maps/drafts/:id', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const draft = await ownDraft(user.id, idSchema.parse(req.params.id));
    const { title } = renameSchema.parse(req.body);
    const [row] = await db.update(mindMapDrafts).set({ title }).where(eq(mindMapDrafts.id, draft.id)).returning();
    res.json({ draft: await present(row) });
  });

  /**
   * POST /maps/drafts/:id/confirm - Make the draft a new map, or replace the map it updates
   * @throws {409} draft_stale when the map changed after the proposal was made
   */
  router.post('/maps/drafts/:id/confirm', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const draft = await ownDraft(user.id, idSchema.parse(req.params.id));
    const { title } = confirmSchema.parse(req.body ?? {});
    const finalTitle = title ?? draft.title;

    const result = await db.transaction(async (tx) => {
      if (!draft.mapId) {
        const [{ owned }] = await tx.select({ owned: count() }).from(mindMaps).where(eq(mindMaps.userId, user.id));
        if (owned >= MAX_MAPS_PER_USER) throw new HttpError(409, `You can keep up to ${MAX_MAPS_PER_USER} maps. Delete one to make room.`, 'map_limit');
        const [created] = await tx.insert(mindMaps).values({ userId: user.id, language: draft.language, title: finalTitle, doc: draft.doc }).returning();
        await tx.delete(mindMapDrafts).where(eq(mindMapDrafts.id, draft.id));
        return { map: created, previousVersion: null as number | null };
      }

      const [current] = await tx.select().from(mindMaps).where(and(eq(mindMaps.id, draft.mapId), eq(mindMaps.userId, user.id))).limit(1);
      if (!current) throw new HttpError(404, 'Map not found.', 'not_found');
      if (current.version !== draft.baseVersion) throw new HttpError(409, 'The map changed after this proposal was made. Ask again to update the latest version.', 'draft_stale');

      await tx.insert(mindMapVersions).values({ mapId: current.id, version: current.version, title: current.title, doc: current.doc });
      const [updated] = await tx
        .update(mindMaps)
        .set({ title: finalTitle, doc: draft.doc, version: current.version + 1, updatedAt: new Date() })
        .where(eq(mindMaps.id, current.id))
        .returning();
      // Keep the newest versions only
      const keep = await tx.select({ version: mindMapVersions.version }).from(mindMapVersions).where(eq(mindMapVersions.mapId, current.id)).orderBy(desc(mindMapVersions.version)).limit(KEEP_VERSIONS);
      await tx.delete(mindMapVersions).where(and(eq(mindMapVersions.mapId, current.id), notInArray(mindMapVersions.version, keep.map((k) => k.version))));
      await tx.delete(mindMapDrafts).where(eq(mindMapDrafts.id, draft.id));
      return { map: updated, previousVersion: current.version };
    });

    const { map } = result;
    res.json({ map: { id: map.id, title: map.title, language: map.language, doc: map.doc, version: map.version, updatedAt: map.updatedAt }, previousVersion: result.previousVersion });
  });

  /**
   * DELETE /maps/drafts/:id - Cancel: the draft, and any new name, are discarded
   */
  router.delete('/maps/drafts/:id', requireAuth, async (req, res) => {
    const [row] = await db.delete(mindMapDrafts).where(and(eq(mindMapDrafts.id, idSchema.parse(req.params.id)), eq(mindMapDrafts.userId, currentUser(req).id))).returning({ id: mindMapDrafts.id });
    if (!row) throw new HttpError(404, 'This proposal is no longer available.', 'not_found');
    res.status(204).end();
  });

  /**
   * POST /maps/:id/restore - Put back an earlier version (the undo after a confirmed AI update)
   */
  router.post('/maps/:id/restore', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const id = idSchema.parse(req.params.id);
    const { version } = restoreSchema.parse(req.body);

    const map = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(mindMaps).where(and(eq(mindMaps.id, id), eq(mindMaps.userId, user.id))).limit(1);
      if (!current) throw new HttpError(404, 'Map not found.', 'not_found');
      const [old] = await tx.select().from(mindMapVersions).where(and(eq(mindMapVersions.mapId, id), eq(mindMapVersions.version, version))).limit(1);
      if (!old) throw new HttpError(404, 'That version is no longer available.', 'not_found');
      // What is being replaced is kept too, so the restore can be undone
      await tx.insert(mindMapVersions).values({ mapId: id, version: current.version, title: current.title, doc: current.doc }).onConflictDoNothing();
      const [restored] = await tx.update(mindMaps).set({ title: old.title, doc: old.doc, version: current.version + 1, updatedAt: new Date() }).where(eq(mindMaps.id, id)).returning();
      return restored;
    });
    res.json({ map: { id: map.id, title: map.title, language: map.language, doc: map.doc, version: map.version, updatedAt: map.updatedAt }, previousVersion: map.version - 1 });
  });

  return router;
}
