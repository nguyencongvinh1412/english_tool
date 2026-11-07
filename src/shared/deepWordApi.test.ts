import { describe, expect, it } from 'vitest';
import { markIssues } from './deepWordApi';

describe('markIssues', () => {
  it('splits a sentence around the parts the AI flagged, numbered in the AI order', () => {
    const parts = markIssues('We optimizations the page yesterday.', [
      { text: 'yesterday', note: 'tense' },
      { text: 'optimizations', note: 'form' },
    ]);
    expect(parts).toEqual([{ text: 'We ' }, { text: 'optimizations', issue: 2 }, { text: ' the page ' }, { text: 'yesterday', issue: 1 }, { text: '.' }]);
  });

  it('skips a flagged text that is not in the sentence and overlapping marks', () => {
    expect(markIssues('A good sentence.', [{ text: 'missing', note: 'x' }])).toEqual([{ text: 'A good sentence.' }]);
    expect(markIssues('abcdef', [{ text: 'abcd', note: '1' }, { text: 'cdef', note: '2' }])).toEqual([{ text: 'abcd', issue: 1 }, { text: 'ef' }]);
  });
});
