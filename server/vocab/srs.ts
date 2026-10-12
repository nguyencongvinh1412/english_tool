/**
 * Spaced repetition (SM-2 style, as in Anki)
 * New and forgotten cards go through short learning steps; learned cards get growing intervals
 * scaled by a per-card ease. Pure functions, so scheduling is easy to test.
 */

export const GRADES = ['again', 'hard', 'good', 'easy'] as const;
export type Grade = (typeof GRADES)[number];

/** Learning steps in minutes */
const LEARNING_STEPS_MIN = [1, 10];
const GRADUATING_INTERVAL_DAYS = 1;
const EASY_INTERVAL_DAYS = 4;
const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 3650;
/** A card counts as mastered once its interval reaches three weeks */
export const MASTERED_DAYS = 21;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface CardState {
  state: 'learning' | 'review';
  /** Learning step index (learning) or number of successful reviews (review) */
  reps: number;
  intervalDays: number;
  ease: number;
  lapses: number;
}

export const NEW_CARD: CardState = { state: 'learning', reps: 0, intervalDays: 0, ease: 2.5, lapses: 0 };

/**
 * Next state and due time after an answer
 */
export function schedule(card: CardState, grade: Grade, now: Date): CardState & { dueAt: Date } {
  const at = (ms: number) => new Date(now.getTime() + ms);
  const days = (n: number) => Math.min(MAX_INTERVAL_DAYS, Math.round(n * 100) / 100);

  if (card.state === 'learning') {
    // A relearning card keeps the interval it had (halved when it was forgotten)
    const graduated = (interval: number, ease = card.ease) => {
      const intervalDays = days(Math.max(interval, card.intervalDays || 0));
      return { state: 'review' as const, reps: 0, intervalDays, ease, lapses: card.lapses, dueAt: at(intervalDays * DAY_MS) };
    };
    switch (grade) {
      case 'again':
        return { ...card, reps: 0, dueAt: at(LEARNING_STEPS_MIN[0] * MINUTE_MS) };
      case 'hard': {
        const step = LEARNING_STEPS_MIN[card.reps] ?? LEARNING_STEPS_MIN.at(-1)!;
        return { ...card, dueAt: at(((step + (LEARNING_STEPS_MIN[card.reps + 1] ?? step)) / 2) * MINUTE_MS) };
      }
      case 'good':
        if (card.reps + 1 < LEARNING_STEPS_MIN.length) {
          return { ...card, reps: card.reps + 1, dueAt: at(LEARNING_STEPS_MIN[card.reps + 1] * MINUTE_MS) };
        }
        return graduated(GRADUATING_INTERVAL_DAYS);
      case 'easy':
        return graduated(EASY_INTERVAL_DAYS, card.ease + 0.15);
    }
  }

  const interval = card.intervalDays;
  switch (grade) {
    case 'again':
      return {
        state: 'learning',
        reps: 0,
        intervalDays: days(Math.max(1, interval * 0.5)),
        ease: Math.max(MIN_EASE, card.ease - 0.2),
        lapses: card.lapses + 1,
        dueAt: at(LEARNING_STEPS_MIN[1] * MINUTE_MS),
      };
    case 'hard': {
      const next = days(Math.max(interval + 1, interval * 1.2));
      return { ...card, reps: card.reps + 1, intervalDays: next, ease: Math.max(MIN_EASE, card.ease - 0.15), dueAt: at(next * DAY_MS) };
    }
    case 'good': {
      const next = days(Math.max(interval + 1, interval * card.ease));
      return { ...card, reps: card.reps + 1, intervalDays: next, dueAt: at(next * DAY_MS) };
    }
    case 'easy': {
      const next = days(Math.max(interval + 1, interval * card.ease * 1.3));
      return { ...card, reps: card.reps + 1, intervalDays: next, ease: card.ease + 0.15, dueAt: at(next * DAY_MS) };
    }
  }
}

/**
 * Time until the card comes back for each answer, in minutes, for the buttons
 */
export function previews(card: CardState, now: Date): Record<Grade, number> {
  return Object.fromEntries(GRADES.map((grade) => [grade, Math.round((schedule(card, grade, now).dueAt.getTime() - now.getTime()) / MINUTE_MS)])) as Record<
    Grade,
    number
  >;
}
