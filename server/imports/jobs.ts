/**
 * Import Jobs
 * Background parsing, restart recovery and publishing of imported tests
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems, importJobs, mediaAssets, type ImportJob, type User } from '../db/schema.js';
import { contentTitle } from '../content/schemas.js';
import { PART_CONFIG } from '../exams/toeic.js';
import { HttpError } from '../http/errors.js';
import { buildDraft, finalizePayload, withIssues, type Draft } from './draft.js';
import { parseTest, type ImportRanges } from './parse.js';
import type { ExtractedPage } from './extract.js';
import { parseJlptTest } from './jlptParse.js';
import { buildJlptDraft, finalizeJlptPayload, withJlptIssues, type JlptDraft } from './jlptDraft.js';
import { MONDAI_JA, MONDAI_SECTION, kindOf, partTag } from '../exams/jlpt.js';
import type { JlptLevel } from '../content/schemas.js';

/**
 * Parses a job in the background; progress and the outcome are written to the row
 * (the caller does not await this)
 */
export async function runParse(job: ImportJob, user: User): Promise<void> {
  const save = (fields: Partial<typeof importJobs.$inferInsert>) =>
    db.update(importJobs).set({ ...fields, updatedAt: new Date() }).where(eq(importJobs.id, job.id));

  try {
    const onProgress = (step: string, done: number, total: number) => save({ progress: { step, done, total } }).then(() => undefined);
    let pages: ExtractedPage[];
    let draft: Draft | JlptDraft;
    if (job.exam === 'jlpt') {
      const result = await parseJlptTest(user, (job.level ?? 'N3') as JlptLevel, job.pages as ExtractedPage[], job.ranges as ImportRanges, onProgress);
      pages = result.pages;
      draft = buildJlptDraft(result.parsed);
    } else {
      const result = await parseTest(user, job.pages as ExtractedPage[], job.ranges as ImportRanges, onProgress);
      pages = result.pages;
      draft = buildDraft(result.parsed);
    }
    if (draft.groups.length === 0) throw new HttpError(422, 'No questions were found in the marked pages.', 'nothing_found');
    await save({ status: 'review', pages, draft, progress: null, error: null });
  } catch (error) {
    console.error(`Import ${job.id} failed:`, error);
    const message = error instanceof HttpError ? error.message : 'Parsing failed. Check the page ranges and try again.';
    await save({ status: 'failed', progress: null, error: message });
  }
}

/**
 * Marks jobs that were parsing when the server stopped as failed, so they can be retried
 */
export async function recoverInterruptedImports(): Promise<void> {
  await db
    .update(importJobs)
    .set({ status: 'failed', progress: null, error: 'Parsing was interrupted by a server restart. Start it again.', updatedAt: new Date() })
    .where(eq(importJobs.status, 'parsing'));
}

/**
 * Media referenced by a draft (Part 1 photos, recordings)
 */
function referencedAssets(draft: Draft | JlptDraft): { images: string[]; audio: string[] } {
  const images: string[] = [];
  const audio: string[] = [];
  for (const group of draft.groups) {
    const payload = group.payload as { items?: { imageAssetId?: unknown }[]; questions?: { imageAssetId?: unknown }[]; passages?: { imageAssetId?: unknown }[]; audio?: { assetId?: unknown } };
    for (const item of [...(payload.items ?? []), ...(payload.questions ?? []), ...(payload.passages ?? [])]) {
      if (typeof item.imageAssetId === 'string') images.push(item.imageAssetId);
    }
    if (typeof payload.audio?.assetId === 'string') audio.push(payload.audio.assetId);
  }
  return { images, audio };
}

/**
 * Checks that every referenced asset exists with the right kind
 * @throws HttpError 400 naming the first bad reference
 */
async function assertAssets(draft: Draft | JlptDraft): Promise<void> {
  const { images, audio } = referencedAssets(draft);
  const ids = [...new Set([...images, ...audio])];
  if (ids.length === 0) return;
  const rows = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind }).from(mediaAssets).where(inArray(mediaAssets.id, ids));
  const kinds = new Map(rows.map((r) => [r.id, r.kind]));
  if (images.some((id) => kinds.get(id) !== 'image')) throw new HttpError(400, 'A picture is missing. Crop it again.', 'missing_asset');
  if (audio.some((id) => kinds.get(id) !== 'audio')) throw new HttpError(400, 'An attached recording is missing. Attach it again.', 'missing_asset');
}

