/**
 * Japanese vocabulary data
 * Loads server/content/ja/vocab-data.json into vocab_items on startup (source fields only, so the
 * AI-added Vietnamese meanings survive dictionary refreshes) and serves cards to the API.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appMeta, vocabItems, type VocabItem } from '../db/schema.js';

const DATA_FILE = path.resolve(process.cwd(), 'server/content/ja/vocab-data.json');
const EN_DATA_FILE = path.resolve(process.cwd(), 'server/content/en/vocab-data.json');
/** Bump the suffix when the loader maps data differently, so the next start reloads it */
const EN_META_KEY = 'en-vocab-data:2';
const UPSERT_BATCH = 500;
/** app_meta key holding the hash of the loaded data file */
const META_KEY = 'ja-vocab-data';

interface VocabData {
  version: { kanjidic: string; built: string };
  kanji: { c: string; level: string; strokes: number | null; on: string[]; kun: string[]; meanings: string[]; vietnamese: string[] }[];
  words: { w: string; r: string; m: string; level: string }[];
}

export const kanjiId = (kanji: string) => `k:${kanji}`;
export const wordId = (word: string, reading: string) => `w:${word}|${reading}`;

/** Version of the loaded dictionary data, shown with the attribution */
export let vocabDataVersion: VocabData['version'] | null = null;

type Row = typeof vocabItems.$inferInsert;
type UpdateSet = Parameters<ReturnType<ReturnType<typeof db.insert<typeof vocabItems>>['values']>['onConflictDoUpdate']>[0]['set'];

/**
 * Reads a bundled data file
 * @returns The text, or null when the file has not been built
 */
async function readData(file: string, script: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    console.warn(`Vocabulary data not found (${file}); run npm run ${script}`);
    return null;
  }
}

/**
 * Upserts rows in batches unless this exact file was loaded before (a hash is kept in app_meta)
 * @returns Rows written (0 when nothing changed)
 */
async function upsertIfChanged(raw: string, metaKey: string, rows: () => Row[], set: UpdateSet): Promise<number> {
  const hash = createHash('sha256').update(raw).digest('hex');
  const [loaded] = await db.select({ value: appMeta.value }).from(appMeta).where(eq(appMeta.key, metaKey));
  if (loaded?.value === hash) return 0;

  const all = rows();
  for (let i = 0; i < all.length; i += UPSERT_BATCH) {
    await db.insert(vocabItems).values(all.slice(i, i + UPSERT_BATCH)).onConflictDoUpdate({ target: vocabItems.id, set });
  }
  await db
    .insert(appMeta)
    .values({ key: metaKey, value: hash })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: hash, updatedAt: sql`now()` } });
  return all.length;
}

/**
 * Upserts the bundled Japanese data; Vietnamese fields are never overwritten.
 * Skipped when the same file was already loaded, so restarts stay fast.
 * @returns Rows written (0 when nothing changed)
 */
export async function ensureJaVocab(file = DATA_FILE): Promise<number> {
  const raw = await readData(file, 'ja:vocab-data');
  if (raw === null) return 0;
  const data = JSON.parse(raw) as VocabData;
  vocabDataVersion = data.version;
  return upsertIfChanged(raw, META_KEY, () => jaRows(data), {
    kind: sql`excluded.kind`,
    level: sql`excluded.level`,
    position: sql`excluded.position`,
    term: sql`excluded.term`,
    reading: sql`excluded.reading`,
    readingsOn: sql`excluded.readings_on`,
    readingsKun: sql`excluded.readings_kun`,
    meaningsEn: sql`excluded.meanings_en`,
    strokes: sql`excluded.strokes`,
    hanVietOptions: sql`excluded.han_viet_options`,
    updatedAt: sql`now()`,
  });
}

/**
 * Database rows for the Japanese data
 */
function jaRows(data: VocabData): Row[] {

  const position: Record<string, number> = {};
  const next = (key: string) => (position[key] = (position[key] ?? 0) + 1);

  return [
    ...data.kanji.map((k) => ({
      id: kanjiId(k.c),
      kind: 'kanji',
      level: k.level,
      position: next(`kanji:${k.level}`),
      term: k.c,
      reading: null,
      readingsOn: k.on,
      readingsKun: k.kun,
      meaningsEn: k.meanings,
      strokes: k.strokes,
      hanVietOptions: k.vietnamese,
    })),
    ...data.words.map((w) => ({
      id: wordId(w.w, w.r),
      kind: 'word',
      level: w.level,
      position: next(`word:${w.level}`),
      term: w.w,
      reading: w.r,
      meaningsEn: w.m.split(/,\s*/).filter(Boolean),
    })),
  ];
}

