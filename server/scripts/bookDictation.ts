/**
 * Builds dictation passages from the listening transcripts already in the database, in the database only: the
 * Cambridge IELTS tests (B1 to C1) and, for A2 and B1, the listening sections the app already holds (written by the AI;
 * Get Ready's recordings come without a transcript). Code cuts runs of clean sentences out of each script and sorts them
 * by level (the source and the length of its sentences); the AI then only repairs what the OCR broke (sentences glued
 * together, a missing full stop) and writes numbers as words, never rewording a passage.
 *
 *   npm run book:dictation
 */
import '../config.js';
import { asc, eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { closeDb, db } from '../db/client.js';
import { contentItems, users } from '../db/schema.js';
import { dictationPassage } from '../content/schemas.js';
import { runAIJson, SCORING_MAX_TOKENS } from '../services/ai.js';

type Level = 'A2' | 'B1' | 'B2' | 'C1';

const SENTENCES_PER_PASSAGE = 6;
const PASSAGES_PER_SECTION = 3;
/** Sections the AI wrote: fewer passages each, and only so many sections, so that the bank stays varied */
const PASSAGES_PER_AI_SECTION = 2;
const AI_SECTIONS_PER_LEVEL = 30;

interface Source {
  id: string;
  origin: 'imported' | 'ai';
  level: string | null;
  section: number;
  title: string;
  lines: string[];
}

/** Whole sentences of one script line that are fit to be dictated (the AI still repairs run-ons and writes numbers as words) */
function cleanSentences(line: string, minWords: number, digits: boolean): (string | null)[] {
  return line
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => {
      const words = sentence.split(' ').length;
      const fine =
        words >= minWords &&
        words <= 24 &&
        /^[A-Z]/.test(sentence) &&
        /[.?!]$/.test(sentence) &&
        // Not an address, a phone number, a spelled name or a half-finished thought
        !/\d{3,}|\.{2,}|[[\]_|=]|\b[A-Z]-[A-Z]\b/.test(sentence) &&
        !/\(|\)/.test(sentence) &&
        // Get Ready's dialogues are full of dates, prices and numbers; those sentences are left out there
        (digits || !/\d/.test(sentence));
      return fine ? sentence : null;
    });
}

/**
 * Passages of consecutive sentences. Get Ready's short question-and-answer lines are taken five at a time, skipping a
 * line that does not fit; a Cambridge talk needs six clean sentences in a row.
 */
function passagesOf(source: Source): string[][] {
  const easy = source.level === 'A2';
  const size = easy ? 5 : SENTENCES_PER_PASSAGE;
  const runs: string[][] = [];
  let run: string[] = [];
  const close = () => {
    if (run.length >= size) runs.push(run);
    run = [];
  };
  for (const line of source.lines) {
    for (const sentence of cleanSentences(line, easy ? 4 : 5, !easy)) {
      if (sentence) run.push(sentence);
      else if (!easy) close();
    }
  }
  close();
  const passages = runs.flatMap((r) => Array.from({ length: Math.floor(r.length / size) }, (_, i) => r.slice(i * size, (i + 1) * size)));
  return passages.slice(0, source.origin === 'imported' ? PASSAGES_PER_SECTION : PASSAGES_PER_AI_SECTION);
}

/** Level from the source book and how long the sentences are */
function levelOf(source: Source, sentences: string[]): Level {
  const average = sentences.reduce((n, s) => n + s.split(' ').length, 0) / sentences.length;
  if (source.level === 'A2') return average <= 9 ? 'A2' : 'B1';
  if (average <= 12) return 'B1';
  return average <= 15.5 ? 'B2' : 'C1';
}

const fixed = z.object({ passages: z.array(z.object({ title: z.string().trim().min(3).max(120), sentences: z.array(z.string().trim().min(5).max(300)).min(4).max(10) })) });

