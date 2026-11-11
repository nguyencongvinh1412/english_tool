/**
 * The real tests (imported from books with npm run book:import, ids book-<book>-t<n>-...) and what each is kept for.
 * A test kept for a gate or a mock week is never used as ordinary practice, so it is new to the learner on the day.
 * Tests of a book that is not imported yet are skipped: the gates and mock weeks fall back to the generated exercises.
 */

/** Listening and Reading of Gates 5 and 6, version A (first try) and B (retake); Writing and Speaking come from the gate book */
export const GATE_REAL_TESTS: Record<number, Record<'A' | 'B', string>> = {
  5: { A: 'c17-t1', B: 'c17-t2' },
  6: { A: 'c13-t3', B: 'c13-t4' },
};

/** The whole-test mock weeks of phase 6 (weeks 21 and 23) */
export const MOCK_REAL_TESTS = { 21: 'c17-t3', 23: 'c17-t4' } as const;

/** Tests practice must leave alone */
export const RESERVED_TESTS: string[] = [...Object.values(GATE_REAL_TESTS).flatMap((t) => [t.A, t.B]), ...Object.values(MOCK_REAL_TESTS)];

/** The `part` value of a real test's groups */
export const testPart = (test: string): string => `book:${test}`;

/** Ids of the groups of a real test */
export const testGroups = (test: string) => ({
  listening: [1, 2, 3, 4].map((n) => `book-${test}-l${n}`),
  reading: [1, 2, 3].map((n) => `book-${test}-r${n}`),
  writing: [`book-${test}-w1`, `book-${test}-w2`],
  speaking: [`book-${test}-s`],
});
