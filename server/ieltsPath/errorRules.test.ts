import { describe, expect, it } from 'vitest';
import type { IeltsQuestion } from '../content/schemas.js';
import { averageCriteria, classifyListening, editDistance, lowestCriterion, tallyListening, topCategory, weakestType } from './errorRules.js';

const gap = (answers: string[]): IeltsQuestion => ({ type: 'gap', prompt: 'Name: ____', answers, wordLimit: 2, explanation: 'x' });
const script = 'The class is on Tuesday. The fee is thirty five dollars and the teacher is Mr Harris. We meet in the library.';

describe('editDistance', () => {
  it('counts single-letter edits', () => {
    expect(editDistance('harris', 'harris')).toBe(0);
    expect(editDistance('harris', 'haris')).toBe(1);
    expect(editDistance('tuesday', 'thursday')).toBe(2);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('classifyListening', () => {
  const q = gap(['Harris']);
  it('is null for a right answer, however it is written', () => {
    expect(classifyListening(q, 'harris', script)).toBeNull();
    expect(classifyListening(q, ' HARRIS. ', script)).toBeNull();
  });
  it('a blank answer is missed', () => {
    expect(classifyListening(q, undefined, script)).toBe('missed');
    expect(classifyListening(q, '   ', script)).toBe('missed');
  });
  it('a near answer is a spelling mistake', () => {
    expect(classifyListening(q, 'Haris', script)).toBe('spelling');
    expect(classifyListening(q, 'Harrys', script)).toBe('spelling');
  });
  it('a missing or extra s is a plural mistake', () => {
    const books = gap(['books']);
    expect(classifyListening(books, 'book', script)).toBe('plural');
    expect(classifyListening(gap(['class']), 'classes', script)).toBe('plural');
  });
  it('a wrong answer that was said in the recording is a distractor, otherwise misheard', () => {
    expect(classifyListening(q, 'library', script)).toBe('distractor');
    expect(classifyListening(q, 'Smith', script)).toBe('misheard');
  });
  it('a wrong choice is a distractor, an empty one is missed', () => {
    const pick: IeltsQuestion = { type: 'match', prompt: 'x', options: ['a', 'b', 'c'], answerIndex: 1, explanation: 'y' };
    expect(classifyListening(pick, 2, script)).toBe('distractor');
    expect(classifyListening(pick, 1, script)).toBeNull();
    expect(classifyListening(pick, undefined, script)).toBe('missed');
  });
  it('short answers are not called spelling mistakes (too many words are near them)', () => {
    expect(classifyListening(gap(['35']), '36', script)).toBe('misheard');
  });
});

describe('tallies', () => {
  it('counts the kinds and finds the most common one', () => {
    const tally = tallyListening(['spelling', 'spelling', 'spelling', null, 'plural', 'missed', null]);
    expect(tally).toMatchObject({ questions: 7, wrong: 5 });
    expect(tally.byCategory.spelling).toBe(3);
    expect(topCategory(tally.byCategory, 3)).toBe('spelling');
    expect(topCategory(tally.byCategory, 4)).toBeNull();
  });
  it('finds the weakest kind of reading question, only with enough questions', () => {
    const tallies = [
      { type: 'tfng' as const, correct: 4, total: 10 },
      { type: 'gap' as const, correct: 9, total: 10 },
      { type: 'match' as const, correct: 0, total: 4 },
    ];
    expect(weakestType(tallies, 10, 0.6)?.type).toBe('tfng');
    expect(weakestType(tallies, 10, 0.3)).toBeNull();
    expect(weakestType([{ type: 'gap' as const, correct: 8, total: 10 }], 10, 0.6)).toBeNull();
  });
  it('averages the criteria of several graded answers and finds the lowest', () => {
    const graded = [
      [{ key: 'TR', name: 'Task Response', band: 5 }, { key: 'LR', name: 'Lexical Resource', band: 4.5 }],
      [{ key: 'TR', name: 'Task Response', band: 6 }, { key: 'LR', name: 'Lexical Resource', band: 4 }],
    ];
    const average = averageCriteria(graded);
    expect(average).toEqual([{ key: 'TR', name: 'Task Response', band: 5.5 }, { key: 'LR', name: 'Lexical Resource', band: 4.3 }]);
    expect(lowestCriterion(average)?.key).toBe('LR');
    expect(lowestCriterion([])).toBeNull();
  });
});
