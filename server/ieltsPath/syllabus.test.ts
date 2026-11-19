import { describe, expect, it } from 'vitest';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { GATE_REAL_TESTS, MOCK_REAL_TESTS, RESERVED_TESTS } from './realTests.js';
import { BLOCKS, LESSONS, phaseSteps, WRITTEN_PHASES, type Step } from './syllabus.js';

const allSteps = WRITTEN_PHASES.flatMap((phase) => phaseSteps(phase));
const steps = phaseSteps(1);
const dayKey = (s: Step) => `${s.week}-${s.day}`;

describe('phase 1 syllabus', () => {
  it('covers four weeks of six study days and a review day', () => {
    const days = new Set(steps.map(dayKey));
    for (const week of [1, 2, 3, 4]) for (const day of [1, 2, 3, 4, 5, 6, 7]) expect(days.has(`${week}-${day}`), `${week}-${day}`).toBe(true);
  });

  it('every study day has all five blocks', () => {
    for (let week = 1; week <= 4; week++) {
      for (let day = 1; day <= 6; day++) {
        const blocks = new Set(steps.filter((s) => s.week === week && s.day === day).map((s) => s.block));
        for (const block of BLOCKS) {
          if (block === 'writing' && [3, 5].includes(day) && !(week === 4 && day === 3)) continue; // writing is on 3 days a week
          expect(blocks.has(block), `week ${week} day ${day} ${block}`).toBe(true);
        }
      }
    }
  });

  it('uses grammar points and lessons that exist', () => {
    const points = new Set(GRAMMAR_POINTS.map((p) => p.id));
    const lessons = new Set(LESSONS.map((l) => l.id));
    for (const s of steps) {
      if (s.kind === 'grammar') expect(points.has((s.ref as { pointId: string }).pointId), JSON.stringify(s.ref)).toBe(true);
      if (s.kind === 'lesson') expect(lessons.has((s.ref as { lessonId: string }).lessonId), JSON.stringify(s.ref)).toBe(true);
    }
  });

  // 280 minutes: dictation is a 15-minute core step in phases 1-3
  it('keeps a study day between 2.3 and 4.7 hours (lighter on the days without a new writing task) and writes at least twice a week', () => {
    for (let week = 1; week <= 4; week++) {
      for (let day = 1; day <= 6; day++) {
        const minutes = steps.filter((s) => s.week === week && s.day === day).reduce((n, s) => n + s.minutes, 0);
        expect(minutes, `week ${week} day ${day}`).toBeGreaterThanOrEqual(140);
        expect(minutes, `week ${week} day ${day}`).toBeLessThanOrEqual(280);
      }
      expect(steps.filter((s) => s.week === week && s.block === 'writing' && s.kind === 'practice').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('teaches before it practises: a week starts with its lessons', () => {
    for (let week = 1; week <= 4; week++) {
      const day1 = steps.filter((s) => s.week === week && s.day === 1 && ['listening', 'reading', 'writing', 'speaking'].includes(s.block) && s.kind !== 'dictation');
      expect(day1.every((s) => s.kind === 'lesson'), `week ${week}`).toBe(true);
    }
  });
});

describe('every written phase', () => {
  it('has phases 1 to 6 and the final sprint (7), and nothing after them', () => {
    expect(WRITTEN_PHASES).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(phaseSteps(8)).toEqual([]);
  });

  it('numbers the weeks of each phase in fours, each with six study days and a review day', () => {
    for (const [phase, weeks] of [[1, [1, 2, 3, 4]], [2, [5, 6, 7, 8]], [3, [9, 10, 11, 12]], [4, [13, 14, 15, 16]], [5, [17, 18, 19, 20]], [6, [21, 22, 23, 24]]] as const) {
      const list = phaseSteps(phase);
      expect([...new Set(list.map((s) => s.week))]).toEqual(weeks);
      for (const week of weeks) for (const day of [1, 2, 3, 4, 5, 6, 7]) expect(list.some((s) => s.week === week && s.day === day), `${week}-${day}`).toBe(true);
    }
  });

  it('uses every lesson exactly once across the written phases, and only grammar points that exist', () => {
    const points = new Set(GRAMMAR_POINTS.map((p) => p.id));
    for (const lesson of LESSONS) expect(allSteps.filter((s) => s.kind === 'lesson' && (s.ref as { lessonId: string }).lessonId === lesson.id), lesson.id).toHaveLength(1);
    for (const s of allSteps) if (s.kind === 'grammar') expect(points.has((s.ref as { pointId: string }).pointId), JSON.stringify(s.ref)).toBe(true);
  });

  it.each([[2, 5], [3, 9], [4, 13], [5, 17]] as const)('keeps every study day of phase %i between 2.3 and 4.7 hours, and starts each week with its four lessons', (phase, firstWeek) => {
    const list = phaseSteps(phase);
    for (let week = firstWeek; week < firstWeek + 4; week++) {
      for (let day = 1; day <= 6; day++) {
        const minutes = list.filter((s) => s.week === week && s.day === day).reduce((n, s) => n + s.minutes, 0);
        expect(minutes, `week ${week} day ${day}`).toBeGreaterThanOrEqual(140);
        expect(minutes, `week ${week} day ${day}`).toBeLessThanOrEqual(280);
      }
      const first = list.filter((s) => s.week === week && s.day === 1 && ['listening', 'reading', 'writing', 'speaking'].includes(s.block) && s.kind !== 'dictation');
      expect(first.every((s) => s.kind === 'lesson') && first.length === 4, `week ${week}`).toBe(true);
      expect(list.filter((s) => s.week === week && s.block === 'writing' && s.kind === 'practice').length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('phase 6 and the final sprint', () => {
  const mockSteps = phaseSteps(6).filter((s) => s.kind === 'practice' && (s.ref as { test?: string }).test);

  it('runs a whole real test, all four skills, on day 2 of weeks 21 and 23', () => {
    for (const [week, test] of [[21, 'c17-t3'], [23, 'c17-t4']] as const) {
      const steps = mockSteps.filter((s) => s.week === week);
      expect(steps.map((s) => `${s.day}:${(s.ref as { type: string }).type}:${(s.ref as { test: string }).test}`).sort()).toEqual(['l-test40', 'r-three', 's-full', 'w-full'].map((type) => `2:${type}:${test}`).sort());
    }
  });

  it('keeps the tests of the mock weeks apart from those of the gates', () => {
    const kept = new Set(RESERVED_TESTS);
    expect(kept.size).toBe(6);
    for (const test of Object.values(MOCK_REAL_TESTS)) expect(Object.values(GATE_REAL_TESTS).flatMap((t) => [t.A, t.B])).not.toContain(test);
  });

  it('keeps every study day of phase 6 under 5.5 hours and teaches nothing new in the final sprint', () => {
    for (let week = 21; week <= 24; week++) {
      for (let day = 1; day <= 6; day++) {
        const minutes = phaseSteps(6).filter((s) => s.week === week && s.day === day).reduce((n, s) => n + s.minutes, 0);
        expect(minutes, `week ${week} day ${day}`).toBeGreaterThanOrEqual(140);
        expect(minutes, `week ${week} day ${day}`).toBeLessThanOrEqual(330);
      }
    }
    const sprint = phaseSteps(7);
    expect([...new Set(sprint.map((s) => s.week))]).toEqual([25, 26]);
    // Words are only reviewed in the last two weeks
    expect(sprint.filter((s) => s.kind === 'words').every((s) => (s.ref as { topic: string }).topic === 'review')).toBe(true);
    // The exam week is lighter than the week before it
    const total = (week: number) => sprint.filter((s) => s.week === week).reduce((n, s) => n + s.minutes, 0);
    expect(total(26)).toBeLessThan(total(25));
  });
});
