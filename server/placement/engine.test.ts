import { describe, expect, it } from 'vitest';
import { currentSkill, estimate, initialState, nearestLevel, overallLevel, QUESTIONS_PER_SKILL, recordAnswer, targetLevel, type Asked } from './engine.js';

const asked = (...levels: [string, boolean][]): Asked[] => levels.map(([level, correct], i) => ({ id: `q${i}`, level, correct }));

describe('targetLevel', () => {
  it('starts at the learner\'s level and moves one step per answer', () => {
    expect(targetLevel('B1', [])).toBe('B1');
    expect(targetLevel('B1', asked(['B1', true]))).toBe('B2');
    expect(targetLevel('B1', asked(['B1', false]))).toBe('A2');
  });

  it('stays inside A1 to C2', () => {
    expect(targetLevel('A1', asked(['A1', false]))).toBe('A1');
    expect(targetLevel('C2', asked(['C2', true]))).toBe('C2');
  });
});

describe('nearestLevel', () => {
  it('uses the target when it has questions, else the closest level that does', () => {
    expect(nearestLevel('B1', () => true)).toBe('B1');
    expect(nearestLevel('B1', (l) => l === 'A2' || l === 'C1')).toBe('A2');
    expect(nearestLevel('B1', (l) => l === 'C1')).toBe('C1');
    expect(nearestLevel('B1', () => false)).toBeNull();
  });
});

describe('recordAnswer', () => {
  it('finishes a skill after its quota and moves on to the next skill', () => {
    let state = initialState('B1');
    expect(currentSkill(state)).toBe('vocabulary');
    for (let i = 0; i < QUESTIONS_PER_SKILL.vocabulary; i++) {
      state = { ...state, pending: { id: `v${i}`, skill: 'vocabulary', level: 'B1' } };
      state = recordAnswer(state, true);
    }
    expect(state.skills.vocabulary.done).toBe(true);
    expect(currentSkill(state)).toBe('grammar');
  });

  it('ignores an answer when nothing is pending', () => {
    const state = initialState('B1');
    expect(recordAnswer(state, true)).toBe(state);
  });
});

describe('estimate', () => {
  it('leaves a skill unmeasured with too few answers', () => {
    expect(estimate(asked(['B1', true], ['B2', true]))).toBeNull();
  });

  it('reads the level from where the last questions settled', () => {
    const result = estimate(asked(['B1', true], ['B2', true], ['C1', false], ['B2', true], ['B1', false], ['B2', true]));
    expect(result?.level).toBe('B2');
  });

  it('is more confident when the last questions stay close together', () => {
    const steady = estimate(asked(['B1', true], ['B2', false], ['B1', true], ['B2', false]));
    const wild = estimate(asked(['A1', true], ['A2', true], ['B1', true], ['C1', false]));
    expect(steady?.confidence).toBe('high');
    expect(wild?.confidence).not.toBe('high');
  });
});

describe('overallLevel', () => {
  it('rounds the mean of the measured skills down and ignores unmeasured ones', () => {
    expect(overallLevel({ vocabulary: { level: 'B1', confidence: 'high' }, grammar: { level: 'B2', confidence: 'high' }, reading: null })).toBe('B1');
    expect(overallLevel({ vocabulary: null })).toBeNull();
  });
});
