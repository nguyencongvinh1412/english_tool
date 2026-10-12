/**
 * Builds the English vocabulary data shipped with the app (server/content/en/vocab-data.json):
 *   npm run en:vocab-data
 * Needs `bunzip2` on the PATH (macOS and Linux have it) for the Tatoeba exports.
 *
 * Sources (see server/content/en/DATA-LICENSE.md):
 * - NGSL 1.2, TSL 1.2, NAWL 1.2 by Browne, Culligan & Phillips (CC BY-SA 4.0): word lists, ranks, English definitions
 * - CEFR-J Wordlist 1.5 (Tono Laboratory, TUFS; free with citation) and Octanove C1/C2 (CC BY-SA 4.0): CEFR levels, parts of speech
 * - CMU Pronouncing Dictionary (Carnegie Mellon University, BSD-style): pronunciations, converted to IPA
 * - Tatoeba (CC BY 2.0 FR): English example sentences with Vietnamese translations
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { download, parseCsv } from './sourceData.js';

const NGSL = 'https://www.newgeneralservicelist.com/s';
const CEFRJ = 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master';
const CMUDICT_URL = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';
const TATOEBA = 'https://downloads.tatoeba.org/exports/per_language';
const OUT_DIR = path.resolve(process.cwd(), 'server/content/en');

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type Cefr = (typeof CEFR)[number];

export interface EnDeck {
  id: string;
  group: 'core' | 'toeic' | 'ielts';
  /** CEFR level for core decks, part number for TOEIC/IELTS */
  label: string;
}

export interface EnWord {
  w: string;
  pos: string | null;
  def: string | null;
  ipa: string | null;
  cefr: Cefr | null;
  deck: string;
  ex: string | null;
  exVi: string | null;
}

/* ---------- XLSX (first sheet, as rows of strings) ---------- */

async function readXlsx(buffer: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer);
  const decode = (text: string) => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const shared = [...((await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode(m[1].replace(/<[^>]+>/g, ''))
  );
  const sheet = (await zip.file('xl/worksheets/sheet1.xml')?.async('string')) ?? '';
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const column = cell[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const value = /<v>([\s\S]*?)<\/v>/.exec(cell[3] ?? '')?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell[3] ?? '')?.[1] ?? '';
      cells[column] = /t="s"/.test(cell[2]) ? (shared[Number(value)] ?? '') : decode(value);
    }
    return Array.from(cells, (c) => (c ?? '').trim());
  });
}

/* ---------- CMUdict -> IPA (General American) ---------- */

const ARPABET: Record<string, string> = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', EH: 'ɛ', ER: 'ɝ', EY: 'eɪ', IH: 'ɪ', IY: 'i', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'u',
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p', R: 'r',
  S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};
/** Consonant clusters that can start an English syllable, for placing stress marks */
const ONSETS = new Set(['pl', 'bl', 'kl', 'ɡl', 'fl', 'sl', 'pr', 'br', 'tr', 'dr', 'kr', 'ɡr', 'fr', 'θr', 'ʃr', 'sp', 'st', 'sk', 'sm', 'sn', 'sw', 'tw', 'kw', 'dw', 'ɡw', 'pj', 'bj', 'kj', 'mj', 'fj', 'hj', 'spl', 'spr', 'str', 'skr', 'skw']);

export function toIpa(phones: string[]): string {
  const sounds = phones.map((phone) => {
    const stress = /([012])$/.exec(phone)?.[1];
    const base = phone.replace(/\d$/, '');
    let ipa = ARPABET[base] ?? '';
    if (base === 'AH' && stress === '0') ipa = 'ə';
    if (base === 'ER' && stress === '0') ipa = 'ɚ';
    return { ipa, vowel: stress !== undefined, stress };
  });
  const syllables = sounds.filter((s) => s.vowel).length;
  const marks = new Map<number, string>();
  if (syllables > 1) {
    sounds.forEach((sound, i) => {
      if (!sound.vowel || (sound.stress !== '1' && sound.stress !== '2')) return;
      // Consonants between the previous vowel and this one
      let runStart = i;
      while (runStart > 0 && !sounds[runStart - 1].vowel) runStart--;
      // Word-initial consonants all belong to the first syllable; otherwise take the longest legal onset
      let start = i;
      if (runStart === 0) start = 0;
      else {
        for (let j = runStart; j < i; j++) {
          const cluster = sounds.slice(j, i).map((s) => s.ipa).join('');
          if (i - j === 1 ? sounds[j].ipa !== 'ŋ' : ONSETS.has(cluster)) {
            start = j;
            break;
          }
        }
      }
      marks.set(start, sound.stress === '1' ? 'ˈ' : 'ˌ');
    });
  }
  return sounds.map((s, i) => (marks.get(i) ?? '') + s.ipa).join('');
}

