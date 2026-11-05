import { describe, expect, it } from 'vitest';
import { buildStages, type Catalog, type PlanInput } from './plan.js';
import { computeProgress } from './service.js';

const catalog: Catalog = { words: { B1: 300 }, grammar: { B1: 24 } };
const input: PlanInput = { language: 'en', goalType: 'toeic', fromLevel: 'B1', targetLevel: 'B1', hoursPerWeek: 5, startDate: '2026-11-02', deadline: null, measured: false };
const stages = buildStages(input, catalog);
const none = { masteredWords: {}, goodGrammar: {}, sessionsBySkill: {}, mockTests: 0 };

describe('computeProgress', () => {
  it('starts at zero on the first stage', () => {
    const p = computeProgress(stages, none);
    expect(p.overall).toBe(0);
    expect(p.current).toBe(0);
  });

  it('counts mastered words and good grammar points against each stage', () => {
    const p = computeProgress(stages, { ...none, masteredWords: { B1: 105 }, goodGrammar: { B1: 10 } });
    // The foundation stage asks for half of 70% of 300 words (105) and half of 80% of 24 points (10)
    expect(p.stages[0].vocab).toEqual({ have: 105, goal: 105 });
    expect(p.stages[0].grammar.have).toBe(10);
    expect(p.stages[1].progress).toBeGreaterThan(0);
    expect(p.stages[1].progress).toBeLessThan(1);
  });

  it('spends practice sessions on earlier stages first', () => {
    const goal = stages[0].objectives.sessions.listening!;
    const p = computeProgress(stages, { ...none, sessionsBySkill: { listening: goal + 2 } });
    expect(p.stages[0].sessions.find((s) => s.skill === 'listening')).toMatchObject({ have: goal, goal });
    expect(p.stages[1].sessions.find((s) => s.skill === 'listening')!.have).toBe(2);
  });

  it('moves to the next stage once one is complete and needs a mock test to finish the last', () => {
    const full = { masteredWords: { B1: 300 }, goodGrammar: { B1: 24 }, sessionsBySkill: { listening: 999, reading: 999 }, mockTests: 0 };
    const p = computeProgress(stages, full);
    expect(p.stages[0].progress).toBe(1);
    expect(p.stages[1].progress).toBe(1);
    expect(p.current).toBe(2);
    expect(p.overall).toBeLessThan(1);
    expect(computeProgress(stages, { ...full, mockTests: 1 }).overall).toBe(1);
  });
});

describe('weighted progress', () => {
  it('counts each kind of work by its weight', () => {
    // Only vocabulary done: 10% of the weight under TOEIC-style weights, 50% when words and grammar weigh the same
    const counts = { ...none, masteredWords: { B1: 105 } };
    const equal = computeProgress(stages, counts);
    const toeic = computeProgress(stages, counts, undefined, { vocabulary: 10, grammar: 20, listening: 35, reading: 35 });
    expect(toeic.stages[0].progress).toBeLessThan(equal.stages[0].progress);
    expect(toeic.stages[0].progress).toBeGreaterThan(0);
  });

  it('gives a part with no weight the average weight, so nothing drops out', () => {
    const counts = { ...none, masteredWords: { B1: 105 }, goodGrammar: { B1: 10 } };
    const p = computeProgress(stages, counts, undefined, { vocabulary: 30 });
    expect(p.stages[0].progress).toBeGreaterThan(0);
    expect(p.stages[0].progress).toBeLessThanOrEqual(1);
  });
});
