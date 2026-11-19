import { describe, expect, it } from 'vitest';
import { assignDays, behindOf, etaRange, paceOf, pickToday, type QueueRow } from './schedule.js';

const row = (id: string, minutes: number, status: 'todo' | 'done' = 'todo', plannedDay = '2026-11-10', doneDay: string | null = null): QueueRow => ({ id, minutes, status, plannedDay, doneDay });

describe('assignDays', () => {
  it('fills a day up to the daily minutes, then moves on', () => {
    expect(assignDays([100, 100, 100, 100], '2026-11-10', 240, [])).toEqual(['2026-11-10', '2026-11-10', '2026-11-11', '2026-11-11']);
  });
  it('puts a step that does not fit on the next day, and a big step alone on its day', () => {
    expect(assignDays([200, 60, 300], '2026-11-10', 240, [])).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
  });
  it('skips rest days', () => {
    // 2026-11-15 is a Sunday
    expect(assignDays([240, 240, 240], '2026-11-14', 240, [0])).toEqual(['2026-11-14', '2026-11-16', '2026-11-17']);
    expect(assignDays([100], '2026-11-15', 240, [0])).toEqual(['2026-11-16']);
  });
  it('gives Saturday and Sunday their own minutes', () => {
    // 2026-11-13 is a Friday: 120 minutes on Friday, 300 on Saturday and Sunday, 120 on Monday
    expect(assignDays([120, 150, 150, 150, 150, 120], '2026-11-13', 120, [], 300)).toEqual(['2026-11-13', '2026-11-14', '2026-11-14', '2026-11-15', '2026-11-15', '2026-11-16']);
  });
  it('uses the usual minutes at the weekend when no weekend minutes are set', () => {
    expect(assignDays([120, 120], '2026-11-14', 120, [], null)).toEqual(['2026-11-14', '2026-11-15']);
  });
  it('does not study on a rest day even when it is a weekend day with its own minutes', () => {
    expect(assignDays([300, 300], '2026-11-14', 120, [0], 300)).toEqual(['2026-11-14', '2026-11-16']);
  });
});

describe('pickToday', () => {
  const queue = [row('a', 15), row('b', 20), row('c', 45), row('d', 60), row('e', 30)];
  it('takes steps in order while they fit', () => {
    expect(pickToday(queue, '2026-11-10', 90).rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('stops at the first step that does not fit instead of skipping ahead', () => {
    expect(pickToday(queue, '2026-11-10', 100).rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('always offers at least one step', () => {
    expect(pickToday([row('big', 120)], '2026-11-10', 60).rows.map((r) => r.id)).toEqual(['big']);
  });
  it('counts what was finished today against the day', () => {
    const rows = [row('x', 60, 'done', '2026-11-10', '2026-11-10'), ...queue];
    const pick = pickToday(rows, '2026-11-10', 100);
    expect(pick.rows.map((r) => r.id)).toEqual(['x', 'a', 'b']);
    expect(pick.doneMinutes).toBe(60);
  });
  it('keeps steps finished earlier out of today, and shows nothing more when the day is full', () => {
    const rows = [row('old', 30, 'done', '2026-11-09', '2026-11-09'), row('a', 60)];
    expect(pickToday(rows, '2026-11-10', 0).rows).toEqual([]);
    expect(pickToday(rows, '2026-11-10', 60).rows.map((r) => r.id)).toEqual(['a']);
  });
  it('learning ahead is a bigger capacity', () => {
    expect(pickToday(queue, '2026-11-10', 90 + 120).rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('pickToday at the end of a syllabus day', () => {
  const group = (r: QueueRow) => r.id.split('-')[0];
  const queue = [row('a-1', 60), row('a-2', 60), row('a-3', 60), row('b-1', 15), row('b-2', 20), row('b-3', 60)];
  it('does not pad a nearly full day with the start of the next one', () => {
    expect(pickToday(queue, '2026-11-10', 240, group).rows.map((r) => r.id)).toEqual(['a-1', 'a-2', 'a-3']);
  });
  it('goes on into the next day when there is plenty of time left', () => {
    expect(pickToday(queue, '2026-11-10', 400, group).rows.map((r) => r.id)).toEqual(['a-1', 'a-2', 'a-3', 'b-1', 'b-2', 'b-3']);
  });
  it('after catching up a little, carries on into the next day', () => {
    const rows = [row('x-1', 30, 'done', '2026-11-09', '2026-11-10'), row('a-1', 60), row('b-1', 15), row('b-2', 20)];
    expect(pickToday(rows, '2026-11-10', 240, (r) => (r.id === 'x-1' ? 'a' : group(r))).rows.map((r) => r.id)).toEqual(['x-1', 'a-1', 'b-1', 'b-2']);
  });
});

describe('behind, pace and eta', () => {
  it('counts undone steps due before today', () => {
    const rows = [row('a', 60, 'todo', '2026-11-08'), row('b', 60, 'todo', '2026-11-09'), row('c', 60, 'todo', '2026-11-10'), row('d', 60, 'done', '2026-11-08', '2026-11-08')];
    expect(behindOf(rows, '2026-11-10', 120)).toEqual({ steps: 2, minutes: 120, days: 1 });
  });
  it('uses the stated minutes until there is history, then the real pace', () => {
    expect(paceOf(new Map([['a', 100]]), 240)).toBe(240);
    expect(paceOf(new Map([['a', 100], ['b', 140], ['c', 120]]), 240)).toBe(120);
  });
  it('turns remaining minutes into a date range', () => {
    // 2400 minutes at 240 a day, six study days a week -> 10 study days = about 11.7 calendar days
    const { from, to } = etaRange(2400, 240, [0], '2026-11-10');
    expect(from < to).toBe(true);
    expect(from).toBe('2026-11-20');
    expect(to).toBe('2026-11-24');
  });
});
