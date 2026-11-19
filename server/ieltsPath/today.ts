/**
 * Today for an IELTS path: the syllabus steps stored for the learner (path_lessons), kept in sync with what they
 * have done, and the list of steps for today. See schedule.ts for how the queue, catching up and learning ahead work.
 */
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts, examSessions, grammarProgress, ieltsPaths, pathLessons, skillLevels, type IeltsPath, type PathLesson, type User } from '../db/schema.js';
import type { IeltsBlueprint } from '../exams/ielts.js';
import { HttpError } from '../http/errors.js';
import { quotaDay } from '../services/aiAccess.js';
import { addDays, minutesOn, overallOf, PATH_SKILLS, timeOf, typicalDay, type Bands, type PathSkill } from './bands.js';
import { loadLesson, type PathLessonContent } from './lessons.js';
import { componentOf, practiceSections } from './practice.js';
import { assignDays, BEHIND_ALERT_DAYS, behindOf, etaRange, paceOf, pickToday } from './schedule.js';
import { adaptSteps } from './adapt.js';
import { clearedGate, gateView, nextGate, type GateView, type RetestView } from './gates.js';
import { buildErrorBook, isBlankSubmission, recentPracticeBands } from './errors.js';
import type { CriterionBand } from './errorRules.js';
import { FINAL_PHASE, LESSONS, phaseSteps, WRITTEN_PHASES, type PracticeType, type StepRef } from './syllabus.js';

const PACE_WINDOW_DAYS = 14;
const dayOf = (date: Date | null) => (date ? quotaDay(date) : null);

/**
 * The syllabus of each written phase from the starting phase to the one the learner works on is stored once, in order,
 * with the day each step is due. A phase is added when the gate before it is cleared.
 */
export async function ensureSteps(path: IeltsPath): Promise<number> {
  if (path.startPhase === null || !path.startDate) return 0;
  const upTo = await nextGate(path);
  // The phases the target needs, up to the one whose gate is next; once the last of them is cleared, the final sprint
  const phases: number[] = [];
  for (let phase = path.startPhase; phase <= Math.min(upTo, path.endPhase); phase++) phases.push(phase);
  if (upTo > path.endPhase) phases.push(FINAL_PHASE);
  let added = 0;
  for (const phase of phases) {
    if (!WRITTEN_PHASES.includes(phase)) continue;
    const [seeded] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(pathLessons)
      .where(and(eq(pathLessons.pathId, path.id), eq(pathLessons.phase, phase), sql`${pathLessons.ref}->>'remedial' is null`, sql`${pathLessons.ref}->>'buffer' is null`));
    if (seeded.n > 0) continue;
    const [last] = await db.select({ seq: sql<number | null>`max(${pathLessons.seq})` }).from(pathLessons).where(eq(pathLessons.pathId, path.id));
    const first = (last?.seq ?? -1) + 1;
    const steps = phaseSteps(phase);
    const days = assignDays(steps.map((s) => s.minutes), phase === path.startPhase ? path.startDate : quotaDay(), path.dailyMinutes, path.restDays as number[], path.weekendMinutes);
    const rows = steps.map((s, i) => ({ pathId: path.id, userId: path.userId, seq: first + i, phase: s.phase, week: s.week, studyDay: s.day, block: s.block, kind: s.kind, ref: s.ref, core: s.core, minutes: s.minutes, plannedDay: days[i] }));
    for (let k = 0; k < rows.length; k += 100) await db.insert(pathLessons).values(rows.slice(k, k + 100)).onConflictDoNothing();
    added += rows.length;
  }
  return added;
}

/** Whether the learner has a syllabus running (Today then leaves the generic skill tasks to it) */
export async function hasSyllabus(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pathLessons)
    .innerJoin(ieltsPaths, eq(ieltsPaths.id, pathLessons.pathId))
    .where(and(eq(pathLessons.userId, userId), eq(ieltsPaths.status, 'active'), eq(pathLessons.status, 'todo')));
  return row.n > 0;
}

