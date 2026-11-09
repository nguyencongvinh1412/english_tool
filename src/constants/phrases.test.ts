import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, PHRASES, SOUND_FOCUSES, getPhrases, pickPhrase } from './phrases';

describe('pronunciation phrases', () => {
  it('has unique ids and every sound group at every level', () => {
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(PHRASES.length);
    expect(PHRASES.length).toBeGreaterThanOrEqual(60);
    for (const focus of SOUND_FOCUSES) for (const level of DIFFICULTIES) expect(getPhrases(level, focus).length).toBeGreaterThanOrEqual(2);
  });

  it('shows every phrase of a pool once before any repeats', () => {
    const pool = getPhrases('easy');
    let seen: string[] = [];
    const shown: string[] = [];
    for (let i = 0; i < pool.length; i++) {
      const result = pickPhrase(pool, seen);
      expect(result.restarted).toBe(false);
      seen = result.seen;
      shown.push(result.phrase!.id);
    }
    expect(new Set(shown).size).toBe(pool.length);

    const next = pickPhrase(pool, seen, shown.at(-1));
    expect(next.restarted).toBe(true);
    expect(next.phrase!.id).not.toBe(shown.at(-1));
  });

  it('keeps the history of other pools when one starts over', () => {
    const hard = getPhrases('hard', 'th');
    const other = 'fc-e1';
    const result = pickPhrase(hard, [other, ...hard.map((p) => p.id)], hard[0].id, () => 0);
    expect(result.seen).toContain(other);
    expect(result.seen.filter((id) => hard.some((p) => p.id === id))).toEqual([result.phrase!.id]);
  });
});
