import { describe, expect, it } from 'vitest';
import { grade } from './checkpoint.js';

const run = (skill: 'vocabulary' | 'grammar' | 'reading' | 'listening', right: number, wrong: number) => [
  ...Array.from({ length: right }, () => ({ skill, correct: true })),
  ...Array.from({ length: wrong }, () => ({ skill, correct: false })),
];

describe('grade', () => {
  it('passes at 70% overall with no skill under 50%', () => {
    const result = grade([...run('vocabulary', 5, 0), ...run('grammar', 4, 1), ...run('reading', 2, 2), ...run('listening', 3, 1)]);
    // 14 of 18
    expect(result.overall).toBeCloseTo(14 / 18);
    expect(result.passed).toBe(true);
    expect(result.skills.reading).toMatchObject({ score: 0.5, verdict: 'near' });
    expect(result.weak).toEqual(['reading']);
  });

  it('fails when one skill is under 50% even if the total is high', () => {
    const result = grade([...run('vocabulary', 5, 0), ...run('grammar', 5, 0), ...run('reading', 1, 3), ...run('listening', 4, 0)]);
    expect(result.overall).toBeGreaterThanOrEqual(0.7);
    expect(result.skills.reading?.verdict).toBe('low');
    expect(result.passed).toBe(false);
  });

  it('fails when the total is under 70%', () => {
    const result = grade([...run('vocabulary', 3, 2), ...run('grammar', 3, 2), ...run('reading', 2, 2), ...run('listening', 2, 2)]);
    expect(result.overall).toBeLessThan(0.7);
    expect(result.passed).toBe(false);
    // Everything was at least 50%, so each is "near", ordered from the weakest
    expect(result.weak).toHaveLength(4);
  });

  it('never passes with no answers', () => {
    expect(grade([]).passed).toBe(false);
  });
});
