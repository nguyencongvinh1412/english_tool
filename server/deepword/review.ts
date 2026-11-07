/**
 * Reviews of deeply studied words. Each review is one exercise on one word; the kind differs from the last one, gets
 * harder as the word is remembered, and gets easier after a poor review. Pure functions, so the rules are testable.
 */
import { REVIEW_KINDS, type ReviewKind } from './schedule.js';

export interface KindContext {
  /** Interval just waited: 0 is one day */
  step: number;
  lastKind: string | null;
  /** Whether the last review went well; null before the first review */
  lastGood: boolean | null;
  /** The learner has not written a sentence with the word yet (they chose "later") */
  needsSentence: boolean;
  /** Which kinds can be offered for this word now */
  available: Record<ReviewKind, boolean>;
}

const indexOf = (kind: string | null) => REVIEW_KINDS.indexOf(kind as ReviewKind);

/**
 * The kind of the next review: harder with each step, one step easier after a poor review, never the same as the
 * last, and only among the kinds that are available.
 */
export function pickKind(ctx: KindContext): ReviewKind {
  if (ctx.needsSentence) return 'sentence';
  const last = indexOf(ctx.lastKind);
  let target = Math.min(ctx.step, REVIEW_KINDS.length - 1);
  if (ctx.lastGood === false && last >= 0) target = Math.max(0, last - 1);

  // Nearest available kind to the target, preferring one that is not the last kind
  const order = REVIEW_KINDS.map((kind, i) => ({ kind, i })).sort((a, b) => Math.abs(a.i - target) - Math.abs(b.i - target) || a.i - b.i);
  const usable = order.filter(({ kind }) => ctx.available[kind]);
  const fresh = usable.find(({ i }) => i !== last);
  return (fresh ?? usable[0] ?? { kind: 'recall' as ReviewKind }).kind;
}

/** Lowercase, no punctuation at the ends, single spaces: typed answers are compared in this form */
export const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[“”"‘’]/g, '')
    .replace(/[.!?,;:]+(\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/** The word as it appears in a sentence (decision, decisions, decided...), or null */
export function formIn(sentence: string, term: string): string | null {
  const stem = term.replace(/e$/, '').replace(/y$/, '');
  const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b(${escaped(term)}|${escaped(stem)})[a-z]{0,4}\\b`, 'i').exec(sentence);
  return match ? match[0] : null;
}

/** A sentence with the word replaced by a blank, plus the form that was blanked */
export function blank(sentence: string, term: string): { text: string; answer: string } | null {
  const form = formIn(sentence, term);
  if (!form) return null;
  const at = sentence.toLowerCase().indexOf(form.toLowerCase());
  return { text: `${sentence.slice(0, at)}_____${sentence.slice(at + form.length)}`, answer: sentence.slice(at, at + form.length) };
}

/** Whether a typed word is the studied word: the word itself, or the form used in the sentence */
export function sameWord(answer: string, term: string, form?: string): boolean {
  const a = normalize(answer);
  return a === normalize(term) || (form !== undefined && a === normalize(form));
}

/** Whether a corrected sentence is the expected one (case, spaces and end punctuation do not matter) */
export const sameSentence = (answer: string, expected: string): boolean => normalize(answer) === normalize(expected);

export interface Pool {
  text: string;
  vi?: string;
}

/** Sentences a cloze can be made from: the real example first, then the AI examples and collocation examples that hold the word */
export function clozePool(term: string, real: string | null, realVi: string | null, examples: Pool[], collocations: { example: string }[]): Pool[] {
  const all: Pool[] = [...(real ? [{ text: real, vi: realVi ?? undefined }] : []), ...examples, ...collocations.map((c) => ({ text: c.example }))];
  const seen = new Set<string>();
  return all.filter((p) => p.text && formIn(p.text, term) && !seen.has(p.text) && seen.add(p.text));
}
