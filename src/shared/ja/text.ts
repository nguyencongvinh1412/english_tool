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