async function main(): Promise<void> {
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error('No admin account to ask the AI with.');
  // --ai: only the sections the app holds itself, to add them without writing the book passages again
  const aiOnly = process.argv.includes('--ai');
  const all = await db.select().from(contentItems).where(and(eq(contentItems.kind, 'ielts-listening'), inArray(contentItems.source, ['imported', 'ai', 'builtin'])));
  const taken: Record<string, number> = {};
  const rows = all
    .filter((row) => ((row.payload as { script?: unknown[] }).script?.length ?? 0) >= 10)
    .filter((row) => {
      if (row.source === 'imported') return !aiOnly;
      if (row.level !== 'A2' && row.level !== 'B1') return false;
      taken[row.level] = (taken[row.level] ?? 0) + 1;
      return taken[row.level] <= AI_SECTIONS_PER_LEVEL;
    });
  const found: { id: string; source: Source; sentences: string[]; level: Level }[] = [];
  for (const row of rows) {
    const payload = row.payload as { section: number; title: string; script: { text: string }[] };
    const source: Source = { id: row.id, origin: row.source === 'imported' ? 'imported' : 'ai', level: row.level, section: payload.section, title: payload.title, lines: payload.script.map((l) => l.text) };
    const cut = passagesOf(source);
    cut.forEach((sentences, index) => found.push({ id: `${source.origin === 'imported' ? 'book' : 'ai'}-dict-${row.id.replace(/^book-/, '')}-${index + 1}`, source, sentences, level: levelOf(source, sentences) }));
  }
  if (process.argv.includes('--dry')) {
    await closeDb();
    return;
  }
  console.log(`${found.length} passages cut from ${rows.length} sections`);

  let stored = 0;
  const counts: Record<string, number> = {};
  for (let i = 0; i < found.length; i += 6) {
    const chunk = found.slice(i, i + 6);
    const out = await runAIJson(
      admin,
      {
        feature: 'book-dictation',
        timeoutMs: 240_000,
        maxTokens: SCORING_MAX_TOKENS,
        system: `You prepare English dictation passages from the OCR of listening transcripts. For each passage, in order, return "sentences": the same sentences with only these repairs: fix an OCR slip (a wrong or missing letter, a stray character), add a missing full stop or split two sentences that ran together, write every number and time as words (e.g. "twelve", "half past seven"), and remove a sentence that makes no sense on its own (keep at least 4). Do not reword, add or reorder anything else. Add a short "title" (3 to 6 words) that names what the passage is about. Answer ONLY with JSON: {"passages":[{"title":"...","sentences":["..."]}]} with one entry per input passage, in order.`,
        messages: [{ role: 'user', content: JSON.stringify(chunk.map((c) => c.sentences)) }],
      },
      fixed
    ).catch((error) => {
      console.warn(`chunk ${i / 6 + 1} skipped: ${error instanceof Error ? error.message : error}`);
      return null;
    });
    if (!out || out.passages.length !== chunk.length) continue;
    for (const [index, passage] of out.passages.entries()) {
      const parsed = dictationPassage.safeParse(passage);
      if (!parsed.success) continue;
      const item = chunk[index];
      await db
        .insert(contentItems)
        .values({ id: item.id, kind: 'dictation', skill: 'listening', exam: 'none', language: 'en', part: item.source.origin === 'imported' ? 'book:dictation' : 'ai:dictation', level: item.level, title: parsed.data.title, topic: item.source.title, payload: parsed.data, source: item.source.origin === 'imported' ? 'imported' : 'ai', status: item.source.origin === 'imported' ? 'archived' : 'published' })
        .onConflictDoUpdate({ target: contentItems.id, set: { title: parsed.data.title, topic: item.source.title, level: item.level, payload: parsed.data } });
      stored++;
      counts[item.level] = (counts[item.level] ?? 0) + 1;
    }
    console.log(`chunk ${i / 6 + 1}/${Math.ceil(found.length / 6)} done`);
  }
  console.log(`stored ${stored}`, counts);
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
