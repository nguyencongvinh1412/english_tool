import { describe, expect, it } from 'vitest';
import { computeStreak, computeXp } from './progress.js';

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-10-07', '2026-10-08', '2026-10-09'], '2026-10-09')).toEqual({
      current: 3,
      best: 3,
      activeToday: true,
    });
  });

  it('keeps the streak alive until the end of the next day', () => {
    expect(computeStreak(['2026-10-07', '2026-10-08'], '2026-10-09')).toMatchObject({ current: 2, activeToday: false });
  });

  it('resets after a missed day but remembers the best run', () => {
    expect(computeStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-07'], '2026-10-09')).toEqual({
      current: 0,
      best: 3,
      activeToday: false,
    });
  });

  it('handles duplicates, unsorted input, and month boundaries', () => {
    expect(computeStreak(['2026-11-01', '2026-10-31', '2026-10-31', '2026-10-30'], '2026-11-01')).toMatchObject({
      current: 3,
      best: 3,
    });
  });

  it('returns zeros with no practice', () => {
    expect(computeStreak([], '2026-10-09')).toEqual({ current: 0, best: 0, activeToday: false });
  });
});

describe('computeXp', () => {
  it('gives completion XP plus a bonus at 80% or more', () => {
    expect(computeXp(null, null)).toBe(10);
    expect(computeXp(7, 10)).toBe(10);
    expect(computeXp(8, 10)).toBe(15);
  });
});
