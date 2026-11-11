import { describe, expect, it } from 'vitest';
import { ieltsListening, ieltsReading, writingPrompt } from '../content/schemas.js';
import { isCorrect, markQuestions } from './ielts.js';
import type { IeltsQuestion } from '../content/schemas.js';

const ASSET = '0b4d6c3e-52a1-4f7a-9d1e-3f2a8c7b6e10';
const speakers = { A: { name: 'Speaker', gender: 'female' as const } };
const script = Array.from({ length: 10 }, (_, i) => ({ speaker: 'A' as const, text: `The answer is word${i} today.` }));
const gaps = Array.from({ length: 10 }, (_, i) => ({ type: 'gap' as const, prompt: `Item ____ ${i}`, answers: [`word${i}`], wordLimit: 1, explanation: 'Said in the talk.' }));

describe('recorded tests: audio, pictures and "choose two"', () => {
  it('accepts a listening section with a real recording, a plan and a matching question', () => {
    const match = { type: 'match' as const, prompt: 'Library', options: ['A', 'B', 'C', 'D', 'E'], answerIndex: 2, explanation: 'On the map.' };
    const group = { section: 2, title: 'Visit', context: 'You will hear a talk.', speakers, script, audio: { assetId: ASSET, start: 12.5, end: 400 }, image: { assetId: ASSET, alt: 'Plan of the site' }, questions: [...gaps.slice(0, 9), match] };
    const parsed = ieltsListening.safeParse(group);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('rejects an asset id that is not a uuid', () => {
    const group = { section: 1, title: 'T', context: 'C', speakers, script, audio: { assetId: 'track-1' }, questions: gaps };
    expect(ieltsListening.safeParse(group).success).toBe(false);
  });

  it('accepts a reading passage with a figure and a writing task with a picture and its transcribed data', () => {
    const q = { type: 'tfng' as const, prompt: 'A statement.', answer: 'true' as const, explanation: 'Because.' };
    const paragraphs = Array.from({ length: 4 }, () => 'One paragraph of the passage.');
    expect(ieltsReading.safeParse({ title: 'T', paragraphs, image: { assetId: ASSET, alt: 'A diagram' }, questions: Array(12).fill(q) }).success).toBe(true);
    const task = { taskType: 'ielts-task1' as const, title: 'Electricity', instructions: 'Write at least 150 words.', prompt: 'The bar chart below shows production and consumption.', minWords: 150, timeMinutes: 20, image: { assetId: ASSET, alt: 'Bar chart' }, figureData: 'China 5398 / 5322' };
    expect(writingPrompt.safeParse(task).success).toBe(true);
  });

  it('marks "choose TWO letters" in any order, once per letter, and the right letters only', () => {
    const set = (answerIndex: number): IeltsQuestion => ({ type: 'match', prompt: 'Which two?', options: ['a', 'b', 'c', 'd', 'e'], answerIndex, anyOf: [1, 3], explanation: 'x' });
    const items = [{ id: 'g:0', question: set(1) }, { id: 'g:1', question: set(3) }];
    expect(isCorrect(items[0].question, 3)).toBe(true);
    expect(markQuestions(items, { 'g:0': 1, 'g:1': 3 })).toEqual([true, true]);
    expect(markQuestions(items, { 'g:0': 3, 'g:1': 1 })).toEqual([true, true]);
    expect(markQuestions(items, { 'g:0': 1, 'g:1': 1 })).toEqual([true, false]);
    expect(markQuestions(items, { 'g:0': 1, 'g:1': 2 })).toEqual([true, false]);
  });

  it('keeps two different sets of the same group apart', () => {
    const q = (id: string, anyOf: number[], answerIndex: number) => ({ id, question: { type: 'match', prompt: 'p', options: ['a', 'b', 'c', 'd', 'e'], answerIndex, anyOf, explanation: 'x' } as IeltsQuestion });
    const items = [q('g:0', [0, 1], 0), q('g:1', [0, 1], 1), q('g:2', [0, 1], 0), q('g:3', [0, 1], 1)];
    // Four questions with the same list form one set here, so each letter counts once across them
    expect(markQuestions(items, { 'g:0': 0, 'g:1': 1, 'g:2': 0, 'g:3': 1 })).toEqual([true, true, false, false]);
    const split = [q('g:0', [0, 1], 0), q('g:1', [0, 1], 1), q('g:2', [2, 3], 2), q('g:3', [2, 3], 3)];
    expect(markQuestions(split, { 'g:0': 1, 'g:1': 0, 'g:2': 3, 'g:3': 2 })).toEqual([true, true, true, true]);
  });
});
