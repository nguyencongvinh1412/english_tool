import { describe, expect, it } from 'vitest';
import { buildPathPlan, endPhaseFor, meetsGate, minutesOn, overallOf, profileFor, startPhaseFor, SYLLABUS_WEEK_MINUTES, typicalDay, weekMinutes } from './bands.js';

describe('profileFor', () => {
  it('gives the syllabus profile for 7.0', () => {
    expect(profileFor(7)).toEqual({ listening: 7.5, reading: 7.5, writing: 6.5, speaking: 6.5 });
    expect(overallOf(profileFor(7))).toBe(7);
  });
  it('keeps the overall for other targets', () => {
    for (const overall of [5, 5.5, 6, 6.5]) expect(overallOf(profileFor(overall))).toBe(overall);
  });
});

describe('gates and phases', () => {
  it('meets a gate only when every measured skill reaches it', () => {
    expect(meetsGate({ listening: 5, reading: 5.5, writing: 4.5, speaking: 4.5 }, 2)).toBe(true);
    expect(meetsGate({ listening: 5, reading: 5.5, writing: 4.5, speaking: 4.5 }, 3)).toBe(false);
  });
  it('starts one phase after the highest gate met (plan example)', () => {
    expect(startPhaseFor({ listening: 5, reading: 5.5, writing: 4.5, speaking: 4.5 })).toBe(3);
  });
  it('starts in phase 1 below Gate 1', () => {
    expect(startPhaseFor({ listening: 3.5, reading: 4, writing: 3.5, speaking: 4 })).toBe(1);
  });
  it('starts one phase earlier when writing and speaking were skipped', () => {
    expect(startPhaseFor({ listening: 5, reading: 5.5, writing: null, speaking: null })).toBe(2);
    expect(startPhaseFor({ listening: 4, reading: 4, writing: null, speaking: null })).toBe(1);
  });
  it('returns 7 when every gate is met', () => {
    expect(startPhaseFor({ listening: 8, reading: 8, writing: 7, speaking: 7 })).toBe(7);
  });
  it('ends at the first gate that covers every target', () => {
    expect(endPhaseFor(profileFor(7))).toBe(6);
    // 6.5 / 6.5 / 5.5 / 5.5: listening and reading need Gate 5 (6.5)
    expect(endPhaseFor(profileFor(6))).toBe(5);
    expect(endPhaseFor({ listening: 6, reading: 6, writing: 5.5, speaking: 5.5 })).toBe(4);
    expect(endPhaseFor({ listening: 5, reading: 5, writing: 5, speaking: 5 })).toBe(3);
  });
});

describe('time settings', () => {
  const time = { dailyMinutes: 120, weekendMinutes: 300, restDays: [] as number[] };
  it('gives Saturday and Sunday the weekend minutes, a rest day none', () => {
    expect(minutesOn(time, '2026-11-13')).toBe(120); // Friday
    expect(minutesOn(time, '2026-11-14')).toBe(300); // Saturday
    expect(minutesOn(time, '2026-11-15')).toBe(300); // Sunday
    expect(minutesOn({ ...time, restDays: [0] }, '2026-11-15')).toBe(0);
    expect(minutesOn({ ...time, weekendMinutes: null }, '2026-11-14')).toBe(120);
  });
  it('adds up a week and averages a study day', () => {
    expect(weekMinutes(time)).toBe(5 * 120 + 2 * 300);
    expect(typicalDay(time)).toBe(Math.round(1200 / 7));
    expect(weekMinutes({ ...time, restDays: [0] })).toBe(5 * 120 + 300);
    expect(typicalDay({ ...time, restDays: [0] })).toBe(Math.round(900 / 6));
  });
});

describe('buildPathPlan', () => {
  const base = { startPhase: 1, endPhase: 6, restDays: [], startDate: '2026-11-10', examDate: null, measuredAll: true };
  it('takes 26 syllabus weeks from phase 1 to 6 at the standard pace', () => {
    const plan = buildPathPlan({ ...base, dailyMinutes: SYLLABUS_WEEK_MINUTES / 7 });
    expect(plan.syllabusWeeks).toBe(26);
    expect(plan.weeks.mid).toBeCloseTo(26);
    expect(plan.phaseEnds).toHaveLength(6);
  });
  it('stretches when the learner has less time', () => {
    const plan = buildPathPlan({ ...base, dailyMinutes: 120 });
    expect(plan.weeks.mid).toBeGreaterThan(40);
  });
  it('shortens the plan when the weekend has more minutes', () => {
    const usual = buildPathPlan({ ...base, dailyMinutes: 120 });
    const weekend = buildPathPlan({ ...base, dailyMinutes: 120, weekendMinutes: 300 });
    expect(weekend.weeks.mid).toBeLessThan(usual.weeks.mid);
    expect(weekend.weeks.mid).toBeCloseTo((usual.weeks.mid * 7 * 120) / (5 * 120 + 2 * 300), 5);
  });
  it('is only the final weeks when the target gate is already met', () => {
    const plan = buildPathPlan({ ...base, startPhase: 5, endPhase: 4, dailyMinutes: 240 });
    expect(plan.phases).toEqual([]);
    expect(plan.syllabusWeeks).toBe(2);
  });
  it('compares with the exam date and suggests fixes', () => {
    const hard = buildPathPlan({ ...base, dailyMinutes: 120, examDate: '2027-05-10' });
    expect(hard.feasibility).toBe('hard');
    expect(hard.fixes?.dailyMinutes).toBeGreaterThan(120);
    const ok = buildPathPlan({ ...base, dailyMinutes: 240, examDate: '2027-12-31' });
    expect(ok.feasibility).toBe('ok');
    expect(ok.fixes).toBeNull();
  });
});
