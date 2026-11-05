import { describe, expect, it } from 'vitest';
import { fitToBudget, type TodayTask } from './today.js';

const task = (id: string, minutes: number): TodayTask => ({ id, type: 'review-words', count: 1, minutes, done: false });

describe('fitToBudget', () => {
  it('keeps everything that fits and reports nothing carried over', () => {
    const { tasks, carried } = fitToBudget([task('a', 10), task('b', 12), task('c', 15)], 45);
    expect(tasks.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(carried).toBe(0);
  });

  it('always keeps the first task, shortened if the budget is smaller', () => {
    const { tasks } = fitToBudget([task('a', 10), task('b', 12)], 5);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: 'a', minutes: 5, shortened: true });
  });

  it('shortens the next task to the minutes left when at least 5 remain', () => {
    const { tasks, carried } = fitToBudget([task('a', 10), task('b', 12), task('c', 8)], 15);
    expect(tasks.map((t) => [t.id, t.minutes])).toEqual([
      ['a', 10],
      ['b', 5],
    ]);
    expect(tasks[1].shortened).toBe(true);
    expect(carried).toBe(1);
  });

  it('leaves out a task when fewer than 5 minutes remain', () => {
    const { tasks, carried } = fitToBudget([task('a', 8), task('b', 12)], 10);
    expect(tasks.map((t) => t.id)).toEqual(['a']);
    expect(carried).toBe(1);
  });

  it('never exceeds the budget', () => {
    const { tasks } = fitToBudget([task('a', 10), task('b', 12), task('c', 15), task('d', 6)], 20);
    expect(tasks.reduce((n, t) => n + t.minutes, 0)).toBeLessThanOrEqual(20);
  });
});