/** Marks steps done from what the learner did elsewhere in the app */
async function syncDone(path: IeltsPath): Promise<void> {
  const todo = await db.select().from(pathLessons).where(and(eq(pathLessons.pathId, path.id), eq(pathLessons.status, 'todo'))).orderBy(asc(pathLessons.seq));
  if (todo.length === 0) return;
  const finish = (row: PathLesson, at: Date, result: unknown = null) =>
    db.update(pathLessons).set({ status: 'done', doneAt: at, result: result ?? row.result }).where(and(eq(pathLessons.id, row.id), eq(pathLessons.status, 'todo')));

  // Practice: the test session was submitted
  const sessionIds = todo.filter((r) => r.kind === 'practice' && (r.ref as { sessionId?: string }).sessionId).map((r) => (r.ref as { sessionId: string }).sessionId);
  if (sessionIds.length > 0) {
    const sessions = await db.select({ id: examSessions.id, status: examSessions.status, submittedAt: examSessions.submittedAt, answers: examSessions.answers, blueprint: examSessions.blueprint }).from(examSessions).where(inArray(examSessions.id, sessionIds));
    const bySession = new Map(sessions.map((s) => [s.id, s]));
    for (const row of todo.filter((r) => r.kind === 'practice')) {
      const session = bySession.get((row.ref as { sessionId?: string }).sessionId ?? '');
      // A session submitted with no answer is not an attempt: the step stays to do
      if (session?.status === 'submitted' && !isBlankSubmission(session)) await finish(row, session.submittedAt ?? new Date());
    }
  }

  // Grammar: the point has been practised
  const points = todo.filter((r) => r.kind === 'grammar').map((r) => (r.ref as { pointId: string }).pointId);
  if (points.length > 0) {
    const practised = await db.select({ pointId: grammarProgress.pointId, at: grammarProgress.practicedAt }).from(grammarProgress).where(and(eq(grammarProgress.userId, path.userId), inArray(grammarProgress.pointId, points)));
    const at = new Map(practised.map((p) => [p.pointId, p.at]));
    for (const row of todo.filter((r) => r.kind === 'grammar')) {
      const when = at.get((row.ref as { pointId: string }).pointId);
      if (when) await finish(row, when);
    }
  }

  // Words, dictation and pronunciation: one session of each counts for the next such step, in order
  for (const [kind, activities] of [['words', ['en-vocab', 'vocab']], ['dictation', ['dictation']], ['pronunciation', ['pronunciation']]] as const) {
    const rows = todo.filter((r) => r.kind === kind);
    if (rows.length === 0) continue;
    const [last] = await db
      .select({ at: sql<Date | null>`max(${pathLessons.doneAt})` })
      .from(pathLessons)
      .where(and(eq(pathLessons.pathId, path.id), eq(pathLessons.kind, kind), eq(pathLessons.status, 'done')));
    let after = last?.at ? new Date(last.at) : new Date(`${path.startDate}T00:00:00+07:00`);
    const made = await db
      .select({ at: attempts.completedAt })
      .from(attempts)
      .where(and(eq(attempts.userId, path.userId), inArray(attempts.activity, [...activities]), gte(attempts.completedAt, after)))
      .orderBy(asc(attempts.completedAt));
    for (const row of rows) {
      const next = made.find((a) => a.at > after);
      if (!next) break;
      await finish(row, next.at);
      after = next.at;
    }
  }
}

export interface StepView {
  id: string;
  seq: number;
  phase: number;
  week: number;
  day: number;
  block: PathLesson['block'];
  kind: PathLesson['kind'];
  ref: StepRef;
  minutes: number;
  core: boolean;
  done: boolean;
  /** Due on an earlier day than today and still not done */
  behind: boolean;
  /** For a lesson: its title */
  title: { en: string; vi: string } | null;
  /** For practice: a session already started */
  sessionId: string | null;
}

