/**
 * Builds the Japanese kanji and vocabulary data shipped with the app (server/content/ja/vocab-data.json).
 * Re-run monthly to pick up dictionary updates (the KANJIDIC2 licence asks users to keep their data current):
 *   npm run ja:vocab-data
 *
 * Sources:
 * - KANJIDIC2 (EDRDG, CC BY-SA 4.0): readings, English meanings, stroke counts, Sino-Vietnamese readings
 * - kanji-data by David Gouveia (MIT): JLPT N5-N1 levels for kanji, from Jonathan Waller's lists
 * - open-anki-jlpt-decks (MIT): JLPT N5-N1 vocabulary with readings and English meanings
 */
import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { download, parseCsv } from './sourceData.js';

const KANJIDIC_URL = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz';
const KANJI_LEVELS_URL = 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json';
const VOCAB_URL = (level: string) => `https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/${level}.csv`;
const OUT_DIR = path.resolve(process.cwd(), 'server/content/ja');

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;

export interface KanjiEntry {
  c: string;
  level: (typeof LEVELS)[number];
  strokes: number | null;
  on: string[];
  kun: string[];
  meanings: string[];
  /** Sino-Vietnamese candidates from KANJIDIC2 (several, including rare ones) */
  vietnamese: string[];
  /** Newspaper frequency rank (lower is more common) */
  freq: number | null;
}

export interface WordEntry {
  w: string;
  r: string;
  m: string;
  level: (typeof LEVELS)[number];
}

const decode = (text: string) =>
  text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/**
 * All values of a tag in an XML fragment, optionally filtered by attributes
 */
function tags(xml: string, tag: string, filter?: (attributes: string) => boolean): string[] {
  const values: string[] = [];
  for (const match of xml.matchAll(new RegExp(`<${tag}([^>]*)>([^<]*)</${tag}>`, 'g'))) {
    if (!filter || filter(match[1])) values.push(decode(match[2]));
  }
  return values;
}

async function main(): Promise<void> {
  console.log('Downloading KANJIDIC2, kanji levels and vocabulary…');
  const [kanjidicGz, levelsJson, ...vocabCsv] = await Promise.all([
    download(KANJIDIC_URL),
    download(KANJI_LEVELS_URL),
    ...LEVELS.map((level) => download(VOCAB_URL(level.toLowerCase()))),
  ]);

  const kanjidic = gunzipSync(kanjidicGz).toString('utf8');
  const dictionaryVersion = /<database_version>([^<]+)<\/database_version>/.exec(kanjidic)?.[1] ?? 'unknown';
  const levelByKanji = JSON.parse(levelsJson.toString('utf8')) as Record<string, { jlpt_new: number | null }>;

  const kanji: KanjiEntry[] = [];
  for (const block of kanjidic.split('<character>').slice(1)) {
    const c = tags(block, 'literal')[0];
    const jlpt = levelByKanji[c]?.jlpt_new;
    if (!c || !jlpt) continue;
    const reading = (type: string) => tags(block, 'reading', (attributes) => attributes.includes(`r_type="${type}"`));
    kanji.push({
      c,
      level: `N${jlpt}` as KanjiEntry['level'],
      strokes: Number(tags(block, 'stroke_count')[0]) || null,
      on: reading('ja_on'),
      kun: reading('ja_kun'),
      // English meanings have no m_lang attribute
      meanings: tags(block, 'meaning', (attributes) => !attributes.includes('m_lang')),
      vietnamese: reading('vietnam'),
      freq: Number(tags(block, 'freq')[0]) || null,
    });
  }
  // Learn the most frequent kanji of each level first
  kanji.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (a.freq ?? 9999) - (b.freq ?? 9999));

  const words: WordEntry[] = [];
  const seen = new Set<string>();
  LEVELS.forEach((level, i) => {
    const [header, ...rows] = parseCsv(vocabCsv[i].toString('utf8'));
    const col = (name: string) => header.indexOf(name);
    for (const row of rows) {
      const w = row[col('expression')]?.trim();
      const r = row[col('reading')]?.trim();
      const m = row[col('meaning')]?.trim();
      // A word listed at several levels is kept at its easiest one
      if (!w || !r || !m || seen.has(`${w}|${r}`)) continue;
      seen.add(`${w}|${r}`);
      words.push({ w, r, m, level });
    }
  });

  await mkdir(OUT_DIR, { recursive: true });
  const data = {
    version: { kanjidic: dictionaryVersion, built: new Date().toISOString().slice(0, 10) },
    kanji,
    words,
  };
  await writeFile(path.join(OUT_DIR, 'vocab-data.json'), JSON.stringify(data));
  console.log(`KANJIDIC2 ${dictionaryVersion}: ${kanji.length} kanji, ${words.length} words → server/content/ja/vocab-data.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
