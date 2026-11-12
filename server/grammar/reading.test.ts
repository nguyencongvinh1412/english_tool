import { describe, expect, it } from 'vitest';
import { GRAMMAR_POINTS } from './map.js';
import { readMoreUnits } from './reading.js';

describe('where to read more about a grammar point', () => {
  it('names units for most points, only real points and unit numbers of the book', () => {
    const covered = GRAMMAR_POINTS.filter((p) => readMoreUnits(p.id).length > 0);
    expect(covered.length).toBeGreaterThan(GRAMMAR_POINTS.length * 0.8);
    for (const point of GRAMMAR_POINTS) for (const unit of readMoreUnits(point.id)) expect(Number.isInteger(unit) && unit >= 1 && unit <= 145, `${point.id} ${unit}`).toBe(true);
    expect(readMoreUnits('present-perfect')).toContain(7);
    expect(readMoreUnits('not-a-point')).toEqual([]);
  });
});