const viewOf = (row: PathLesson, today: string): StepView => {
  const ref = row.ref as StepRef & { sessionId?: string };
  return {
    id: row.id,
    seq: row.seq,
    phase: row.phase,
    week: row.week,
    day: row.studyDay,
    block: row.block as StepView['block'],
    kind: row.kind as StepView['kind'],
    ref,
    minutes: row.minutes,
    core: row.core,
    done: row.status === 'done',
    behind: row.status === 'todo' && row.plannedDay < today,
    title: 'lessonId' in ref ? (LESSONS.find((l) => l.id === ref.lessonId)?.title ?? null) : null,
    sessionId: ref.sessionId ?? null,
  };
};

/** syllabus: steps to do; gate: the phase's steps are done and its gate is next; unwritten: no lessons for the phase yet; complete: every gate is cleared */
export type PathTodayMode = 'syllabus' | 'gate' | 'unwritten' | 'complete';

/** The gate the learner works towards, and the retest of an earlier one when it is waiting */
export interface TodayGate {
  gate: number;
  status: GateView['status'];
  version: GateView['version'];
  /** Why the gate cannot be started now (null: it can) */
  startBlock: GateView['startBlock'];
  stopped: boolean;
  /** Steps of the phase still to do before the gate opens */
  stepsLeft: boolean;
}
export interface TodayRetest extends RetestView {
  gate: number;
}

export interface PathTodayView {
  mode: PathTodayMode;
  /** Overall band the learner is working towards */
  overallTarget: number;
  /** Where the learner is in the syllabus (the first undone step) */
  position: { phase: number; week: number; day: number; extra: 'remedial' | 'buffer' | null } | null;
  restDay: boolean;
  dailyMinutes: number;
  /** Minutes on Saturday and Sunday (null: as a usual day) */
  weekendMinutes: number | null;
  capacityMinutes: number;
  plannedMinutes: number;
  doneMinutes: number;
  steps: StepView[];
  behind: { steps: number; minutes: number; days: number; alert: boolean };
  /** The queue has more to give: a button to learn ahead */
  canAhead: boolean;
  progress: { done: number; total: number; remainingMinutes: number };
  /** Expected end of the written part of the syllabus at the learner's real pace */
  eta: { from: string; to: string } | null;
  paceMinutes: number;
  gate: TodayGate | null;
  retest: TodayRetest | null;
  /** What to work on in writing and speaking: the criterion with the lowest recent band */
  focus: { writing: CriterionBand | null; speaking: CriterionBand | null };
  /** Per skill: the band of the last gate and the mean of the last practice sessions */
  bands: Record<PathSkill, { target: number; gate: number | null; practice: number | null; n: number }>;
}

/**
 * Today for the path: syncs what the learner did, then lists the steps that fit today's minutes
 */
