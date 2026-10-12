import { describe, expect, it } from 'vitest';
import { jaText, readingPassage, writingFeedback } from './schemas.js';

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

describe('Japanese text', () => {
  it('needs a kana reading for every kanji run', () => {
    const schema = jaText(100);
    expect(schema.safeParse('今日{きょう}は暑{あつ}いですね。').success).toBe(true);
    expect(schema.safeParse('カタカナとひらがなだけ').success).toBe(true);
    expect(schema.safeParse('今日は暑{あつ}いですね。').success).toBe(false);
    // Readings must be kana, not romaji or kanji
    expect(schema.safeParse('今日{kyou}は').success).toBe(false);
    expect(schema.safeParse('日本{日本}').success).toBe(false);
  });
});

describe('built-in Japanese lessons', () => {
  it('pass their schemas, so every kanji has a reading', async () => {
    const { JA_SEED_ITEMS } = await import('./seedsJa.js');
    const { CONTENT_KINDS } = await import('./schemas.js');
    for (const seed of JA_SEED_ITEMS) {
      const result = CONTENT_KINDS[seed.kind].schema.safeParse(seed.payload);
      expect(result.success, `${seed.id}: ${result.success ? '' : JSON.stringify(result.error.issues[0])}`).toBe(true);
    }
  });
});
