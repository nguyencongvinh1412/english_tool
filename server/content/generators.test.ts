import { describe, expect, it } from 'vitest';
import { buildGenerationPrompt } from './generators.js';

describe('buildGenerationPrompt', () => {
  it('leaves the prompt alone without earlier exercises', () => {
    const prompt = buildGenerationPrompt('listening-quiz', 'B1', 'travel', undefined);
    expect(prompt.user).toContain('Topic: travel');
    expect(prompt.user).not.toContain('already did');
  });

  it('asks for something different when earlier exercises are listed', () => {
    const prompt = buildGenerationPrompt('listening-quiz', 'B1', 'travel', undefined, ['At the station', 'Lost "luggage"']);
    expect(prompt.user).toContain('Topic: travel');
    expect(prompt.user).toContain('The learner already did: "At the station", "Lost \'luggage\'"');
  });

  it('works for Japanese kinds too', () => {
    const prompt = buildGenerationPrompt('ja-listening', 'N4', undefined, undefined, ['駅で']);
    expect(prompt.user).toContain('The learner already did: "駅で"');
  });
});
