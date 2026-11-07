import { describe, expect, it } from 'vitest';
import { blank, clozePool, formIn, normalize, pickKind, sameSentence, sameWord, type KindContext } from './review.js';

const all = { recall: true, cloze: true, fix: true, sentence: true };
const ctx = (over: Partial<KindContext> = {}): KindContext => ({ step: 0, lastKind: null, lastGood: null, needsSentence: false, available: all, ...over });

describe('pickKind', () => {
  it('gets harder with each step', () => {
    expect(pickKind(ctx({ step: 0 }))).toBe('recall');
    expect(pickKind(ctx({ step: 1, lastKind: 'recall', lastGood: true }))).toBe('cloze');
    expect(pickKind(ctx({ step: 2, lastKind: 'cloze', lastGood: true }))).toBe('fix');
    expect(pickKind(ctx({ step: 3, lastKind: 'fix', lastGood: true }))).toBe('sentence');
  });

  it('never repeats the last kind when another is available', () => {
    expect(pickKind(ctx({ step: 4, lastKind: 'sentence', lastGood: true }))).toBe('fix');
    expect(pickKind(ctx({ step: 0, lastKind: 'recall', lastGood: true }))).toBe('cloze');
  });

  it('goes one kind easier after a poor review', () => {
    expect(pickKind(ctx({ step: 3, lastKind: 'sentence', lastGood: false }))).toBe('fix');
    expect(pickKind(ctx({ step: 2, lastKind: 'fix', lastGood: false }))).toBe('cloze');
  });

  it('skips kinds that are not available, and asks for a sentence when the learner has not written one', () => {
    expect(pickKind(ctx({ step: 3, lastKind: 'fix', available: { ...all, sentence: false } }))).toBe('cloze');
    expect(pickKind(ctx({ step: 0, needsSentence: true }))).toBe('sentence');
    expect(pickKind(ctx({ available: { recall: true, cloze: false, fix: false, sentence: false }, step: 2, lastKind: 'recall' }))).toBe('recall');
  });
});

describe('answers', () => {
  it('ignores case, quotes and end punctuation', () => {
    expect(normalize('  “We stayed  within budget.” ')).toBe('we stayed within budget');
    expect(sameSentence('we stayed within budget', 'We stayed within budget.')).toBe(true);
    expect(sameSentence('We stay within budget', 'We stayed within budget.')).toBe(false);
  });

  it('accepts the word or its form in the sentence', () => {
    expect(sameWord('Budgets', 'budget', 'budgets')).toBe(true);
    expect(sameWord('budget', 'budget')).toBe(true);
    expect(sameWord('cost', 'budget')).toBe(false);
  });

  it('finds the word in a sentence and blanks it', () => {
    expect(formIn('We optimized the page.', 'optimize')).toBe('optimized');
    expect(blank('We optimized the page.', 'optimize')).toEqual({ text: 'We _____ the page.', answer: 'optimized' });
    expect(blank('Nothing here.', 'optimize')).toBeNull();
  });

  it('builds a pool of sentences that contain the word, without repeats', () => {
    const pool = clozePool('budget', 'The budget is tight.', null, [{ text: 'The budget is tight.' }, { text: 'No match here.' }, { text: 'Set a budget.', vi: 'x' }], [{ example: 'We work with a tight budget.' }]);
    expect(pool.map((p) => p.text)).toEqual(['The budget is tight.', 'Set a budget.', 'We work with a tight budget.']);
  });
});
