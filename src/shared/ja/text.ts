/**
 * Japanese text helpers
 * Lesson text marks readings inline as 漢字{かんじ}: the kanji run right before the braces is the base.
 */

/** A run of kanji (plus iteration marks) followed by its reading in braces */
const RUBY_PATTERN = /([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3005\u3006\u30f5\u30f6]+)\{([^{}]+)\}/g;

/** Hiragana, katakana or kanji */
const JAPANESE_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

export type RubySegment = { text: string; reading?: string };

/**
 * Splits marked-up text into plain segments and kanji segments with readings
 */
export function parseRuby(marked: string): RubySegment[] {
  const segments: RubySegment[] = [];
  let last = 0;
  for (const match of marked.matchAll(RUBY_PATTERN)) {
    if (match.index > last) segments.push({ text: marked.slice(last, match.index) });
    segments.push({ text: match[1], reading: match[2] });
    last = match.index + match[0].length;
  }
  if (last < marked.length) segments.push({ text: marked.slice(last) });
  return segments;
}

/**
 * Text as written, without readings: 漢字{かんじ} → 漢字
 */
export function plainText(marked: string): string {
  return marked.replace(RUBY_PATTERN, '$1');
}

/**
 * Text as read aloud, kanji replaced by their readings: 漢字{かんじ} → かんじ.
 * Speech uses this so kanji with several readings are always pronounced as intended.
 */
export function readingText(marked: string): string {
  return marked.replace(RUBY_PATTERN, '$2');
}

/**
 * Whether the text contains Japanese script
 */
export function isJapanese(text: string): boolean {
  return JAPANESE_CHAR.test(text);
}

/**
 * Katakana → hiragana, so either script matches when checking answers
 */
export function toHiragana(text: string): string {
  return text.replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

/** Punctuation and spaces ignored when checking typed answers */
const IGNORED = /[\s\u3001\u3002\uff0c\uff0e,.!\uff01?\uff1f\u300c\u300d\u300e\u300f\uff08\uff09()\u30fb\u2026\u301c~]/g;

/**
 * Typed-answer form: no punctuation or spaces, katakana folded to hiragana (ー stays: it changes the word)
 */
export function normalizeJapanese(text: string): string {
  return toHiragana(text.normalize('NFKC')).replace(IGNORED, '');
}

export interface MatchUnit {
  /** As written (kanji with its reading, or one kana character) */
  text: string;
  reading?: string;
  ok: boolean;
}

/**
 * Checks a typed sentence against marked-up text. Each kanji may be typed as written or as its reading,
 * so kana-only, kanji and mixed answers all count. Units are marked for feedback when the answer is wrong.
 */
export function matchJapanese(marked: string, input: string): { correct: boolean; units: MatchUnit[] } {
  const units: (MatchUnit & { forms: string[] })[] = [];
  for (const segment of parseRuby(marked)) {
    if (segment.reading) {
      units.push({ text: segment.text, reading: segment.reading, ok: false, forms: [normalizeJapanese(segment.text), normalizeJapanese(segment.reading)] });
    } else {
      for (const char of segment.text) {
        const form = normalizeJapanese(char);
        if (form) units.push({ text: char, ok: false, forms: [form] });
      }
    }
  }

  const typed = normalizeJapanese(input);

  // Exact check: walk the units, taking whichever form of each matches here (try every form, so mixed answers work)
  const exact = (unit: number, pos: number): boolean => {
    if (unit === units.length) return pos === typed.length;
    return units[unit].forms.some((form) => typed.startsWith(form, pos) && exact(unit + 1, pos + form.length));
  };
  const correct = exact(0, 0);

  // Feedback: align units with the typed text so the most units match (longest-common-subsequence style);
  // a wrong or extra word then only marks itself, not everything after it
  if (!correct) {
    const best: number[][] = Array.from({ length: units.length + 1 }, () => new Array<number>(typed.length + 1).fill(0));
    for (let i = units.length - 1; i >= 0; i--) {
      for (let j = typed.length; j >= 0; j--) {
        let score = Math.max(best[i + 1][j], j < typed.length ? best[i][j + 1] : 0);
        for (const form of units[i].forms) {
          if (typed.startsWith(form, j)) score = Math.max(score, 1 + best[i + 1][j + form.length]);
        }
        best[i][j] = score;
      }
    }
    let i = 0;
    let j = 0;
    while (i < units.length) {
      const form = units[i].forms.find((f) => typed.startsWith(f, j) && 1 + best[i + 1][j + f.length] === best[i][j]);
      if (form !== undefined) {
        units[i].ok = true;
        j += form.length;
        i++;
      } else if (j < typed.length && best[i][j + 1] === best[i][j]) {
        j++;
      } else {
        i++;
      }
    }
  }

  return { correct, units: units.map((unit) => ({ text: unit.text, reading: unit.reading, ok: correct || unit.ok })) };
}

export interface JaWord {
  /** Plain text of the word */
  text: string;
  pieces: RubySegment[];
  /** Real word (not punctuation or spaces): can be tapped */
  isWord: boolean;
}

/**
 * Splits marked-up text into words for tap-to-define. Uses the browser's Japanese word segmenter;
 * a kanji with a reading is never split across words.
 */
export function wordsOf(marked: string): JaWord[] {
  const segments = parseRuby(marked);
  let plain = '';
  const ruby: { start: number; end: number; reading: string }[] = [];
  for (const segment of segments) {
    const start = plain.length;
    plain += segment.text;
    if (segment.reading) ruby.push({ start, end: plain.length, reading: segment.reading });
  }

  const Segmenter = typeof Intl !== 'undefined' ? (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter : undefined;
  let bounds = Segmenter
    ? [...new Segmenter('ja', { granularity: 'word' }).segment(plain)].map((s) => ({
        start: s.index,
        end: s.index + s.segment.length,
        isWord: Boolean(s.isWordLike),
      }))
    : segments.map((segment, i) => {
        const start = segments.slice(0, i).reduce((n, s) => n + s.text.length, 0);
        return { start, end: start + segment.text.length, isWord: true };
      });

  // Merge words that would cut through a ruby base
  const merged: typeof bounds = [];
  for (const bound of bounds) {
    const last = merged.at(-1);
    if (last && ruby.some((r) => r.start < bound.start && bound.start < r.end)) {
      last.end = bound.end;
      last.isWord = last.isWord || bound.isWord;
    } else {
      merged.push({ ...bound });
    }
  }
  bounds = merged;

  return bounds.map(({ start, end, isWord }) => {
    const pieces: RubySegment[] = [];
    let at = start;
    for (const r of ruby.filter((range) => range.start >= start && range.end <= end)) {
      if (r.start > at) pieces.push({ text: plain.slice(at, r.start) });
      pieces.push({ text: plain.slice(r.start, r.end), reading: r.reading });
      at = r.end;
    }
    if (at < end) pieces.push({ text: plain.slice(at, end) });
    return { text: plain.slice(start, end), pieces, isWord };
  });
}

/**
 * Splits mixed text (e.g. Vietnamese feedback quoting Japanese) into Japanese and other runs
 */
export function splitJapaneseRuns(text: string): { text: string; japanese: boolean }[] {
  return text
    .split(/((?:[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff01-\uff60]|\{[\u3041-\u30fc]+\})+)/)
    .filter(Boolean)
    .map((part) => ({ text: part, japanese: isJapanese(part) }));
}
