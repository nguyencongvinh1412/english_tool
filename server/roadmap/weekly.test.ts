import { describe, expect, it } from 'vitest';
import { buildStages, type Catalog, type PlanInput } from './plan.js';
import { lastFullWeek, summarize, weeklyGoals } from './weekly.js';

const catalog: Catalog = { words: { B1: 300 }, grammar: { B1: 24 } };
const input: PlanInput = { language: 'en', goalType: 'ielts', fromLevel: 'B1', targetLevel: 'B1', hoursPerWeek: 5, startDate: '2026-11-02', deadline: null, measured: false };
const stage = buildStages(input, catalog)[0];
const base = { weekStart: '2026-10-26', weekEnd: '2026-11-01', studyDays: 5, plannedDays: 6, minutes: 214, plannedMinutes: 300 };

describe('lastFullWeek', () => {
  it('is the Monday to Sunday before the current week', () => {
    // Tuesday 3 Nov 2026
    expect(lastFullWeek('2026-11-03')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    // A Monday and a Sunday belong to the weeks they are in
    expect(lastFullWeek('2026-11-02')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(lastFullWeek('2026-11-08')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
  });
});

describe('weeklyGoals', () => {
  it('divides the stage targets over its weeks, rounding up', () => {
    const goals = weeklyGoals(stage);
    expect(goals.words).toBe(Math.ceil(stage.objectives.vocabMastered / stage.weeks));
    expect(goals.sessions.listening).toBe(Math.ceil((stage.objectives.sessions.listening ?? 0) / stage.weeks));
  });
});

describe('summarize', () => {
  const goals = weeklyGoals(stage);
  const done = (over: Partial<Record<'listening' | 'reading' | 'writing' | 'speaking', number>>) => ({ words: goals.words, grammar: goals.grammar, sessions: { listening: goals.sessions.listening, reading: goals.sessions.reading, writing: goals.sessions.writing, speaking: goals.sessions.speaking, ...over } });

  it('is 100% with no suggestion when every target is met', () => {
    const review = summarize(stage, done({}), base);
    expect(review.percent).toBe(100);
    expect(review.suggestion).toBeNull();
    expect(review.weak).toBeNull();
  });

  it('names the best skill and suggests help for the one that fell behind', () => {
    const review = summarize(stage, done({ listening: (goals.sessions.listening ?? 0) + 2, writing: 0 }), base);
    expect(review.best).toBe('listening');
    expect(review.weak).toBe('writing');
    expect(review.suggestion).toEqual({ skill: 'writing', minutes: 15, days: 2 });
    expect(review.percent).toBeLessThan(100);
  });

  it('reports a quiet week as 0% without blame, and no best skill', () => {
    const review = summarize(stage, { words: 0, grammar: 0, sessions: {} }, base);
    expect(review.percent).toBe(0);
    expect(review.best).toBeNull();
  });
});
