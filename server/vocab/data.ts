/**
 * Japanese vocabulary data
 * Loads server/content/ja/vocab-data.json into vocab_items on startup (source fields only, so the
 * AI-added Vietnamese meanings survive dictionary refreshes) and serves cards to the API.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vocabItems, type VocabItem } from '../db/schema.js';

const DATA_FILE = path.resolve(process.cwd(), 'server/content/ja/vocab-data.json');
const UPSERT_BATCH = 500;

interface VocabData {
  version: { kanjidic: string; built: string };
  kanji: { c: string; level: string; strokes: number | null; on: string[]; kun: string[]; meanings: string[]; vietnamese: string[] }[];
  words: { w: string; r: string; m: string; level: string }[];
}

export const kanjiId = (kanji: string) => `k:${kanji}`;
export const wordId = (word: string, reading: string) => `w:${word}|${reading}`;

/** Version of the loaded dictionary data, shown with the attribution */
export let vocabDataVersion: VocabData['version'] | null = null;

/**
 * Upserts the bundled data; Vietnamese fields are never overwritten
 */
export async function ensureJaVocab(file = DATA_FILE): Promise<number> {
  let data: VocabData;
  try {
    data = JSON.parse(await readFile(file, 'utf8')) as VocabData;
  } catch {
    console.warn('Japanese vocabulary data not found; run npm run ja:vocab-data');
    return 0;
  }
  vocabDataVersion = data.version;

  const position: Record<string, number> = {};
  const next = (key: string) => (position[key] = (position[key] ?? 0) + 1);

  const rows: (typeof vocabItems.$inferInsert)[] = [
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

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    await db
      .insert(vocabItems)
      .values(rows.slice(i, i + UPSERT_BATCH))
      .onConflictDoUpdate({
        target: vocabItems.id,
        set: {
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
        },
      });
  }
  return rows.length;
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
  };
}
