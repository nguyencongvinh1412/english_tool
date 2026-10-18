import { describe, expect, it } from 'vitest';
import { cefrOfIelts, cefrOfToeic, levelsUpTo, targetCefr, CEFR_ORDER, JLPT_ORDER } from './levels.js';

describe('levels', () => {
  it('maps TOEIC totals to CEFR', () => {
    expect([100, 225, 549, 550, 784, 785, 944, 945].map(cefrOfToeic)).toEqual(['A1', 'A2', 'A2', 'B1', 'B1', 'B2', 'B2', 'C1']);
  });

  it('maps IELTS bands to CEFR', () => {
    expect([2.5, 3, 4, 5, 5.5, 6.5, 7, 8.5].map(cefrOfIelts)).toEqual(['A1', 'A2', 'B1', 'B1', 'B2', 'B2', 'C1', 'C2']);
  });

  it('picks the target level', () => {
    expect(targetCefr('toeic', 700, 'A2')).toBe('B1');
    expect(targetCefr('ielts', 6.5, null)).toBe('B2');
    expect(targetCefr('none', null, 'B1')).toBe('B2');
    expect(targetCefr('none', null, 'C2')).toBe('C2');
    expect(targetCefr('none', null, null)).toBeNull();
    expect(targetCefr('toeic', null, null)).toBeNull();
  });

  it('takes the levels up to a target, or all of them', () => {
    expect(levelsUpTo(CEFR_ORDER, 'B1')).toEqual(['A1', 'A2', 'B1']);
    expect(levelsUpTo(JLPT_ORDER, 'N3')).toEqual(['N5', 'N4', 'N3']);
    expect(levelsUpTo(CEFR_ORDER, null)).toEqual([...CEFR_ORDER]);
  });
});
