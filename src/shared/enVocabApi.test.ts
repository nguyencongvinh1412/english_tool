import { describe, expect, it } from 'vitest';
import { choiceMeanings, formInExample, questionMode, sameWord } from './enVocabApi';

const card = (reps: number, example: string | null, term = 'decide') => ({ reps, lapses: 0, item: { term, example } as never });

describe('English vocabulary questions', () => {
  it('gets harder as a word is remembered and falls back when the example cannot be blanked', () => {
    expect(questionMode(card(0, 'We decided.'), false)).toBe('recognize');
    expect(questionMode(card(2, 'We decided.'), false)).toBe('recall');
    expect(questionMode(card(3, 'We decided.'), false)).toBe('listen');
    expect(questionMode(card(5, 'We decided.'), false)).toBe('cloze');
    expect(questionMode(card(5, 'He is late.', 'be'), false)).toBe('listen');
    expect(questionMode(card(5, 'We decided.'), true)).toBe('recognize');
  });

  it('finds the inflected form in the example and compares typed answers loosely', () => {
    expect(formInExample('She decided to stay.', 'decide')).toBe('decided');
    expect(formInExample('Two decisions were made.', 'decision')).toBe('decisions');
    expect(sameWord(' Decided. ', 'decided')).toBe(true);
  });
});

describe('choice meanings', () => {
  it('uses Vietnamese only when every choice is translated', () => {
    const item = { term: 'tea', meaningVi: 'trà', meaningsEn: ['a hot drink'] } as never;
    const translated = { term: 'a', meaningVi: 'một', meaningEn: 'one' };
    const untranslated = { term: 'b', meaningVi: null, meaningEn: 'two' };
    expect(choiceMeanings({ item, distractors: [translated, translated, translated] })).toEqual({ answer: 'trà', wrong: ['một', 'một', 'một'] });
    expect(choiceMeanings({ item, distractors: [translated, untranslated, translated] })).toEqual({ answer: 'a hot drink', wrong: ['one', 'two', 'one'] });
  });
});
