/**
 * Scheduling for the IELTS path, pure. The syllabus is a queue: Today shows the first undone steps that fit the
 * day's minutes, so a missed day needs no special handling (the next day simply starts where the learner stopped),
 * and learning ahead just takes more steps from the front of the queue. The planned day of each step only measures
 * how far ahead of or behind the original schedule the learner is.
 */
import { addDays, minutesOn } from './bands.js';

export interface QueueRow {
  id: string;
  minutes: number;
  status: 'todo' | 'done';
  plannedDay: string;
  doneDay?: string | null;
}

const isRest = (iso: string, restDays: number[]) => restDays.includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

/**
 * The calendar day each step is due on the original schedule: steps are placed in order, a day takes steps until
 * its minutes are used (a step that would not fit starts the next day), rest days are skipped. Saturday and Sunday
 * take `weekendMinutes` when it is set.
 */
export function assignDays(minutes: number[], startDate: string, dailyMinutes: number, restDays: number[], weekendMinutes: number | null = null): string[] {
  const days: string[] = [];
  const time = { dailyMinutes, weekendMinutes, restDays };
  const nextStudyDay = (from: string): string => {
    let d = from;
    while (isRest(d, restDays) && restDays.length < 7) d = addDays(d, 1);
    return d;
  };
  let day = nextStudyDay(startDate);
  let used = 0;
  for (const m of minutes) {
    if (used > 0 && used + m > minutesOn(time, day)) {
      day = nextStudyDay(addDays(day, 1));
      used = 0;
    }
    days.push(day);
    used += m;
  }
  return days;
}

/** Share of the day's minutes after which Today does not start the next syllabus day */
export const DAY_FULL_SHARE = 0.7;

export interface TodayPick<T extends QueueRow> {
  /** Steps shown today: those finished today, then the next undone ones that fit */
  rows: T[];
  doneMinutes: number;
  plannedMinutes: number;
}

/**
 * Today's steps. `capacity` is the learner's minutes for today (plus any extra asked for); steps finished today
 * count against it. The queue is never reordered: the first step that does not fit ends the list.
 */
export function pickToday<T extends QueueRow>(rows: T[], today: string, capacity: number, groupOf?: (row: T) => string): TodayPick<T> {
  const doneToday = rows.filter((r) => r.status === 'done' && r.doneDay === today);
  const doneMinutes = doneToday.reduce((n, r) => n + r.minutes, 0);
  const picked: T[] = [];
  let used = doneMinutes;
  let group: string | null = groupOf && doneToday.length > 0 ? groupOf(doneToday[doneToday.length - 1]) : null;
  for (const row of rows) {
    if (row.status !== 'todo') continue;
    if (used >= capacity) break;
    // A syllabus day is not padded with the first steps of the next one when the day is nearly full
    if (groupOf) {
      const g = groupOf(row);
      if (group !== null && g !== group && used >= capacity * DAY_FULL_SHARE) break;
      group = g;
    }
    if (used + row.minutes > capacity && (picked.length > 0 || doneToday.length > 0)) break;
    picked.push(row);
    used += row.minutes;
  }
  const shown = [...doneToday, ...picked];
  return { rows: shown, doneMinutes, plannedMinutes: shown.reduce((n, r) => n + r.minutes, 0) };
}

/** How far behind the original schedule the learner is: undone steps that were due before today */
export function behindOf(rows: QueueRow[], today: string, dailyMinutes: number): { steps: number; minutes: number; days: number } {
  const late = rows.filter((r) => r.status === 'todo' && r.plannedDay < today);
  const minutes = late.reduce((n, r) => n + r.minutes, 0);
  return { steps: late.length, minutes, days: dailyMinutes > 0 ? Math.round((minutes / dailyMinutes) * 10) / 10 : 0 };
}

/** Behind by more than this many study days: the learner is offered a way to catch up */
export const BEHIND_ALERT_DAYS = 2;

/**
 * When the remaining steps will be done at the pace the learner really keeps: the average minutes over their
 * recent study days (falling back to their daily minutes while there is little history), as a range
 */
export function etaRange(remainingMinutes: number, paceMinutesPerDay: number, restDays: number[], today: string): { from: string; to: string } {
  const studyDaysPerWeek = Math.max(1, 7 - new Set(restDays).size);
  const perCalendarDay = (Math.max(15, paceMinutesPerDay) * studyDaysPerWeek) / 7;
  const days = remainingMinutes / perCalendarDay;
  return { from: addDays(today, Math.ceil(days * 0.85)), to: addDays(today, Math.ceil(days * 1.15)) };
}

/**
 * The pace to plan with: the average minutes of the learner's last `window` study days, once they have at least
 * `minDays` of them; otherwise what they said they would do
 */
export function paceOf(minutesByDay: Map<string, number>, dailyMinutes: number, minDays = 3): number {
  if (minutesByDay.size < minDays) return dailyMinutes;
  const total = [...minutesByDay.values()].reduce((a, b) => a + b, 0);
  return Math.round(total / minutesByDay.size);
}
