import { describe, expect, it } from 'vitest';
import { decisionAfter, evaluate, loweredTargets, versionFor, withRetest } from './gateRules.js';
import { overallOf } from './bands.js';

const gate2 = { listening: 5, reading: 5, writing: 4.5, speaking: 4.5 };

describe('evaluate', () => {
  it('passes when every skill reaches its target', () => {
    expect(evaluate(2, gate2).outcome).toBe('pass');
    expect(evaluate(2, { listening: 6, reading: 6.5, writing: 5, speaking: 5 }).outcome).toBe('pass');
  });
  it('is conditional when exactly one skill is half a band short', () => {
    const result = evaluate(2, { ...gate2, writing: 4 });
    expect(result.outcome).toBe('conditional');
    expect(result.weak).toEqual(['writing']);
  });
  it('fails with two skills short, even by half a band', () => {
    expect(evaluate(2, { ...gate2, writing: 4, speaking: 4 }).outcome).toBe('fail');
  });
  it('fails with one skill a full band or more short', () => {
    expect(evaluate(2, { ...gate2, listening: 4 }).outcome).toBe('fail');
    expect(evaluate(2, { ...gate2, reading: 3.5 }).weak).toEqual(['reading']);
  });
  it('lists the weak skills with the furthest short first', () => {
    expect(evaluate(3, { listening: 4.5, reading: 5, writing: 4.5, speaking: 5 }).weak).toEqual(['listening', 'reading', 'writing']);
  });
  it('uses the targets of the gate asked', () => {
    expect(evaluate(1, { listening: 4.5, reading: 4.5, writing: 4, speaking: 4 }).outcome).toBe('pass');
    expect(evaluate(6, { listening: 7, reading: 7, writing: 6.5, speaking: 6.5 }).outcome).toBe('pass');
    expect(evaluate(6, { listening: 7, reading: 7, writing: 6, speaking: 6.5 }).outcome).toBe('conditional');
  });
});

describe('retest, versions and decisions', () => {
  it('takes the better band of a retest and keeps the rest', () => {
    expect(withRetest({ ...gate2, writing: 4 }, 'writing', 4.5).writing).toBe(4.5);
    expect(withRetest({ ...gate2, writing: 4 }, 'writing', 3.5).writing).toBe(4);
  });
  it('starts on version A and retakes on B', () => {
    expect(versionFor(0)).toBe('A');
    expect(versionFor(1)).toBe('B');
    expect(versionFor(2)).toBe('B');
  });
  it('after Gate 3 moves the exam to weeks 32-36 when a skill is short of 5.5 / 5.0', () => {
    const none = decisionAfter(3, { listening: 5.5, reading: 5.5, writing: 5, speaking: 5 }, '2026-11-10', null);
    expect(none).toBeNull();
    const move = decisionAfter(3, { listening: 5, reading: 5.5, writing: 5, speaking: 5 }, '2026-11-10', '2027-04-01');
    expect(move).toEqual({ kind: 'move-exam', from: '2027-04-01', earliest: '2027-06-22', latest: '2027-07-20' });
    expect(decisionAfter(3, { listening: 6, reading: 6, writing: 4.5, speaking: 5 }, '2026-11-10', null)?.kind).toBe('move-exam');
  });
  it('after Gate 4 suggests overall 6.5 when writing or speaking is under 5.5', () => {
    expect(decisionAfter(4, { listening: 6, reading: 6, writing: 5.5, speaking: 5.5 }, null, null)).toBeNull();
    expect(decisionAfter(4, { listening: 6, reading: 6, writing: 5, speaking: 5.5 }, null, null)).toEqual({ kind: 'lower-target', overall: 6.5 });
    expect(decisionAfter(5, { listening: 1, reading: 1, writing: 1, speaking: 1 }, null, null)).toBeNull();
  });
  it('lowers targets without raising any', () => {
    const lowered = loweredTargets({ listening: 7.5, reading: 7.5, writing: 6.5, speaking: 6.5 }, 6.5);
    expect(lowered).toEqual({ listening: 7, reading: 7, writing: 6, speaking: 6 });
    expect(overallOf(lowered)).toBe(6.5);
    expect(loweredTargets({ listening: 6, reading: 6, writing: 5.5, speaking: 5.5 }, 6.5)).toEqual({ listening: 6, reading: 6, writing: 5.5, speaking: 5.5 });
  });
});
