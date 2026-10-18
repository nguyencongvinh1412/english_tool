/**
 * Mind Map Routes
 * A learner's personal tree maps: list, create (blank or from a grammar topic), open, save with a version check,
 * delete, and look up grammar points and words to link a node to
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { mindMaps, vocabItems } from '../db/schema.js';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { MAX_MAPS_PER_USER, DocError, blankDoc, checkDoc, clusterDoc, docSchema, wordLinks, type MapDoc } from '../maps/doc.js';

const idSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(100);

const createSchema = z.object({
  title: titleSchema.optional(),
  template: z.enum(['blank', 'cluster']).default('blank'),
  clusterId: z.string().max(60).optional(),
});

const updateSchema = z
  .object({ title: titleSchema.optional(), doc: docSchema.optional(), version: z.number().int().min(1) })
  .refine((body) => body.title !== undefined || body.doc !== undefined, { message: 'Nothing to save.' });

const lookupSchema = z.object({ q: z.string().trim().min(1).max(60) });

/** Lower case without Vietnamese accents, to match titles typed without them */
const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

const nodeCount = (doc: unknown): number => Object.keys((doc as MapDoc).nodes).length;

/**
 * Checks a document, including that linked words exist
 */
async function validateDoc(doc: MapDoc): Promise<void> {
  try {
    checkDoc(doc);
  } catch (error) {
    if (error instanceof DocError) throw new HttpError(400, error.message, 'invalid_map');
    throw error;
  }
  const words = wordLinks(doc);
  if (words.length > 0) {
    const [{ found }] = await db.select({ found: count() }).from(vocabItems).where(inArray(vocabItems.id, words));
    if (found !== words.length) throw new HttpError(400, 'A node links to a word that does not exist.', 'invalid_map');
  }
}

/**
 * Creates the mind map router
 * @returns Router mounted at /api
 */
export function createMapsRouter(): Router {
  const router = Router();

  /**
   * GET /maps - The learner's maps, most recently changed first
   */
  router.get('/maps', requireAuth, async (req, res) => {
    const rows = await db.select().from(mindMaps).where(eq(mindMaps.userId, currentUser(req).id)).orderBy(desc(mindMaps.updatedAt));
    res.json({ maps: rows.map((m) => ({ id: m.id, title: m.title, language: m.language, nodeCount: nodeCount(m.doc), version: m.version, updatedAt: m.updatedAt })), limit: MAX_MAPS_PER_USER });
  });

  /**
   * GET /maps/lookup?q= - Grammar points and words a node can link to
   */
  router.get('/maps/lookup', requireAuth, async (req, res) => {
    const { q } = lookupSchema.parse(req.query);
    const user = currentUser(req);
    const needle = fold(q);
    const grammar = GRAMMAR_POINTS.filter((p) => fold(p.title.en).includes(needle) || fold(p.title.vi).includes(needle) || p.id.includes(needle))
      .slice(0, 8)
      .map((p) => ({ id: p.id, title: p.title, cefr: p.cefr }));
    const words = await db
      .select({ id: vocabItems.id, term: vocabItems.term, level: vocabItems.level, meaning: vocabItems.meaningVi, meaningEn: vocabItems.meaningsEn })
      .from(vocabItems)
      .where(and(eq(vocabItems.language, user.studyLanguage), sql`lower(${vocabItems.term}) like ${`${q.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`}`))
      .orderBy(vocabItems.position)
      .limit(8);
    res.json({ grammar, words: words.map((w) => ({ id: w.id, term: w.term, level: w.level, meaning: w.meaning ?? w.meaningEn[0] ?? null })) });
  });

  /**
   * POST /maps - A blank map, or one started from a grammar topic
   */
  router.post('/maps', requireAuth, async (req, res) => {
    const body = createSchema.parse(req.body);
    const user = currentUser(req);

    const [{ owned }] = await db.select({ owned: count() }).from(mindMaps).where(eq(mindMaps.userId, user.id));
    if (owned >= MAX_MAPS_PER_USER) throw new HttpError(409, `You can keep up to ${MAX_MAPS_PER_USER} maps. Delete one to make room.`, 'map_limit');

    let title = body.title ?? (user.uiLocale === 'vi' ? 'Sơ đồ mới' : 'New map');
    let doc = blankDoc(title);
    if (body.template === 'cluster') {
      const started = body.clusterId ? clusterDoc(body.clusterId, user.uiLocale) : null;
      if (!started) throw new HttpError(400, 'Unknown grammar topic.', 'unknown_topic');
      title = body.title ?? started.title;
      doc = started.doc;
    }
    const [row] = await db.insert(mindMaps).values({ userId: user.id, language: user.studyLanguage, title, doc }).returning();
    res.status(201).json({ map: { id: row.id, title: row.title, language: row.language, doc: row.doc, version: row.version, updatedAt: row.updatedAt } });
  });

  /**
   * GET /maps/:id - One map with its document
   */
  router.get('/maps/:id', requireAuth, async (req, res) => {
    const [row] = await db
      .select()
      .from(mindMaps)
      .where(and(eq(mindMaps.id, idSchema.parse(req.params.id)), eq(mindMaps.userId, currentUser(req).id)))
      .limit(1);
    if (!row) throw new HttpError(404, 'Map not found.', 'not_found');
    res.json({ map: { id: row.id, title: row.title, language: row.language, doc: row.doc, version: row.version, updatedAt: row.updatedAt } });
  });

  /**
   * PUT /maps/:id - Save a title and/or document; `version` must be the one the client loaded
   * @throws {409} version_conflict when the map changed elsewhere
   */
  router.put('/maps/:id', requireAuth, async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const body = updateSchema.parse(req.body);
    const user = currentUser(req);
    if (body.doc) await validateDoc(body.doc);

    // The version check and the write are one statement, so two tabs cannot both win
    const [row] = await db
      .update(mindMaps)
      .set({ ...(body.title !== undefined && { title: body.title }), ...(body.doc && { doc: body.doc }), version: sql`${mindMaps.version} + 1`, updatedAt: new Date() })
      .where(and(eq(mindMaps.id, id), eq(mindMaps.userId, user.id), eq(mindMaps.version, body.version)))
      .returning({ version: mindMaps.version, updatedAt: mindMaps.updatedAt });
    if (row) {
      res.json(row);
      return;
    }

    const [current] = await db.select({ version: mindMaps.version }).from(mindMaps).where(and(eq(mindMaps.id, id), eq(mindMaps.userId, user.id))).limit(1);
    if (!current) throw new HttpError(404, 'Map not found.', 'not_found');
    res.status(409).json({ error: 'This map was changed somewhere else.', statusCode: 409, code: 'version_conflict', version: current.version });
  });

  /**
   * DELETE /maps/:id
   */
  router.delete('/maps/:id', requireAuth, async (req, res) => {
    const [row] = await db
      .delete(mindMaps)
      .where(and(eq(mindMaps.id, idSchema.parse(req.params.id)), eq(mindMaps.userId, currentUser(req).id)))
      .returning({ id: mindMaps.id });
    if (!row) throw new HttpError(404, 'Map not found.', 'not_found');
    res.status(204).end();
  });

  return router;
}
