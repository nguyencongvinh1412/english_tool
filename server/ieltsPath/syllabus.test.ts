import { describe, expect, it } from 'vitest';
import { GRAMMAR_POINTS } from '../grammar/map.js';
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

  it('keeps a study day between 2.3 and 4.5 hours (lighter on the days without a new writing task) and writes at least twice a week', () => {
    for (let week = 1; week <= 4; week++) {
      for (let day = 1; day <= 6; day++) {
        const minutes = steps.filter((s) => s.week === week && s.day === day).reduce((n, s) => n + s.minutes, 0);
        expect(minutes, `week ${week} day ${day}`).toBeGreaterThanOrEqual(140);
        expect(minutes, `week ${week} day ${day}`).toBeLessThanOrEqual(270);
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
  it('has phases 1 to 4, and no phase after them yet', () => {
    expect(WRITTEN_PHASES).toEqual([1, 2, 3, 4]);
    expect(phaseSteps(5)).toEqual([]);
  });

  it('numbers weeks 1-4 in phase 1, 5-8 in phase 2, 9-12 in phase 3 and 13-16 in phase 4, each with six study days and a review day', () => {
    for (const [phase, weeks] of [[1, [1, 2, 3, 4]], [2, [5, 6, 7, 8]], [3, [9, 10, 11, 12]], [4, [13, 14, 15, 16]]] as const) {
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

  it.each([[2, 5], [3, 9], [4, 13]] as const)('keeps every study day of phase %i between 2.3 and 4.5 hours, and starts each week with its four lessons', (phase, firstWeek) => {
    const list = phaseSteps(phase);
    for (let week = firstWeek; week < firstWeek + 4; week++) {
      for (let day = 1; day <= 6; day++) {
        const minutes = list.filter((s) => s.week === week && s.day === day).reduce((n, s) => n + s.minutes, 0);
        expect(minutes, `week ${week} day ${day}`).toBeGreaterThanOrEqual(140);
        expect(minutes, `week ${week} day ${day}`).toBeLessThanOrEqual(270);
      }
      const first = list.filter((s) => s.week === week && s.day === 1 && ['listening', 'reading', 'writing', 'speaking'].includes(s.block) && s.kind !== 'dictation');
      expect(first.every((s) => s.kind === 'lesson') && first.length === 4, `week ${week}`).toBe(true);
      expect(list.filter((s) => s.week === week && s.block === 'writing' && s.kind === 'practice').length).toBeGreaterThanOrEqual(2);
    }
  });
});