/* ---------- Helpers ---------- */

function bunzip(buffer: Buffer): string {
  const result = spawnSync('bunzip2', ['-c'], { input: buffer, maxBuffer: 1024 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`bunzip2 failed: ${result.stderr.toString()}`);
  return result.stdout.toString('utf8');
}

const POS_NAMES: Record<string, string> = {
  n: 'noun', noun: 'noun', v: 'verb', verb: 'verb', adj: 'adjective', adjective: 'adjective', adv: 'adverb', adverb: 'adverb',
  prep: 'preposition', preposition: 'preposition', conj: 'conjunction', conjunction: 'conjunction', pron: 'pronoun', pronoun: 'pronoun',
  determiner: 'determiner', det: 'determiner', number: 'number', interjection: 'interjection', modal: 'modal verb', 'modal verb': 'modal verb',
};
const normalizePos = (pos: string | undefined) => (pos ? (POS_NAMES[pos.trim().toLowerCase()] ?? pos.trim().toLowerCase()) : null);

/** Splits a list into n parts of nearly equal size */
function split<T>(list: T[], parts: number): T[][] {
  const size = Math.ceil(list.length / parts);
  return Array.from({ length: parts }, (_, i) => list.slice(i * size, (i + 1) * size));
}

async function main(): Promise<void> {
  console.log('Downloading word lists…');
  const [ngslStats, tslStats, nawlStats, ngslDefs, tslDefs, nawlDefs, cefrj, c1c2, cmudict] = await Promise.all([
    download(`${NGSL}/NGSL_12_stats.csv`),
    download(`${NGSL}/TSL_12_stats.csv`),
    download(`${NGSL}/NAWL_12_stats.csv`),
    download(`${NGSL}/NGSL_12_with_English_definitions.xlsx`),
    download(`${NGSL}/TSL_12_definitions.xlsx`),
    download(`${NGSL}/NAWL_12_with_en_definitions.csv`),
    download(`${CEFRJ}/cefrj-vocabulary-profile-1.5.csv`),
    download(`${CEFRJ}/octanove-vocabulary-profile-c1c2-1.0.csv`),
    download(CMUDICT_URL),
  ]);

  // Word lists in rank order (first column is the word)
  const listOf = (csv: Buffer) =>
    parseCsv(csv.toString('utf8'))
      .slice(1)
      .map((row) => row[0].trim().toLowerCase())
      .filter(Boolean);
  const ngsl = listOf(ngslStats);
  const tsl = listOf(tslStats);
  const nawl = parseCsv(nawlStats.toString('utf8'))
    .slice(1)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((row) => row[0].trim().toLowerCase());

  // English definitions and parts of speech
  const definitions = new Map<string, { def: string; pos?: string }>();
  for (const sheet of [ngslDefs, tslDefs]) {
    for (const [word, ...rest] of (await readXlsx(sheet)).slice(1)) {
      // Word, then the definition (the longest cell with spaces)
      const def = rest.filter((cell) => cell.includes(' ')).sort((a, b) => b.length - a.length)[0];
      if (word && def && !definitions.has(word.toLowerCase())) definitions.set(word.toLowerCase(), { def });
    }
  }
  for (const row of parseCsv(nawlDefs.toString('utf8')).slice(1)) {
    if (row[0] && row[1] && !definitions.has(row[0].toLowerCase())) definitions.set(row[0].toLowerCase(), { def: row[1], pos: row[2] });
  }

  // CEFR level (the lowest across parts of speech) and the part of speech at that level
  const levels = new Map<string, { cefr: Cefr; pos: string }>();
  const allPos = new Map<string, Set<string>>();
  for (const csv of [cefrj, c1c2]) {
    for (const [headword, pos, cefr] of parseCsv(csv.toString('utf8')).slice(1)) {
      if (!CEFR.includes(cefr as Cefr)) continue;
      for (const form of headword.split('/')) {
        const key = form.trim().toLowerCase();
        allPos.set(key, (allPos.get(key) ?? new Set()).add(pos));
        const existing = levels.get(key);
        if (!existing || CEFR.indexOf(cefr as Cefr) < CEFR.indexOf(existing.cefr)) levels.set(key, { cefr: cefr as Cefr, pos });
      }
    }
  }

  // Pronunciations (first variant)
  const ipa = new Map<string, string>();
  for (const line of cmudict.toString('utf8').split('\n')) {
    const [word, ...phones] = line.replace(/#.*$/, '').trim().split(/\s+/);
    if (!word || word.includes('(') || ipa.has(word)) continue;
    ipa.set(word, toIpa(phones));
  }

  console.log('Downloading Tatoeba English-Vietnamese pairs…');
  const [vieSentences, links, engSentences] = await Promise.all([
    download(`${TATOEBA}/vie/vie_sentences.tsv.bz2`),
    download(`${TATOEBA}/vie/vie-eng_links.tsv.bz2`),
    download(`${TATOEBA}/eng/eng_sentences.tsv.bz2`),
  ]);
  const tsv = (text: string) => new Map(text.split('\n').filter(Boolean).map((line) => { const [id, , sentence] = line.split('\t'); return [id, sentence]; }));
  const vi = tsv(bunzip(vieSentences));
  const pairs: { en: string; vi: string; words: number }[] = [];
  const linked = new Map<string, string>();
  for (const line of bunzip(links).split('\n')) {
    const [vieId, engId] = line.split('\t');
    if (vieId && engId && vi.has(vieId) && !linked.has(engId)) linked.set(engId, vi.get(vieId)!);
  }
  for (const [id, sentence] of tsv(bunzip(engSentences))) {
    const translation = linked.get(id);
    if (translation && sentence) pairs.push({ en: sentence, vi: translation, words: sentence.split(/\s+/).length });
  }
  // Shorter (but not tiny) sentences first
  pairs.sort((a, b) => Math.abs(a.words - 8) - Math.abs(b.words - 8) || a.en.length - b.en.length);
  console.log(`${pairs.length} sentence pairs`);

  const exampleFor = (word: string) => {
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es|d|ed|ing)?\\b`, 'i');
    return pairs.find((pair) => pair.words >= 4 && pair.words <= 14 && pattern.test(pair.en));
  };

  // Decks: core NGSL by CEFR, TOEIC (TSL) and IELTS academic (NAWL) in frequency parts
  const decks: EnDeck[] = [];
  const words: EnWord[] = [];
  const seen = new Set<string>();
  const entry = (w: string, deck: string): EnWord => {
    const level = levels.get(w);
    const definition = definitions.get(w);
    const example = exampleFor(w);
    return {
      w,
      // The definition decides between parts of speech ("to move…" is the verb)
      pos: definition?.def.startsWith('to ') && allPos.get(w)?.has('verb') ? 'verb' : normalizePos(level?.pos ?? definition?.pos),
      def: definition?.def ?? null,
      ipa: ipa.get(w) ?? null,
      cefr: level?.cefr ?? null,
      deck,
      ex: example?.en ?? null,
      exVi: example?.vi ?? null,
    };
  };

  const coreLevel = (w: string, rank: number): Cefr => {
    const level = levels.get(w)?.cefr;
    // Few core words are C1-C2, so they join B2
    if (level) return level === 'C1' || level === 'C2' ? 'B2' : level;
    return rank < 800 ? 'A2' : rank < 1600 ? 'B1' : 'B2';
  };
  const core = new Map<Cefr, string[]>();
  ngsl.forEach((w, rank) => {
    if (seen.has(w)) return;
    seen.add(w);
    const level = coreLevel(w, rank);
    core.set(level, [...(core.get(level) ?? []), w]);
  });
  for (const level of CEFR.slice(0, 4)) {
    const id = `en-core-${level}`;
    decks.push({ id, group: 'core', label: level === 'B2' ? 'B2–C1' : level });
    for (const w of core.get(level) ?? []) words.push(entry(w, id));
  }
  for (const [group, list, parts] of [['toeic', tsl, 4], ['ielts', nawl, 3]] as const) {
    split(list.filter((w) => !seen.has(w) && seen.add(w)), parts).forEach((part, i) => {
      const id = `en-${group}-${i + 1}`;
      decks.push({ id, group, label: String(i + 1) });
      for (const w of part) words.push(entry(w, id));
    });
  }

  await mkdir(OUT_DIR, { recursive: true });
  const data = { version: { built: new Date().toISOString().slice(0, 10) }, decks, words };
  await writeFile(path.join(OUT_DIR, 'vocab-data.json'), JSON.stringify(data));
  const withIpa = words.filter((w) => w.ipa).length;
  const withExample = words.filter((w) => w.ex).length;
  console.log(`${words.length} words in ${decks.length} decks; IPA ${withIpa}, examples ${withExample}`);
  for (const deck of decks) console.log(`  ${deck.id}: ${words.filter((w) => w.deck === deck.id).length}`);
}

// Run only as a script, so tests can import the converters
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
