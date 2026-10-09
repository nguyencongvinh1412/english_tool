import { describe, expect, it } from 'vitest';
import { readingPassage, writingFeedback } from './schemas.js';

const feedback = {
  overallBand: 6,
  criteria: ['TR', 'CC', 'LR', 'GRA'].map((key) => ({ key, name: key, band: 6, comment: 'ok' })),
  strengths: ['a'],
  improvements: Array.from({ length: 8 }, (_, i) => `tip ${i}`),
  corrections: [],
  improvedVersion: 'better',
};

describe('content schemas', () => {
  it('trims over-long AI lists instead of rejecting them', () => {
    expect(writingFeedback.parse(feedback).improvements).toHaveLength(6);
  });

  it('still rejects lists below the minimum', () => {
    expect(writingFeedback.safeParse({ ...feedback, strengths: [] }).success).toBe(false);
  });

  it('requires at least 5 reading questions', () => {
    const question = { type: 'tfng', prompt: 'x', answer: 'true', explanation: 'y' };
    const passage = { title: 't', paragraphs: ['p1', 'p2'], questions: Array(4).fill(question) };
    expect(readingPassage.safeParse(passage).success).toBe(false);
    expect(readingPassage.safeParse({ ...passage, questions: Array(5).fill(question) }).success).toBe(true);
  });
});