export async function pathToday(path: IeltsPath, today = quotaDay()): Promise<PathTodayView> {
  const dailyMinutes = path.dailyMinutes;
  const time = timeOf(path);
  const usualDay = typicalDay(time);
  const overallTarget = overallOf(path.bandTargets as Bands);
  const targets = path.bandTargets as Bands;
  const emptyBands = Object.fromEntries(PATH_SKILLS.map((skill) => [skill, { target: targets[skill], gate: null, practice: null, n: 0 }])) as PathTodayView['bands'];
  const empty = (mode: PathTodayMode): PathTodayView => ({
    mode, overallTarget, position: null, restDay: false, dailyMinutes, weekendMinutes: path.weekendMinutes, capacityMinutes: minutesOn(time, today), plannedMinutes: 0, doneMinutes: 0, steps: [], behind: { steps: 0, minutes: 0, days: 0, alert: false }, canAhead: false,
    progress: { done: 0, total: 0, remainingMinutes: 0 }, eta: null, paceMinutes: usualDay, gate: null, retest: null,
    focus: { writing: null, speaking: null }, bands: emptyBands,
  });
  if (path.startPhase === null || !path.startDate) return empty('unwritten');

  await ensureSteps(path);
  await syncDone(path);
  // Lessons that follow the learner: never let a failure here stop Today
  await adaptSteps(path, today).catch((error) => console.error('adaptSteps failed:', error));
  const rows = await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id)).orderBy(asc(pathLessons.seq));
  const queue = rows.map((r) => ({ row: r, id: r.id, minutes: r.minutes, status: r.status as 'todo' | 'done', plannedDay: r.plannedDay, doneDay: dayOf(r.doneAt) }));

  const todo = queue.filter((q) => q.status === 'todo');
  const restDay = (path.restDays as number[]).includes(new Date(`${today}T00:00:00Z`).getUTCDay());
  const ahead = path.aheadDay === today ? path.aheadMinutes : 0;
  const capacity = minutesOn(time, today) + ahead;
  const pick = pickToday(queue, today, capacity, (q) => `${q.row.phase}-${q.row.week}-${q.row.studyDay}`);

  const behind = behindOf(queue, today, usualDay);
  const first = todo[0]?.row;

  // Pace: average minutes of the last two weeks of study days
  const since = addDays(today, -PACE_WINDOW_DAYS);
  const byDay = new Map<string, number>();
  for (const q of queue) {
    const d = q.doneDay;
    if (q.status === 'done' && d && d >= since) byDay.set(d, (byDay.get(d) ?? 0) + q.minutes);
  }
  const pace = paceOf(byDay, usualDay);
  const remainingMinutes = todo.reduce((n, q) => n + q.minutes, 0);

  // The gate the learner works towards, and a retest of the gate before it when one is waiting
  const next = await nextGate(path);
  const open = next >= 1 && next <= 6 && next <= path.endPhase;
  const gateInfo = open ? await gateView(path, next) : null;
  let retest: TodayRetest | null = null;
  const cleared = await clearedGate(path);
  if (cleared >= 1 && cleared >= path.startPhase) {
    const earlier = await gateView(path, cleared);
    if (earlier.retest && earlier.retest.status !== 'done') retest = { ...earlier.retest, gate: cleared };
  }
  const [book, practice, levels] = await Promise.all([
    buildErrorBook(path.userId),
    recentPracticeBands(path.userId),
    db.select({ skill: skillLevels.skill, band: skillLevels.band }).from(skillLevels).where(and(eq(skillLevels.userId, path.userId), eq(skillLevels.language, 'en'), eq(skillLevels.source, 'gate'))),
  ]);
  const gateBands = new Map(levels.map((l) => [l.skill, l.band]));
  const bands = Object.fromEntries(PATH_SKILLS.map((skill) => [skill, { target: targets[skill], gate: gateBands.get(skill) ?? null, practice: practice[skill]?.band ?? null, n: practice[skill]?.n ?? 0 }])) as PathTodayView['bands'];
  const mode: PathTodayMode = todo.length > 0 ? 'syllabus' : !open ? 'complete' : phaseSteps(next).length === 0 ? 'unwritten' : 'gate';

  return {
    mode,
    gate: gateInfo ? { gate: next, status: gateInfo.status, version: gateInfo.version, startBlock: gateInfo.startBlock, stopped: gateInfo.stopped, stepsLeft: gateInfo.startBlock === 'steps-left' } : null,
    retest,
    focus: { writing: book.writing.lowest, speaking: book.speaking.lowest },
    bands,
    overallTarget,
    position: first ? { phase: first.phase, week: first.week, day: first.studyDay, extra: (first.ref as { remedial?: number }).remedial ? 'remedial' : (first.ref as { buffer?: number }).buffer ? 'buffer' : null } : null,
    restDay,
    dailyMinutes,
    weekendMinutes: path.weekendMinutes,
    capacityMinutes: capacity,
    plannedMinutes: pick.plannedMinutes,
    doneMinutes: pick.doneMinutes,
    steps: pick.rows.map((q) => viewOf(q.row, today)),
    behind: { ...behind, alert: behind.days > BEHIND_ALERT_DAYS },
    canAhead: todo.length > pick.rows.filter((r) => r.status === 'todo').length,
    progress: { done: queue.length - todo.length, total: queue.length, remainingMinutes },
    eta: todo.length === 0 ? null : etaRange(remainingMinutes, pace, path.restDays as number[], today),
    paceMinutes: pace,
  };
}

