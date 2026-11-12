/**
 * Imports the topic word lists of a vocabulary book (Cambridge Vocabulary for IELTS: 20 topic units, each with a
 * wordlist at the back) into the English word decks `en-topic-<unit>`, in the database only (the book's words are
 * never committed). Per word: the headword from the book's wordlist, an example sentence found in the book's own
 * texts and exercises when there is one, and the definition and Vietnamese meaning from the app's own word data when
 * the word is already there, else written by the AI.
 *
 *   npm run book:topic-words            # needs docs/reference/ocr/cvi (scripts/book/ocr-book.sh) and its page images
 */
import '../config.js';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { closeDb, db } from '../db/client.js';
import { users, vocabItems } from '../db/schema.js';
import { runAIJson, SCORING_MAX_TOKENS } from '../services/ai.js';

const REF = path.resolve('docs/reference');
const BOOK = 'cvi';
const WORDLIST_PAGES = [170, 171, 172, 173, 174, 175];
const FIRST_TEXT_PAGE = 9;
const LAST_TEXT_PAGE = 169;
const POS = ['noun', 'verb', 'adjective', 'adverb', 'phrase'] as const;

interface Word {
  term: string;
  pos: (typeof POS)[number] | null;
}

/** The lines of the wordlist pages in reading order: four columns per page, top to bottom, left to right */
function wordlistLines(): string[] {
  const out: string[] = [];
  for (const page of WORDLIST_PAGES) {
    const raw = spawnSync(path.join(REF, 'visionocr'), ['--boxes', path.join(REF, 'pages', BOOK, `p-${String(page).padStart(3, '0')}.png`)], { encoding: 'utf8' }).stdout;
    const boxes = raw
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map((l) => l.split('\t'))
      .map((c) => ({ top: Number(c[0]), left: Number(c[1]), text: (c[4] ?? '').trim() }))
      .filter((b) => b.text !== '' && b.top > 0.06 && b.top < 0.95 && !/^Wordlist$/i.test(b.text) && !/^\d{1,3}$/.test(b.text));
    const column = (left: number) => (left < 0.2 ? 0 : left < 0.45 ? 1 : left < 0.7 ? 2 : 3);
    for (let c = 0; c < 4; c++) for (const b of boxes.filter((x) => column(x.left) === c).sort((a, b) => a.top - b.top)) out.push(b.text);
  }
  return out;
}

