/**
 * AI parsing of an imported TOEIC test
 * 1. OCR pages without a text layer, 2. extract question groups chunk by chunk,
 * 3. read the answer key, 4. read listening transcripts. Merging happens in draft.ts.
 */
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { mediaAssets, type User } from '../db/schema.js';
import { GENERATE_TIMEOUT_MS, runAI, runAIJson } from '../services/ai.js';
import { readObject } from '../services/storage.js';
import type { ExtractedPage } from './extract.js';

/** Inclusive page range */
export type PageRange = [number, number];

export interface ImportRanges {
  questions?: PageRange;
  answers?: PageRange;
  transcripts?: PageRange;
}

/** Pages with fewer characters than this are treated as scanned and OCR'd */
const MIN_TEXT_CHARS = 40;
/** Pages per question-extraction call; consecutive chunks overlap by one page */
const PAGES_PER_CHUNK = 4;
const PARSE_TIMEOUT_MS = 120_000;

/* ---------- Lenient shapes returned by the AI (tightened when merging) ---------- */

const rawQuestion = z.object({
  number: z.number().int().min(1).max(200),
  prompt: z.string().default(''),
  options: z.array(z.string()).default([]),
});

const photoPage = z.object({ number: z.number().int(), page: z.number().int() });

export const rawGroup = z
  .object({
    part: z.number().int().min(1).max(7),
    numbers: z.tuple([z.number().int(), z.number().int()]),
    title: z.string().optional(),
    passage: z.string().optional(),
    passages: z.array(z.object({ kind: z.string().default('text'), title: z.string().default(''), text: z.string() })).optional(),
    questions: z.array(rawQuestion).default([]),
    /** Part 1: which page shows the photo for each question; models also send [page, ...] or {"1": page} */
    photoPages: z.union([z.array(photoPage), z.array(z.number().int()), z.record(z.string(), z.number().int())]).optional(),
  })
  .transform((group) => {
    const pages = group.photoPages;
    let photoPages: z.infer<typeof photoPage>[] | undefined;
    if (Array.isArray(pages)) {
      photoPages = pages.map((entry, i) => (typeof entry === 'number' ? { number: group.numbers[0] + i, page: entry } : entry));
    } else if (pages) {
      photoPages = Object.entries(pages).map(([number, page]) => ({ number: Number(number), page }));
    }
    return { ...group, photoPages };
  });
export type RawGroup = z.infer<typeof rawGroup>;

const groupsReply = z.object({ groups: z.array(rawGroup).default([]) });

const answersReply = z.object({ answers: z.record(z.string(), z.string()) });

export const rawTranscript = z.object({
  part: z.number().int().min(1).max(4),
  numbers: z.tuple([z.number().int(), z.number().int()]),
  /** Parts 3-4 */
  lines: z.array(z.object({ speaker: z.string().default('A'), text: z.string() })).optional(),
  /** Part 1: statements (A)-(D) of one question */
  statements: z.array(z.string()).optional(),
  /** Part 2: question and responses (A)-(C) */
  question: z.string().optional(),
  options: z.array(z.string()).optional(),
});
export type RawTranscript = z.infer<typeof rawTranscript>;

const transcriptsReply = z.object({ entries: z.array(rawTranscript).default([]) });

export interface ParsedTest {
  groups: RawGroup[];
  /** Question number -> letter */
  answers: Record<string, string>;
  transcripts: RawTranscript[];
}

type Progress = (step: string, done: number, total: number) => Promise<void>;

/**
 * Pages in an inclusive range
 */
function pagesIn(pages: ExtractedPage[], range: PageRange | undefined): ExtractedPage[] {
  if (!range) return pages;
  return pages.filter((p) => p.n >= range[0] && p.n <= range[1]);
}

/**
 * Text of pages with page markers, as the AI sees it
 */
function joinPages(pages: ExtractedPage[]): string {
  return pages.map((p) => `=== PAGE ${p.n} ===\n${p.text}`).join('\n\n');
}

/**
 * Transcribes pages without a usable text layer from their rendered images
 */
export async function ocrPages(user: User, pages: ExtractedPage[], onProgress: Progress): Promise<ExtractedPage[]> {
  const targets = pages.filter((p) => p.text.length < MIN_TEXT_CHARS && p.imageAssetId);
  if (targets.length === 0) return pages;

  const assets = await db
    .select()
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, targets.map((p) => p.imageAssetId!)));
  const byId = new Map(assets.map((a) => [a.id, a]));
  const result = new Map(pages.map((p) => [p.n, p]));

  let done = 0;
  for (const page of targets) {
    await onProgress('ocr', done, targets.length);
    const asset = byId.get(page.imageAssetId!);
    if (asset) {
      const image = await readObject(asset.storageKey);
      const text = await runAI(user, {
        feature: 'import-ocr',
        timeoutMs: GENERATE_TIMEOUT_MS,
        system: 'You transcribe scanned English test pages. Output only the page text, keeping question numbers, options (A)-(D) and line breaks. Mark photos as [PHOTO].',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `Transcribe page ${page.n}.` },
              { type: 'image_url', image_url: { url: `data:${asset.mime};base64,${image.toString('base64')}` } },
            ],
          },
        ],
      });
      result.set(page.n, { ...page, text: text.trim() });
    }
    done++;
  }
  await onProgress('ocr', done, targets.length);
  return [...result.values()].sort((a, b) => a.n - b.n);
}

