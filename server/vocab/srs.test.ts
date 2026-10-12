import { describe, expect, it } from 'vitest';
import { NEW_CARD, previews, schedule } from './srs.js';

const now = new Date('2026-10-12T00:00:00Z');
const minutes = (date: Date) => (date.getTime() - now.getTime()) / 60_000;

describe('spaced repetition', () => {
  it('walks a new card through the learning steps, then graduates it', () => {
    const step1 = schedule(NEW_CARD, 'good', now);
    expect(step1).toMatchObject({ state: 'learning', reps: 1 });
    expect(minutes(step1.dueAt)).toBe(10);

    const graduated = schedule(step1, 'good', now);
    expect(graduated).toMatchObject({ state: 'review', intervalDays: 1 });
    expect(minutes(graduated.dueAt)).toBe(24 * 60);

    expect(schedule(NEW_CARD, 'easy', now)).toMatchObject({ state: 'review', intervalDays: 4 });
    expect(minutes(schedule(NEW_CARD, 'again', now).dueAt)).toBe(1);
  });

  it('grows intervals with ease and sends forgotten cards back to learning', () => {
    const card = { state: 'review' as const, reps: 3, intervalDays: 10, ease: 2.5, lapses: 0 };
    expect(schedule(card, 'good', now).intervalDays).toBe(25);
    expect(schedule(card, 'hard', now)).toMatchObject({ intervalDays: 12, ease: 2.35 });
    expect(schedule(card, 'easy', now).intervalDays).toBe(32.5);

    const forgotten = schedule(card, 'again', now);
    expect(forgotten).toMatchObject({ state: 'learning', lapses: 1, ease: 2.3, intervalDays: 5 });
    // Relearned cards come back at their kept interval, not at one day
    expect(schedule(schedule(forgotten, 'good', now), 'good', now).intervalDays).toBe(5);
  });

  it('never lets ease drop below 1.3 and previews each button', () => {
    let card = { state: 'review' as const, reps: 1, intervalDays: 3, ease: 1.35, lapses: 0 };
    card = { ...schedule(card, 'hard', now), state: 'review' };
    expect(card.ease).toBe(1.3);
    expect(previews(NEW_CARD, now)).toEqual({ again: 1, hard: 6, good: 10, easy: 4 * 24 * 60 });
  });
});
