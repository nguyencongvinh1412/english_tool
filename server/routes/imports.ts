/**
 * Import Routes (admin)
 * Upload a test book -> mark page ranges -> AI parse in the background ->
 * review and fix the draft -> publish as an official-style test
 */
import { Router } from 'express';
import { z } from 'zod';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems, importJobs, mediaAssets, type ImportJob } from '../db/schema.js';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { removeFile } from '../services/storage.js';
import { extractPages, type ExtractedPage } from '../imports/extract.js';
import { coverage, withIssues, type Draft } from '../imports/draft.js';
import { publishImport, runParse } from '../imports/jobs.js';
import { withJlptIssues, type JlptDraft } from '../imports/jlptDraft.js';
import { MONDAI } from '../exams/jlpt.js';
import { JLPT_LEVELS } from '../content/schemas.js';

/** Characters of each page's text sent to the review screen */
const PAGE_PREVIEW_CHARS = 4000;
const MAX_DRAFT_GROUPS = 200;

const pageRange = z
  .tuple([z.number().int().min(1), z.number().int().min(1)])
  .refine(([from, to]) => from <= to, 'The first page must not be after the last page');

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    documentAssetId: z.uuid(),
    exam: z.enum(['toeic', 'jlpt']).default('toeic'),
    level: z.enum(JLPT_LEVELS).optional(),
  })
  .refine((body) => body.exam !== 'jlpt' || body.level, { message: 'level is required for JLPT', path: ['level'] });

const pageImagesSchema = z.object({
  images: z.array(z.object({ n: z.number().int().min(1), assetId: z.uuid() })).min(1).max(400),
});

const parseSchema = z.object({
  ranges: z.object({ questions: pageRange, answers: pageRange.optional(), transcripts: pageRange.optional() }),
});

const draftSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  draft: z.object({
    groups: z
      .array(
        z.object({
          key: z.string().max(20),
          /** TOEIC groups have a part, JLPT groups a question type */
          part: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]).optional(),
          mondai: z.enum(MONDAI).optional(),
          numbers: z.tuple([z.number().int(), z.number().int()]),
          payload: z.record(z.string(), z.unknown()),
          photoPages: z.record(z.string(), z.number().int()).optional(),
        })
      )
      .max(MAX_DRAFT_GROUPS),
    recordings: z.array(z.object({ assetId: z.uuid(), name: z.string().max(200) })).max(20).optional(),
  }),
});

/**
 * Loads a job or throws 404
 */
async function findJob(id: string): Promise<ImportJob> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new HttpError(404, 'Import not found.', 'not_found');
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, parsed.data)).limit(1);
  if (!job) throw new HttpError(404, 'Import not found.', 'not_found');
  return job;
}

/**
 * Summary row for the imports list
 */
function toSummary(job: ImportJob) {
  const draft = job.draft as Draft | JlptDraft | null;
  return {
    id: job.id,
    title: job.title,
    exam: job.exam,
    level: job.level,
    status: job.status,
    progress: job.progress,
    error: job.error,
    pageCount: (job.pages as ExtractedPage[]).length,
    groupCount: draft?.groups.length ?? 0,
    errorCount: draft?.groups.filter((g) => g.issues.some((i) => i.level === 'error')).length ?? 0,
    createdAt: job.createdAt,
    publishedAt: job.publishedAt,
  };
}

/**
 * Full job for the review screen
 */
async function toDetail(job: ImportJob) {
  const draft = job.draft as Draft | JlptDraft | null;
  const [document] = job.documentAssetId
    ? await db.select({ mime: mediaAssets.mime }).from(mediaAssets).where(eq(mediaAssets.id, job.documentAssetId)).limit(1)
    : [];
  return {
    ...toSummary(job),
    ranges: job.ranges,
    documentUrl: job.documentAssetId ? `/api/media/${job.documentAssetId}` : null,
    /** PDFs can be rendered in the browser; DOCX pages are text only */
    isPdf: document?.mime === 'application/pdf',
    pages: (job.pages as ExtractedPage[]).map((p) => ({
      n: p.n,
      text: p.text.slice(0, PAGE_PREVIEW_CHARS),
      imageUrl: p.imageAssetId ? `/api/media/${p.imageAssetId}` : null,
    })),
    draft,
    coverage: draft && job.exam === 'toeic' ? coverage(draft as Draft) : [],
  };
}

/**
 * Checks that a range lies within the document
 */
function assertRange(range: [number, number] | undefined, pageCount: number, label: string): void {
  if (range && range[1] > pageCount) throw new HttpError(400, `The ${label} pages go past the last page (${pageCount}).`, 'bad_range');
}

/**
 * Creates the import router
 * @returns Router mounted at /api/admin/imports
 */