/**
 * Turns a reviewed draft into published exam groups. Re-publishing archives the previous
 * groups, so sessions already taken keep their questions.
 * @returns Number of groups published
 * @throws HttpError 400 when the draft still has errors
 */
export async function publishImport(job: ImportJob, user: User): Promise<number> {
  if (!job.draft) throw new HttpError(409, 'This import has not been parsed yet.', 'not_parsed');
  if (job.exam === 'jlpt') return publishJlptImport(job, user);
  const draft = withIssues(job.draft as Draft);

  const blocked = draft.groups.filter((g) => g.issues.some((i) => i.level === 'error'));
  if (blocked.length > 0) {
    const first = blocked[0];
    throw new HttpError(
      400,
      `${blocked.length} group(s) still have problems, e.g. Part ${first.part} (${first.numbers[0]}-${first.numbers[1]}): ${first.issues.find((i) => i.level === 'error')!.message}`,
      'draft_has_errors'
    );
  }

  const payloads = draft.groups.map((group) => ({ group, result: finalizePayload(group) }));
  const invalid = payloads.find((p) => !p.result.ok);
  if (invalid && !invalid.result.ok) throw new HttpError(400, invalid.result.problem, 'draft_invalid');
  await assertAssets(draft);

  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ status: 'archived' })
      .where(and(eq(contentItems.importId, job.id), eq(contentItems.status, 'published')));

    await tx.insert(contentItems).values(
      payloads.map(({ group, result }, index) => {
        const kind = PART_CONFIG[group.part].kind;
        // The book's numbering, so learners see the same question numbers as in the book
        const payload = { ...(result as { payload: object }).payload, startNumber: group.numbers[0] };
        return {
          kind,
          skill: PART_CONFIG[group.part].section,
          exam: 'toeic' as const,
          part: `toeic-${group.part}`,
          title: `${job.title} · ${contentTitle(kind, payload)} (${group.numbers[0]}-${group.numbers[1]})`.slice(0, 200),
          payload,
          source: 'imported' as const,
          createdBy: user.id,
          importId: job.id,
          importOrder: index,
        };
      })
    );

    await tx
      .update(importJobs)
      .set({ status: 'published', draft, publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(importJobs.id, job.id));
  });

  return draft.groups.length;
}

/**
 * Publishes a reviewed JLPT draft as an official-style test (same rules as TOEIC)
 */
async function publishJlptImport(job: ImportJob, user: User): Promise<number> {
  const draft = withJlptIssues(job.draft as JlptDraft);
  const blocked = draft.groups.filter((g) => g.issues.some((i) => i.level === 'error'));
  if (blocked.length > 0) {
    const first = blocked[0];
    throw new HttpError(
      400,
      `${blocked.length} group(s) still have problems, e.g. ${MONDAI_JA[first.mondai]} (${first.numbers[0]}-${first.numbers[1]}): ${first.issues.find((i) => i.level === 'error')!.message}`,
      'draft_has_errors'
    );
  }
  const payloads = draft.groups.map((group) => ({ group, result: finalizeJlptPayload(group) }));
  const invalid = payloads.find((p) => !p.result.ok);
  if (invalid && !invalid.result.ok) throw new HttpError(400, invalid.result.problem, 'draft_invalid');
  await assertAssets(draft);

  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ status: 'archived' })
      .where(and(eq(contentItems.importId, job.id), eq(contentItems.status, 'published')));
    await tx.insert(contentItems).values(
      payloads.map(({ group, result }, index) => ({
        kind: kindOf(group.mondai),
        skill: MONDAI_SECTION[group.mondai] === 'listening' ? ('listening' as const) : ('reading' as const),
        exam: 'jlpt' as const,
        language: 'ja' as const,
        part: partTag(group.mondai),
        level: job.level,
        title: `${job.title} · ${MONDAI_JA[group.mondai]} (${group.numbers[0]}-${group.numbers[1]})`.slice(0, 200),
        payload: (result as { payload: object }).payload,
        source: 'imported' as const,
        createdBy: user.id,
        importId: job.id,
        importOrder: index,
      }))
    );
    await tx
      .update(importJobs)
      .set({ status: 'published', draft, publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(importJobs.id, job.id));
  });
  return draft.groups.length;
}