/** Raw wordlist lines of each unit (the "UNIT n" marker starts a unit; its caps title line is dropped) */
function unitsOf(lines: string[]): Map<number, string[]> {
  const units = new Map<number, string[]>();
  let current: string[] | null = null;
  for (const line of lines) {
    const m = line.match(/^\W?L?UNIT\s*(\d{1,2})\b/i);
    if (m) {
      current = [];
      units.set(Number(m[1]), current);
      continue;
    }
    if (current && !/^[A-Z][A-Z ,'&-]{3,}$/.test(line)) current.push(line);
  }
  return units;
}

const cleaned = z.object({ words: z.array(z.object({ term: z.string().trim().min(2).max(60), pos: z.enum(POS).nullable().default(null) })).min(5).max(150) });

/** Sentences of the book's texts and exercises that hold the word, from the OCR text of its pages (one column fragment = one candidate) */
function sentenceFinder(): (term: string) => string | null {
  const fragments: string[] = [];
  for (let page = FIRST_TEXT_PAGE; page <= LAST_TEXT_PAGE; page++) {
    const text = readFileSync(path.join(REF, 'ocr', BOOK, `p-${String(page).padStart(3, '0')}.txt`), 'utf8');
    for (const line of text.split('\n').slice(1)) for (const part of line.split(/\s{2,}/)) fragments.push(part.trim());
  }
  const sentences = fragments.filter((f) => /^[A-Z][^_]{20,200}[.?!]$/.test(f) && f.split(/\s+/).length >= 6 && f.split(/\s+/).length <= 28 && !/\.{3}|\(\d|^(Complete|Choose|Match|Read|Listen|Write|Look|Use|Tick|Underline|Circle)\b/.test(f));
  return (term) => {
    const stem = term.toLowerCase().replace(/\(.*?\)/g, '').trim().split(/\s+/)[0]?.replace(/[^a-z-]/g, '') ?? '';
    if (stem.length < 3 || term.includes(' ')) {
      // A phrase: the exact words
      const phrase = term.toLowerCase().replace(/\bsth\b|\bsb\b|\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
      return phrase.length >= 5 ? (sentences.find((s) => s.toLowerCase().includes(phrase)) ?? null) : null;
    }
    const rx = new RegExp(`\\b${stem.slice(0, Math.max(4, stem.length - 2))}[a-z]*\\b`, 'i');
    return sentences.find((s) => rx.test(s)) ?? null;
  };
}

const enrichReply = z.object({
  items: z.array(z.object({ term: z.string(), pos: z.enum(POS).nullable().default(null), def: z.string().trim().min(3).max(220), meaningVi: z.string().trim().min(1).max(160), example: z.string().trim().min(8).max(260), exampleVi: z.string().trim().min(3).max(300) })),
});

async function main(): Promise<void> {
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error('No admin account to ask the AI with.');
  const units = unitsOf(wordlistLines());
  if (process.argv.includes('--dry')) {
    for (const [n, lines] of [...units.entries()].sort((a, b) => a[0] - b[0])) console.log(`unit ${n}: ${lines.length} lines | ${lines.slice(0, 8).join(' / ')}`);
    await closeDb();
    return;
  }
  const findSentence = sentenceFinder();
  const audit: Record<string, unknown[]> = {};

  for (const unit of [...units.keys()].filter((n) => n >= 1 && n <= 20).sort((a, b) => a - b)) {
    const raw = units.get(unit)!;
    const reply = await runAIJson(
      admin,
      {
        feature: 'topic-words',
        timeoutMs: 180_000,
        system: `You clean the OCR of one unit of a vocabulary book's wordlist. The lines come from several columns (headings such as Nouns, Verbs, Adjectives, Adverbs, Phrases, Verb phrases and the IPA pronunciation, often garbled, are mixed in). Return the headwords and phrases of the unit, in the order of the lines: lower case unless a proper noun, no pronunciation, no part of speech heading, OCR slips fixed (do not invent words that are not in the lines). Keep a phrase whole ("have sth in common", "bear in mind"). "pos" is the heading the word is under (noun, verb, adjective, adverb) or phrase for phrases. Answer ONLY with JSON: {"words":[{"term":"...","pos":"noun"}]}.`,
        messages: [{ role: 'user', content: raw.join('\n') }],
      },
      cleaned
    );
    const seen = new Set<string>();
    const words: Word[] = reply.words.filter((w) => (seen.has(w.term.toLowerCase()) ? false : (seen.add(w.term.toLowerCase()), true)));

    // What the app already knows about each word
    const known = await db
      .select()
      .from(vocabItems)
      .where(inArray(vocabItems.id, words.map((w) => `en:${w.term.toLowerCase()}`)));
    const byTerm = new Map(known.map((k) => [k.term.toLowerCase(), k]));
    const bookExample = new Map(words.map((w) => [w.term, findSentence(w.term)]));

    // The AI writes what is missing: a definition and the Vietnamese meaning, and the Vietnamese of a book example
    const need = words.filter((w) => {
      const k = byTerm.get(w.term.toLowerCase());
      return !k || !k.meaningVi || !k.meaningsEn[0] || bookExample.get(w.term);
    });
    const written = new Map<string, z.infer<typeof enrichReply>['items'][number]>();
    for (let i = 0; i < need.length; i += 12) {
      const chunk = need.slice(i, i + 12);
      const out = await runAIJson(
        admin,
        {
          feature: 'topic-words',
          timeoutMs: 240_000,
          maxTokens: SCORING_MAX_TOKENS,
          system: `You write vocabulary cards for learners of IELTS at B1 to C1. For each word or phrase give: "pos" (noun, verb, adjective, adverb or phrase), "def" a short clear English definition in your own words, "meaningVi" the core Vietnamese meaning (short, comma separated), "example" an example sentence (use the given book sentence unchanged when there is one, else write a natural one with the word) and "exampleVi" its Vietnamese translation. Answer ONLY with JSON: {"items":[{"term":"...","pos":"noun","def":"...","meaningVi":"...","example":"...","exampleVi":"..."}]} with one item per input word, in order.`,
          messages: [{ role: 'user', content: JSON.stringify(chunk.map((w) => ({ term: w.term, pos: w.pos, bookSentence: bookExample.get(w.term) ?? undefined }))) }],
        },
        enrichReply
      );
      for (const item of out.items) written.set(item.term.toLowerCase(), item);
    }

    const rows = words.map((w, index) => {
      const k = byTerm.get(w.term.toLowerCase());
      const ai = written.get(w.term.toLowerCase());
      const sentence = bookExample.get(w.term) ?? null;
      const useAiExample = ai !== undefined && (sentence !== null || !k?.example);
      return {
        id: `en:t${unit}:${w.term.toLowerCase()}`,
        kind: 'word',
        language: 'en' as const,
        deck: `en-topic-${unit}`,
        level: k?.level ?? '',
        position: index + 1,
        term: w.term,
        pos: k?.pos ?? ai?.pos ?? w.pos,
        ipa: k?.ipa ?? null,
        meaningsEn: k?.meaningsEn[0] ? k.meaningsEn : ai ? [ai.def] : [],
        meaningVi: k?.meaningVi ?? ai?.meaningVi ?? null,
        example: useAiExample ? ai!.example : (k?.example ?? null),
        exampleVi: useAiExample ? ai!.exampleVi : (k?.exampleVi ?? null),
        collocations: k?.collocations ?? null,
      };
    });
    for (let i = 0; i < rows.length; i += 100) {
      await db
        .insert(vocabItems)
        .values(rows.slice(i, i + 100))
        .onConflictDoUpdate({
          target: vocabItems.id,
          set: { deck: sql`excluded.deck`, position: sql`excluded.position`, term: sql`excluded.term`, pos: sql`excluded.pos`, ipa: sql`excluded.ipa`, meaningsEn: sql`excluded.meanings_en`, meaningVi: sql`excluded.meaning_vi`, example: sql`excluded.example`, exampleVi: sql`excluded.example_vi`, level: sql`excluded.level`, updatedAt: sql`now()` },
        });
    }
    audit[String(unit)] = rows.map((r) => ({ term: r.term, pos: r.pos, def: r.meaningsEn[0], vi: r.meaningVi, example: r.example, fromBook: bookExample.get(r.term) !== null }));
    const withBook = [...bookExample.values()].filter(Boolean).length;
    console.log(`unit ${unit}: ${rows.length} words, ${known.length} known, ${written.size} written, ${withBook} examples from the book`);
  }
  writeFileSync(path.join(REF, 'manifests', 'cvi-words.json'), JSON.stringify(audit, null, 1));
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
