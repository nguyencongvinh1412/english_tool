/**
 * When a deeply studied word is reviewed again: 1, 3, 7, 14 and 30 days after the last good review.
 */
export const LADDER_DAYS = [1, 3, 7, 14, 30] as const;
const DAY_MS = 86_400_000;

/** Review kinds, from easiest to hardest */
export const REVIEW_KINDS = ['recall', 'cloze', 'fix', 'sentence'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

/**
 * The ladder position and due date after a review. `step` is the interval just waited (0 is one day). A good review
 * moves up one step and waits that interval; a poor one moves down one (never below the first) and is due again after
 * the first interval.
 */
export function nextReview(step: number, good: boolean, now: Date): { step: number; dueAt: Date } {
  const next = good ? Math.min(step + 1, LADDER_DAYS.length - 1) : Math.max(step - 1, 0);
  const days = good ? LADDER_DAYS[next] : LADDER_DAYS[0];
  return { step: next, dueAt: new Date(now.getTime() + days * DAY_MS) };
}

/** The days a first completion schedules, shown at the end of a session */
export const firstSchedule = (from: Date): Date[] => LADDER_DAYS.slice(0, 4).map((days) => new Date(from.getTime() + days * DAY_MS));

/** A review that was neither good nor poor (the learner was helped): the same interval again */
export function repeatReview(step: number, now: Date): { step: number; dueAt: Date } {
  return { step, dueAt: new Date(now.getTime() + LADDER_DAYS[Math.min(step, LADDER_DAYS.length - 1)] * DAY_MS) };
}
