import { describe, expect, it } from 'vitest';
import { applyResult, computeStage, EMPTY_CELLS, type Cells } from './stage.js';
import { firstSchedule, nextReview } from './schedule.js';

const none = { unaidedPasses: 0, passDays: 0 };

describe('applyResult', () => {
  it('finishes a recognition cell on a correct answer, but only half-way when helped', () => {
    expect(applyResult(EMPTY_CELLS, 'meaning', 'r', 'pass', false, none).meaningR).toBe(2);
    expect(applyResult(EMPTY_CELLS, 'meaning', 'r', 'pass', true, none).meaningR).toBe(1);
  });

  it('marks a failed try as in progress', () => {
    expect(applyResult(EMPTY_CELLS, 'use', 'r', 'fail', false, none).useR).toBe(1);
  });

  it('does not count a wrong production, but counts a half-right or helped one', () => {
    expect(applyResult(EMPTY_CELLS, 'use', 'p', 'fail', false, none).useP).toBe(0);
    expect(applyResult(EMPTY_CELLS, 'use', 'p', 'partial', true, none).useP).toBe(1);
  });

  it('never lowers a cell', () => {
    const cells: Cells = { ...EMPTY_CELLS, meaningR: 2 };
    expect(applyResult(cells, 'meaning', 'r', 'fail', false, none).meaningR).toBe(2);
  });

  it('finishes a production cell only after correct unaided uses on separate days', () => {
    expect(applyResult(EMPTY_CELLS, 'use', 'p', 'pass', false, { unaidedPasses: 1, passDays: 1 }).useP).toBe(1);
    expect(applyResult(EMPTY_CELLS, 'use', 'p', 'pass', false, { unaidedPasses: 2, passDays: 2 }).useP).toBe(2);
    expect(applyResult(EMPTY_CELLS, 'use', 'p', 'pass', true, { unaidedPasses: 2, passDays: 2 }).useP).toBe(1);
  });
});

describe('computeStage', () => {
  it('starts at 1 and follows the cells up', () => {
    expect(computeStage(EMPTY_CELLS, none)).toBe(1);
    expect(computeStage({ ...EMPTY_CELLS, formR: 2, meaningR: 1 }, none)).toBe(2);
    expect(computeStage({ ...EMPTY_CELLS, formR: 2, meaningR: 2, useR: 2 }, none)).toBe(3);
    expect(computeStage({ ...EMPTY_CELLS, formR: 2, meaningR: 2, useR: 2, useP: 1 }, none)).toBe(4);
  });

  it('reaches 5 only with unaided use on separate days', () => {
    const cells: Cells = { formR: 2, formP: 2, meaningR: 2, meaningP: 2, useR: 2, useP: 2 };
    expect(computeStage(cells, { unaidedPasses: 2, passDays: 1 })).toBe(4);
    expect(computeStage(cells, { unaidedPasses: 2, passDays: 2 })).toBe(5);
  });
});

describe('nextReview', () => {
  const now = new Date('2026-11-07T00:00:00Z');
  it('walks the 1, 3, 7, 14, 30 day ladder', () => {
    expect(nextReview(0, true, now)).toEqual({ step: 1, dueAt: new Date('2026-11-10T00:00:00Z') });
    expect(nextReview(1, true, now)).toEqual({ step: 2, dueAt: new Date('2026-11-14T00:00:00Z') });
    expect(nextReview(4, true, now)).toEqual({ step: 4, dueAt: new Date('2026-12-07T00:00:00Z') });
  });

  it('steps back and returns after a day when the review went badly', () => {
    expect(nextReview(3, false, now)).toEqual({ step: 2, dueAt: new Date('2026-11-08T00:00:00Z') });
    expect(nextReview(0, false, now).step).toBe(0);
  });

  it('lists the first four review days', () => {
    expect(firstSchedule(now).map((d) => d.toISOString().slice(5, 10))).toEqual(['11-08', '11-10', '11-14', '11-21']);
  });
});