export function createImportRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  /**
   * GET / - All imports, newest first
   */
  router.get('/', async (_req, res) => {
    const jobs = await db.select().from(importJobs).orderBy(desc(importJobs.createdAt));
    res.json({ imports: jobs.map(toSummary) });
  });

  /**
   * POST / - Create an import from an uploaded PDF/DOCX and extract its pages
   */
  router.post('/', async (req, res) => {
    const body = createSchema.parse(req.body);
    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, body.documentAssetId)).limit(1);
    if (!asset || asset.kind !== 'document') throw new HttpError(400, 'Upload a PDF or DOCX first.', 'missing_document');

    const pages = await extractPages(asset);
    const [job] = await db
      .insert(importJobs)
      .values({ exam: body.exam, level: body.exam === 'jlpt' ? body.level : null, title: body.title, documentAssetId: asset.id, pages, uploadedBy: currentUser(req).id })
      .returning();
    res.status(201).json({ import: await toDetail(job) });
  });

  /**
   * GET /:id - Import with pages and draft
   */
  router.get('/:id', async (req, res) => {
    res.json({ import: await toDetail(await findJob(req.params.id)) });
  });

  /**
   * PUT /:id/page-images - Attach page images rendered in the admin's browser (used for OCR and cropping)
   */
  router.put('/:id/page-images', async (req, res) => {
    const job = await findJob(req.params.id);
    const body = pageImagesSchema.parse(req.body);
    if (job.status === 'parsing') throw new HttpError(409, 'Wait until parsing finishes.', 'busy');

    const ids = body.images.map((i) => i.assetId);
    const assets = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind }).from(mediaAssets).where(inArray(mediaAssets.id, ids));
    if (assets.length !== new Set(ids).size || assets.some((a) => a.kind !== 'image')) {
      throw new HttpError(400, 'Some page images were not found.', 'missing_asset');
    }

    const byPage = new Map(body.images.map((i) => [i.n, i.assetId]));
    const pages = (job.pages as ExtractedPage[]).map((p) => (byPage.has(p.n) ? { ...p, imageAssetId: byPage.get(p.n) } : p));
    const [updated] = await db.update(importJobs).set({ pages, updatedAt: new Date() }).where(eq(importJobs.id, job.id)).returning();
    res.json({ import: await toDetail(updated) });
  });

  /**
   * POST /:id/parse - Start AI parsing of the marked pages (runs in the background; poll GET /:id)
   */
  router.post('/:id/parse', async (req, res) => {
    const job = await findJob(req.params.id);
    const { ranges } = parseSchema.parse(req.body);
    if (job.status === 'parsing') throw new HttpError(409, 'Parsing is already running.', 'busy');

    const pageCount = (job.pages as ExtractedPage[]).length;
    assertRange(ranges.questions, pageCount, 'question');
    assertRange(ranges.answers, pageCount, 'answer key');
    assertRange(ranges.transcripts, pageCount, 'transcript');

    const [updated] = await db
      .update(importJobs)
      .set({ status: 'parsing', ranges, error: null, progress: { step: 'starting', done: 0, total: 1 }, updatedAt: new Date() })
      .where(eq(importJobs.id, job.id))
      .returning();
    void runParse(updated, currentUser(req));
    res.status(202).json({ import: await toDetail(updated) });
  });

  /**
   * PUT /:id/draft - Save the admin's edits; issues are recomputed on the server
   */
  router.put('/:id/draft', async (req, res) => {
    const job = await findJob(req.params.id);
    const body = draftSchema.parse(req.body);
    if (job.status === 'parsing') throw new HttpError(409, 'Wait until parsing finishes.', 'busy');
    if (!job.draft) throw new HttpError(409, 'This import has not been parsed yet.', 'not_parsed');

    const groups = body.draft.groups.map((g) => ({ ...g, issues: [] }));
    if (groups.some((g) => (job.exam === 'jlpt' ? !g.mondai : !g.part))) throw new HttpError(400, 'Every group needs its part or question type.', 'bad_draft');
    const draft =
      job.exam === 'jlpt'
        ? withJlptIssues({ ...body.draft, groups: groups as JlptDraft['groups'] })
        : withIssues({ ...body.draft, groups: groups as Draft['groups'] });
    const [updated] = await db
      .update(importJobs)
      .set({
        draft,
        ...(body.title && { title: body.title }),
        // Edits after publishing take effect on the next publish
        status: job.status === 'published' ? 'published' : 'review',
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))
      .returning();
    res.json({ import: await toDetail(updated) });
  });

  /**
   * POST /:id/publish - Publish the draft as an official-style test
   */
  router.post('/:id/publish', async (req, res) => {
    const job = await findJob(req.params.id);
    if (job.status === 'parsing') throw new HttpError(409, 'Wait until parsing finishes.', 'busy');
    const groups = await publishImport(job, currentUser(req));
    res.json({ import: await toDetail(await findJob(job.id)), groups });
  });

  /**
   * DELETE /:id - Remove an import; published groups are archived so past sessions keep working
   */
  router.delete('/:id', async (req, res) => {
    const job = await findJob(req.params.id);
    if (job.status === 'parsing') throw new HttpError(409, 'Wait until parsing finishes.', 'busy');

    // The source document and page renders are only needed for the import itself
    const ownAssets = [job.documentAssetId, ...(job.pages as ExtractedPage[]).map((p) => p.imageAssetId)].filter((id): id is string => Boolean(id));
    const assets = ownAssets.length ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, ownAssets)) : [];

    await db.transaction(async (tx) => {
      await tx.update(contentItems).set({ status: 'archived' }).where(eq(contentItems.importId, job.id));
      await tx.delete(importJobs).where(eq(importJobs.id, job.id));
      if (assets.length) await tx.delete(mediaAssets).where(inArray(mediaAssets.id, assets.map((a) => a.id)));
    });
    await Promise.all(assets.map((a) => removeFile(a.storageKey)));
    res.status(204).end();
  });

  return router;
}
