import { describe, expect, it } from 'vitest';
import { answerOf, buildKanaQuiz, kanaCells, toKatakana } from './kana';

describe('kana tables', () => {
  it('has the standard counts', () => {
    expect(kanaCells('hiragana', ['basic'])).toHaveLength(46);
    expect(kanaCells('hiragana', ['dakuten'])).toHaveLength(25);
    expect(kanaCells('hiragana', ['combo'])).toHaveLength(33);
  });

  it('derives katakana', () => {
    expect(toKatakana('きゃ')).toBe('キャ');
    expect(kanaCells('katakana', ['basic'])[0]).toEqual({ kana: 'ア', romaji: 'a' });
    expect(kanaCells('katakana', ['basic']).at(-1)).toEqual({ kana: 'ン', romaji: 'n' });
  });

  it('builds quizzes with four distinct options including the answer', () => {
    const quiz = buildKanaQuiz(kanaCells('hiragana', ['basic', 'dakuten']), 10);
    expect(quiz).toHaveLength(10);
    for (const question of quiz) {
      expect(new Set(question.options).size).toBe(4);
      expect(question.options).toContain(answerOf(question));
    }
    expect(quiz.filter((q) => q.type === 'listen')).toHaveLength(5);
  });
});