/** Learn ahead: one more day's minutes for today */
export async function learnAhead(path: IeltsPath, today = quotaDay()): Promise<void> {
  const current = path.aheadDay === today ? path.aheadMinutes : 0;
  await db.update(ieltsPaths).set({ aheadDay: today, aheadMinutes: current + path.dailyMinutes, updatedAt: new Date() }).where(eq(ieltsPaths.id, path.id));
}

/** The step, only when it belongs to the learner's active path */
export async function stepOf(userId: string, stepId: string): Promise<PathLesson> {
  const [row] = await db
    .select({ step: pathLessons })
    .from(pathLessons)
    .innerJoin(ieltsPaths, eq(ieltsPaths.id, pathLessons.pathId))
    .where(and(eq(pathLessons.id, stepId), eq(pathLessons.userId, userId), eq(ieltsPaths.status, 'active')));
  if (!row) throw new HttpError(404, 'This step was not found.', 'not_found');
  return row.step;
}

/** A lesson step with its teaching content */
export async function lessonOf(step: PathLesson): Promise<{ title: { en: string; vi: string }; content: PathLessonContent }> {
  const lessonId = (step.ref as { lessonId?: string }).lessonId;
  const meta = LESSONS.find((l) => l.id === lessonId);
  if (step.kind !== 'lesson' || !meta) throw new HttpError(404, 'This step is not a lesson.', 'not_found');
  const content = await loadLesson(meta.id);
  if (!content) throw new HttpError(404, 'This lesson has not been written yet.', 'not_ready');
  return { title: meta.title, content };
}

/** Finishing a lesson (its drills are saved with it) */
export async function completeLesson(step: PathLesson, drills: { correct: number; total: number } | null): Promise<void> {
  if (step.kind !== 'lesson') throw new HttpError(400, 'This step is not a lesson.', 'not_a_lesson');
  const drillScore = drills ? Math.round((Math.min(drills.correct, drills.total) / Math.max(1, drills.total)) * 100) : null;
  await db
    .update(pathLessons)
    .set({ status: 'done', doneAt: sql`coalesce(${pathLessons.doneAt}, now())`, result: { drillScore } })
    .where(eq(pathLessons.id, step.id));
}

/**
 * Starts (or resumes) the exercise of a practice step as an IELTS test session
 * @returns The session id
 */
export async function startPractice(user: User, step: PathLesson, model?: string): Promise<string> {
  if (step.kind !== 'practice') throw new HttpError(400, 'This step has no exercise.', 'not_practice');
  const ref = step.ref as { type: PracticeType; test?: string; sessionId?: string; groupIds?: string[] };
  if (ref.sessionId) {
    const [session] = await db
      .select({ id: examSessions.id, status: examSessions.status, answers: examSessions.answers, blueprint: examSessions.blueprint })
      .from(examSessions)
      .where(and(eq(examSessions.id, ref.sessionId), eq(examSessions.userId, user.id)));
    if (session && !(session.status === 'submitted' && isBlankSubmission(session))) return session.id;
    // A blank submission is tried again on the same exercise
    if (session) {
      const [again] = await db
        .insert(examSessions)
        .values({ userId: user.id, exam: 'ielts', mode: 'lesson', blueprint: session.blueprint, timeLimitSec: Math.max(30, step.minutes) * 60 })
        .returning();
      await db.update(pathLessons).set({ ref: { ...ref, sessionId: again.id } }).where(eq(pathLessons.id, step.id));
      return again.id;
    }
  }
  // A rewrite takes the same task again, not a new one
  const sections = ref.groupIds?.length ? [{ component: componentOf(ref.type), groupIds: ref.groupIds }] : await practiceSections(user, ref.type, step.phase, model, ref.test);
  const blueprint: IeltsBlueprint = { exam: 'ielts', sections };
  const [session] = await db
    .insert(examSessions)
    .values({ userId: user.id, exam: 'ielts', mode: 'lesson', blueprint, timeLimitSec: Math.max(30, step.minutes) * 60 })
    .returning();
  await db.update(pathLessons).set({ ref: { ...ref, sessionId: session.id } }).where(eq(pathLessons.id, step.id));
  return session.id;
}

