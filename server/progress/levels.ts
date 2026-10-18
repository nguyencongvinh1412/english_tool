/**
 * Level helpers for the progress page: CEFR and JLPT orders, and the CEFR level a TOEIC or IELTS target
 * score roughly corresponds to (the publishers' own mappings; rough guides, not guarantees)
 */

export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_ORDER)[number];

/** JLPT from easiest to hardest */
export const JLPT_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export type JlptLevel = (typeof JLPT_ORDER)[number];

const isCefr = (value: string | null | undefined): value is CefrLevel => CEFR_ORDER.includes(value as CefrLevel);

/**
 * CEFR level of a TOEIC Listening + Reading total (ETS mapping: A2 from 225, B1 from 550, B2 from 785, C1 from 945)
 */
export function cefrOfToeic(score: number): CefrLevel {
  if (score >= 945) return 'C1';
  if (score >= 785) return 'B2';
  if (score >= 550) return 'B1';
  if (score >= 225) return 'A2';
  return 'A1';
}

/**
 * CEFR level of an IELTS overall band (4.0 B1, 5.5 B2, 7.0 C1, 8.5 C2)
 */
export function cefrOfIelts(band: number): CefrLevel {
  if (band >= 8.5) return 'C2';
  if (band >= 7) return 'C1';
  if (band >= 5.5) return 'B2';
  if (band >= 4) return 'B1';
  return band >= 3 ? 'A2' : 'A1';
}

/**
 * The level to work towards, as a CEFR level
 * - TOEIC or IELTS with a target score: the level that score corresponds to
 * - no exam: one level above the learner's own level (null when unknown or already at the top)
 */
export function targetCefr(exam: 'none' | 'toeic' | 'ielts', score: number | null, ownLevel: string | null): CefrLevel | null {
  if (exam === 'toeic' && score) return cefrOfToeic(score);
  if (exam === 'ielts' && score) return cefrOfIelts(score);
  if (exam === 'none' && isCefr(ownLevel)) return CEFR_ORDER[Math.min(CEFR_ORDER.indexOf(ownLevel) + 1, CEFR_ORDER.length - 1)];
  return null;
}

/**
 * The levels a learner needs to have covered to reach a target: everything up to and including it
 * (JLPT: from N5 up to the target)
 */
export function levelsUpTo<T extends string>(order: readonly T[], target: string | null): T[] {
  const index = order.indexOf(target as T);
  return index < 0 ? [...order] : order.slice(0, index + 1);
}