const QUESTION_RULES = `You extract TOEIC Listening & Reading questions from book pages into JSON. Do NOT answer them.
Use the official numbering (Part 1: 1-6, Part 2: 7-31, Part 3: 32-70, Part 4: 71-100, Part 5: 101-130, Part 6: 131-146, Part 7: 147-200).
Rules per part:
- Part 1: one group for all Part 1 numbers with "photoPages" = the page that shows each question's photo, e.g. {"part": 1, "numbers": [1, 6], "photoPages": [{"number": 1, "page": 3}, {"number": 2, "page": 3}]}. No questions array.
- Part 2: one group with "numbers" only (the questions are spoken). No questions array.
- Parts 3 and 4: one group per conversation/talk (usually 3 questions), with printed questions and options (A)-(D). Graphics: describe them in "passage".
- Part 5: one group per page; each prompt is the sentence with the blank written as "____".
- Part 6: one group per text; copy the text into "passage" replacing each numbered blank with [1], [2], [3], [4] in order; each question's prompt is "Blank [n]".
- Part 7: one group per set; copy every text into "passages" (kind: email, article, notice, form, chat, advertisement, ...).
- Options are the text after (A), (B), (C), (D) without the letters. Copy text exactly; fix only obvious OCR errors.
- Skip directions, examples and page headers. Include a group only if you can see its questions on these pages.
Respond with ONLY: {"groups": [{"part": 5, "numbers": [101, 110], "questions": [{"number": 101, "prompt": "...", "options": ["...","...","...","..."]}]}, ...]}`;

/**
 * Extracts question groups from the question pages, chunk by chunk
 */
async function extractGroups(user: User, pages: ExtractedPage[], onProgress: Progress): Promise<RawGroup[]> {
  const chunks: ExtractedPage[][] = [];
  for (let start = 0; start < pages.length; start += PAGES_PER_CHUNK - 1) {
    chunks.push(pages.slice(start, start + PAGES_PER_CHUNK));
    if (start + PAGES_PER_CHUNK >= pages.length) break;
  }

  const groups: RawGroup[] = [];
  for (let i = 0; i < chunks.length; i++) {
    await onProgress('questions', i, chunks.length);
    const reply = await runAIJson(
      user,
      {
        feature: 'import-parse',
        timeoutMs: PARSE_TIMEOUT_MS,
        system: QUESTION_RULES,
        messages: [{ role: 'user', content: joinPages(chunks[i]) }],
      },
      groupsReply
    );
    groups.push(...reply.groups);
  }
  await onProgress('questions', chunks.length, chunks.length);
  return groups;
}

/**
 * Reads the answer key pages into number -> letter
 */
async function extractAnswers(user: User, pages: ExtractedPage[]): Promise<Record<string, string>> {
  if (pages.length === 0) return {};
  const reply = await runAIJson(
    user,
    {
      feature: 'import-parse',
      timeoutMs: PARSE_TIMEOUT_MS,
      system: `You read TOEIC answer keys. Return every question number with its answer letter (A, B, C or D).
If the pages contain several tests, use only the first one. Respond with ONLY: {"answers": {"1": "B", "2": "D", ...}}`,
      messages: [{ role: 'user', content: joinPages(pages) }],
    },
    answersReply
  );
  return Object.fromEntries(
    Object.entries(reply.answers)
      .map(([n, letter]) => [n.replace(/\D/g, ''), letter.trim().toUpperCase().replace(/[^A-D]/g, '')] as const)
      .filter(([n, letter]) => n && letter.length === 1)
  );
}

/**
 * Reads listening transcripts (Parts 1-4)
 */
async function extractTranscripts(user: User, pages: ExtractedPage[], onProgress: Progress): Promise<RawTranscript[]> {
  const entries: RawTranscript[] = [];
  for (let start = 0; start < pages.length; start += PAGES_PER_CHUNK) {
    await onProgress('transcripts', start, pages.length);
    const reply = await runAIJson(
      user,
      {
        feature: 'import-parse',
        timeoutMs: PARSE_TIMEOUT_MS,
        system: `You extract TOEIC listening transcripts (audio scripts) into JSON.
- Part 1: one entry per question with "statements" = the four statements (A)-(D) without letters.
- Part 2: one entry per question with "question" and "options" = the three responses (A)-(C) without letters.
- Parts 3 and 4: one entry per conversation/talk with "numbers" = its question numbers and "lines" = [{"speaker": "M" | "W" | name, "text": "..."}].
Respond with ONLY: {"entries": [{"part": 2, "numbers": [7, 7], "question": "...", "options": ["...","...","..."]}, ...]}`,
        messages: [{ role: 'user', content: joinPages(pages.slice(start, start + PAGES_PER_CHUNK)) }],
      },
      transcriptsReply
    );
    entries.push(...reply.entries);
  }
  await onProgress('transcripts', pages.length, pages.length);
  return entries;
}

/**
 * Runs all AI steps over the marked page ranges
 */
export async function parseTest(user: User, allPages: ExtractedPage[], ranges: ImportRanges, onProgress: Progress): Promise<{ pages: ExtractedPage[]; parsed: ParsedTest }> {
  const pages = await ocrPages(user, allPages, onProgress);
  const groups = await extractGroups(user, pagesIn(pages, ranges.questions), onProgress);
  await onProgress('answers', 0, 1);
  const answers = ranges.answers ? await extractAnswers(user, pagesIn(pages, ranges.answers)) : {};
  const transcripts = ranges.transcripts ? await extractTranscripts(user, pagesIn(pages, ranges.transcripts), onProgress) : [];
  return { pages, parsed: { groups, answers, transcripts } };
}

