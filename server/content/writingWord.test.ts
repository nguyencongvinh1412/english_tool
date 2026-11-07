import { describe, expect, it } from 'vitest';
import { writingFeedback } from './schemas.js';
import { writingScoringPrompt } from './scoring.js';

const criteria = ['a', 'b', 'c', 'd'].map((key) => ({ key, name: key, band: 6, comment: 'ok' }));
const base = { overallBand: 6, criteria, strengths: ['good'], improvements: ['more'], improvedVersion: 'text' };

describe('writing corrections that name a word to study', () => {
  it('accepts a vocabulary correction with the word, and one without', () => {
    const parsed = writingFeedback.parse({
      ...base,
      corrections: [
        { original: 'make a decision fast', corrected: 'make a quick decision', explanation: 'word choice', word: 'quick' },
        { original: 'he go', corrected: 'he goes', explanation: 'agreement' },
      ],
    });
    expect(parsed.corrections[0].word).toBe('quick');
    expect(parsed.corrections[1].word).toBeUndefined();
  });

  it('asks the AI for the word of a vocabulary mistake', () => {
    const task = { taskType: 'email', title: 't', instructions: 'i', prompt: 'p', minWords: 50 } as never;
    expect(writingScoringPrompt(task, 'Hello', 'en').user).toContain('"word"');
  });
});
