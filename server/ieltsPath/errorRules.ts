/**
 * Sorting a learner's mistakes, pure. A wrong listening answer is one of five kinds (the four of the syllabus plus
 * "misheard"); reading mistakes are counted by kind of question; writing and speaking are read from the four
 * criteria of the band descriptors. Gaps are told apart by how the answer differs from an accepted one.
 */
import { normalizeAnswer, type IeltsQuestion } from '../content/schemas.js';
import { isCorrect } from '../exams/ielts.js';

export const LISTENING_CATEGORIES = ['spelling', 'plural', 'distractor', 'misheard', 'missed'] as const;
export type ListeningCategory = (typeof LISTENING_CATEGORIES)[number];

/** Number of single-letter edits (insert, delete, change) between two strings */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

const isPluralPair = (a: string, b: string) => a !== b && (a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`);

/** Whether a normalised answer appears in the script as whole words (it was said, so it was a distractor) */
const appearsIn = (answer: string, script: string) => answer.length > 0 && ` ${normalizeAnswer(script)} `.includes(` ${answer} `);

/**
 * The kind of mistake of one listening answer, or null when it is right
 */
export function classifyListening(question: IeltsQuestion, answer: number | string | undefined, script: string): ListeningCategory | null {
  if (isCorrect(question, answer)) return null;
  const blank = answer === undefined || (typeof answer === 'string' && answer.trim() === '');
  if (blank) return 'missed';
  if (question.type !== 'gap') return 'distractor';

  const given = normalizeAnswer(String(answer));
  const accepted = question.answers.map(normalizeAnswer);
  if (accepted.some((a) => isPluralPair(a, given))) return 'plural';
  if (accepted.some((a) => a.length >= 4 && editDistance(a, given) <= 2)) return 'spelling';
  return appearsIn(given, script) ? 'distractor' : 'misheard';
}

/** The kinds a listening mistake falls into, counted */
export function tallyListening(items: (ListeningCategory | null)[]): { questions: number; wrong: number; byCategory: Record<ListeningCategory, number> } {
  const byCategory = Object.fromEntries(LISTENING_CATEGORIES.map((c) => [c, 0])) as Record<ListeningCategory, number>;
  for (const item of items) if (item) byCategory[item]++;
  return { questions: items.length, wrong: items.filter(Boolean).length, byCategory };
}

/** The most common mistake, when there are at least `min` of that kind */
export function topCategory(byCategory: Record<ListeningCategory, number>, min: number): ListeningCategory | null {
  const [best] = [...LISTENING_CATEGORIES].sort((a, b) => byCategory[b] - byCategory[a]);
  return byCategory[best] >= min ? best : null;
}

export interface TypeTally {
  type: IeltsQuestion['type'];
  correct: number;
  total: number;
}

/** The kind of question whose answers are wrong most often, with enough questions to say so */
export function weakestType(tallies: TypeTally[], minQuestions: number, below: number): TypeTally | null {
  const candidates = tallies.filter((t) => t.total >= minQuestions && t.correct / t.total < below);
  return candidates.sort((a, b) => a.correct / a.total - b.correct / b.total)[0] ?? null;
}

export interface CriterionBand {
  key: string;
  name: string;
  band: number;
}

/** Mean band of each criterion over several graded answers, in the order the criteria first appear */
export function averageCriteria(graded: CriterionBand[][]): CriterionBand[] {
  const sums = new Map<string, { name: string; total: number; n: number }>();
  for (const criteria of graded) {
    for (const c of criteria) {
      const entry = sums.get(c.key) ?? { name: c.name, total: 0, n: 0 };
      entry.total += c.band;
      entry.n += 1;
      sums.set(c.key, entry);
    }
  }
  return [...sums.entries()].map(([key, v]) => ({ key, name: v.name, band: Math.round((v.total / v.n) * 10) / 10 }));
}

/** The criterion with the lowest mean band (the first when tied) */
export const lowestCriterion = (criteria: CriterionBand[]): CriterionBand | null => criteria.reduce<CriterionBand | null>((low, c) => (low === null || c.band < low.band ? c : low), null);
