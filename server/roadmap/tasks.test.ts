import { describe, expect, it } from 'vitest';
import type { TodayTask } from '../progress/today.js';
import { byPriority, MAX_ROLLED, pickCarryOver, taskIdentity } from './tasks.js';

const skill = (name: 'listening' | 'reading' | 'writing'): TodayTask => ({ id: `skill-${name}`, type: 'practice-skill', skill: name, minutes: 15, done: false });
const review: TodayTask = { id: 'review-words', type: 'review-words', count: 10, minutes: 5, done: false };
const grammar: TodayTask = { id: 'grammar-a', type: 'learn-grammar', pointId: 'a', level: 'B1', minutes: 12, done: false };

describe('pickCarryOver', () => {
  it('carries unfinished learning tasks but never reviews', () => {
    const previous = [{ task: review }, { task: skill('reading') }, { task: grammar }];
    expect(pickCarryOver(previous, []).map((r) => r.task.id)).toEqual(['skill-reading', 'grammar-a']);
  });

  it('skips a task that today already has', () => {
    expect(pickCarryOver([{ task: skill('reading') }], [skill('reading')])).toEqual([]);
  });

  it('carries at most a few tasks, and each thing once', () => {
    const previous = [{ task: skill('reading') }, { task: skill('reading') }, { task: skill('listening') }, { task: skill('writing') }, { task: grammar }];
    const picked = pickCarryOver(previous, []);
    expect(picked).toHaveLength(MAX_ROLLED);
    expect(new Set(picked.map((r) => taskIdentity(r.task))).size).toBe(MAX_ROLLED);
  });
});

describe('byPriority', () => {
  it('puts reviews first, then carried tasks, then the rest', () => {
    const carried = { ...skill('reading'), rolledFrom: '2026-11-01' };
    const sorted = [skill('listening'), carried, grammar, review].sort(byPriority);
    expect(sorted.map((t) => t.id)).toEqual(['review-words', 'skill-reading', 'grammar-a', 'skill-listening']);
  });
});