/* ---------- English ---------- */

export interface EnDeck {
  id: string;
  group: 'core' | 'toeic' | 'ielts';
  label: string;
}

interface EnVocabData {
  version: { built: string };
  decks: EnDeck[];
  words: { w: string; pos: string | null; def: string | null; ipa: string | null; cefr: string | null; deck: string; ex: string | null; exVi: string | null }[];
}

/** English decks in display order (from the data file) */
export let enDecks: EnDeck[] = [];
export let enDataVersion: EnVocabData['version'] | null = null;

export const enWordId = (word: string) => `en:${word}`;

/**
 * Upserts the bundled English data. Source examples replace AI ones; Vietnamese meanings and
 * collocations from the AI are kept.
 * @returns Rows written (0 when nothing changed)
 */
export async function ensureEnVocab(file = EN_DATA_FILE): Promise<number> {
  const raw = await readData(file, 'en:vocab-data');
  if (raw === null) return 0;
  const data = JSON.parse(raw) as EnVocabData;
  enDecks = data.decks;
  enDataVersion = data.version;

  const position: Record<string, number> = {};
  return upsertIfChanged(
    raw,
    EN_META_KEY,
    () =>
      data.words.map((w) => ({
        id: enWordId(w.w),
        kind: 'word',
        language: 'en' as const,
        deck: w.deck,
        level: w.cefr ?? '',
        position: (position[w.deck] = (position[w.deck] ?? 0) + 1),
        // The word lists are lower case; the pronoun is not
        term: w.w === 'i' ? 'I' : w.w,
        pos: w.pos,
        ipa: w.ipa,
        meaningsEn: w.def ? [w.def] : [],
        example: w.ex,
        exampleVi: w.exVi,
      })),
    {
      deck: sql`excluded.deck`,
      term: sql`excluded.term`,
      level: sql`excluded.level`,
      position: sql`excluded.position`,
      pos: sql`excluded.pos`,
      ipa: sql`excluded.ipa`,
      meaningsEn: sql`excluded.meanings_en`,
      example: sql`coalesce(excluded.example, ${vocabItems.example})`,
      exampleVi: sql`case when excluded.example is null then ${vocabItems.exampleVi} else excluded.example_vi end`,
      updatedAt: sql`now()`,
    }
  );
}

/**
 * Sino-Vietnamese reading of a word, built from its kanji when every kanji has one (勉強 → MIỄN CƯỜNG)
 */
export async function wordHanViet(items: VocabItem[]): Promise<Map<string, string>> {
  const kanjiChars = new Set(items.filter((i) => i.kind === 'word').flatMap((i) => [...i.term].filter((c) => /[一-鿿]/.test(c))));
  const result = new Map<string, string>();
  if (kanjiChars.size === 0) return result;

  const rows = await db
    .select({ term: vocabItems.term, hanViet: vocabItems.hanViet })
    .from(vocabItems)
    .where(inArray(vocabItems.id, [...kanjiChars].map(kanjiId)));
  const byChar = new Map(rows.filter((r) => r.hanViet).map((r) => [r.term, r.hanViet!]));

  for (const item of items) {
    if (item.kind !== 'word') continue;
    const chars = [...item.term].filter((c) => /[一-鿿]/.test(c));
    if (chars.length > 0 && chars.every((c) => byChar.has(c))) {
      result.set(item.id, chars.map((c) => byChar.get(c)!.toUpperCase()).join(' '));
    }
  }
  return result;
}

/**
 * Card fields sent to the client
 */
export function toPublicItem(item: VocabItem, hanViet?: string) {
  return {
    id: item.id,
    kind: item.kind as 'kanji' | 'word',
    level: item.level,
    term: item.term,
    reading: item.reading,
    readingsOn: item.readingsOn ?? [],
    readingsKun: item.readingsKun ?? [],
    meaningsEn: item.meaningsEn,
    strokes: item.strokes,
    hanViet: item.kind === 'kanji' ? item.hanViet : (hanViet ?? null),
    meaningVi: item.meaningVi,
    example: item.example,
    exampleVi: item.exampleVi,
    ...(item.language === 'en' && { pos: item.pos, ipa: item.ipa, cefr: item.level || null, collocations: item.collocations ?? [] }),
  };
}
