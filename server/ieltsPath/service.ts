/**
 * IELTS Path: create and read a learner's path, and run its gates. Each skill of a gate is an ordinary IELTS exam
 * session (mode "gate") built from the gate's fixed groups, so the usual test screens, timers, audio and AI grading
 * are reused. A gate is finished once every required skill has a band; Gate 0 then sets the starting phase.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { examSessions, gateAttempts, ieltsPaths, skillLevels, type ExamSession, type GateAttempt, type IeltsPath, type User } from '../db/schema.js';
import type { IeltsResult } from '../exams/ielts.js';
import { HttpError } from '../http/errors.js';
import { cefrOfIelts } from '../progress/levels.js';
import { quotaDay } from '../services/aiAccess.js';
import { buildPathPlan, endPhaseFor, overallOf, PATH_SKILLS, startPhaseFor, type Bands, type MeasuredBands, type PathSkill } from './bands.js';
import { GATES } from './gateContent.js';

export interface PathInput {
  bandTargets: Bands;
  examDate: string | null;
  dailyMinutes: number;
  restDays: number[];
}

/** The learner's active path, if any */
export async function activePath(userId: string): Promise<IeltsPath | null> {
  const [row] = await db
    .select()
    .from(ieltsPaths)
    .where(and(eq(ieltsPaths.userId, userId), eq(ieltsPaths.status, 'active')))
    .orderBy(desc(ieltsPaths.createdAt))
    .limit(1);
  return row ?? null;
}

/** Creates a path (archiving the previous one) */
export async function createPath(userId: string, input: PathInput): Promise<IeltsPath> {
  return db.transaction(async (tx) => {
    await tx.update(ieltsPaths).set({ status: 'archived', updatedAt: new Date() }).where(and(eq(ieltsPaths.userId, userId), eq(ieltsPaths.status, 'active')));
    const [row] = await tx
      .insert(ieltsPaths)
      .values({ userId, bandTargets: input.bandTargets, examDate: input.examDate, dailyMinutes: input.dailyMinutes, restDays: input.restDays, endPhase: endPhaseFor(input.bandTargets) })
      .returning();
    return row;
  });
}

/** Changes the exam date, daily minutes or rest days of the active path */
export async function updatePath(path: IeltsPath, change: Partial<Pick<PathInput, 'examDate' | 'dailyMinutes' | 'restDays'>>): Promise<IeltsPath> {
  const [row] = await db.update(ieltsPaths).set({ ...change, updatedAt: new Date() }).where(eq(ieltsPaths.id, path.id)).returning();
  return row;
}

export async function archivePath(path: IeltsPath): Promise<void> {
  await db.update(ieltsPaths).set({ status: 'archived', updatedAt: new Date() }).where(eq(ieltsPaths.id, path.id));
}

/* ---------- Gates ---------- */

export type SkillStatus = 'todo' | 'in_progress' | 'grading' | 'failed' | 'done' | 'skipped';

export interface GateSkillView {
  skill: PathSkill;
  optional: boolean;
  minutes: number;
  status: SkillStatus;
  sessionId: string | null;
  band: number | null;
  /** Listening and reading: questions answered correctly */
  correct: number | null;
  total: number | null;
}

export interface GateView {
  gate: number;
  attemptId: string | null;
  status: 'not_started' | 'in_progress' | 'finished';
  skills: GateSkillView[];
  bands: MeasuredBands | null;
  finishedAt: Date | null;
}

const sessionIds = (attempt: GateAttempt) => attempt.sessions as Partial<Record<PathSkill, string>>;
const skippedOf = (attempt: GateAttempt) => attempt.skipped as PathSkill[];

/** Band and status of one skill, read from its exam session */
function skillFromSession(skill: PathSkill, session: ExamSession | undefined): Pick<GateSkillView, 'status' | 'band' | 'correct' | 'total'> {
  if (!session) return { status: 'todo', band: null, correct: null, total: null };
  if (session.status === 'in_progress') return { status: 'in_progress', band: null, correct: null, total: null };
  const result = session.result as IeltsResult | null;
  if (skill === 'listening' || skill === 'reading') {
    const part = result?.[skill];
    return part ? { status: 'done', band: part.band, correct: part.correct, total: part.total } : { status: 'failed', band: null, correct: null, total: null };
  }
  const part = result?.[skill];
  if (!part || part.status === 'pending') return { status: 'grading', band: null, correct: null, total: null };
  if (part.status === 'failed' || part.band === null) return { status: 'failed', band: null, correct: null, total: null };
  return { status: 'done', band: part.band, correct: null, total: null };
}

async function latestAttempt(pathId: string, gate: number): Promise<GateAttempt | null> {
  const [row] = await db
    .select()
    .from(gateAttempts)
    .where(and(eq(gateAttempts.pathId, pathId), eq(gateAttempts.gate, gate)))
    .orderBy(desc(gateAttempts.startedAt))
    .limit(1);
  return row ?? null;
}

function definitionOf(gate: number) {
  const definition = GATES[gate];
  if (!definition) throw new HttpError(404, 'This gate is not available yet.', 'gate_unavailable');
  return definition;
}

/** Writes measured bands as the learner's skill levels (with the matching CEFR level for the rest of the app) */
async function saveSkillBands(userId: string, bands: MeasuredBands): Promise<void> {
  for (const skill of PATH_SKILLS) {
    const band = bands[skill];
    if (band === null) continue;
    const values = { level: cefrOfIelts(band), confidence: 'medium', source: 'gate', band, measuredAt: new Date() };
    await db
      .insert(skillLevels)
      .values({ userId, language: 'en', skill, ...values })
      .onConflictDoUpdate({ target: [skillLevels.userId, skillLevels.language, skillLevels.skill], set: values });
  }
}

/**
 * The gate's state for the screens. Finishes the attempt when every required skill has a band: the bands are saved,
 * and for Gate 0 the path gets its starting phase and start date.
 */
export async function gateView(path: IeltsPath, gate: number): Promise<GateView> {
  const definition = definitionOf(gate);
  const attempt = await latestAttempt(path.id, gate);
  const ids = attempt ? sessionIds(attempt) : {};
  const skipped = attempt ? skippedOf(attempt) : [];
  const idList = Object.values(ids).filter((id): id is string => Boolean(id));
  const sessions = idList.length ? await db.select().from(examSessions).where(inArray(examSessions.id, idList)) : [];
  const byId = new Map(sessions.map((s) => [s.id, s]));

  const skills: GateSkillView[] = PATH_SKILLS.map((skill) => {
    const optional = definition.optional.includes(skill);
    const sessionId = ids[skill] ?? null;
    const base = { skill, optional, minutes: definition.minutes[skill], sessionId };
    if (skipped.includes(skill) && !sessionId) return { ...base, status: 'skipped' as const, band: null, correct: null, total: null };
    return { ...base, ...skillFromSession(skill, sessionId ? byId.get(sessionId) : undefined) };
  });

  if (!attempt) return { gate, attemptId: null, status: 'not_started', skills, bands: null, finishedAt: null };
  if (attempt.status === 'finished') return { gate, attemptId: attempt.id, status: 'finished', skills, bands: attempt.bands as MeasuredBands, finishedAt: attempt.finishedAt };

  const complete = skills.every((s) => s.status === 'done' || s.status === 'skipped');
  if (!complete) return { gate, attemptId: attempt.id, status: 'in_progress', skills, bands: null, finishedAt: null };

  const band = (skill: PathSkill) => skills.find((s) => s.skill === skill)!.band;
  const bands: MeasuredBands = { listening: band('listening')!, reading: band('reading')!, writing: band('writing'), speaking: band('speaking') };
  const finishedAt = new Date();
  await db.transaction(async (tx) => {
    await tx.update(gateAttempts).set({ status: 'finished', bands, finishedAt }).where(eq(gateAttempts.id, attempt.id));
    if (gate === 0) await tx.update(ieltsPaths).set({ startPhase: startPhaseFor(bands), startDate: quotaDay(), updatedAt: finishedAt }).where(eq(ieltsPaths.id, path.id));
  });
  await saveSkillBands(path.userId, bands);
  return { gate, attemptId: attempt.id, status: 'finished', skills, bands, finishedAt };
}

/** The open attempt of a gate, created when there is none */
async function openAttempt(path: IeltsPath, gate: number): Promise<GateAttempt> {
  const latest = await latestAttempt(path.id, gate);
  if (latest?.status === 'in_progress') return latest;
  if (latest && gate === 0) throw new HttpError(409, 'Gate 0 is already finished.', 'gate_finished');
  const [row] = await db
    .insert(gateAttempts)
    .values({ pathId: path.id, userId: path.userId, gate, version: latest ? 'B' : 'A' })
    .returning();
  return row;
}

/**
 * Starts (or resumes) one skill of a gate as an IELTS exam session
 * @returns The exam session id to open
 */
export async function startGateSkill(user: User, path: IeltsPath, gate: number, skill: PathSkill): Promise<string> {
  const definition = definitionOf(gate);
  const attempt = await openAttempt(path, gate);
  const existing = sessionIds(attempt)[skill];
  if (existing) return existing;

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(examSessions)
      .values({
        userId: user.id,
        exam: 'ielts',
        mode: 'gate',
        blueprint: { exam: 'ielts', sections: [{ component: skill, groupIds: definition.groups[skill] }] },
        timeLimitSec: definition.minutes[skill] * 60,
      })
      .returning();
    await tx
      .update(gateAttempts)
      .set({ sessions: { ...sessionIds(attempt), [skill]: session.id }, skipped: skippedOf(attempt).filter((s) => s !== skill) })
      .where(eq(gateAttempts.id, attempt.id));
    return session.id;
  });
}

/** Skips an optional skill, or takes the skip back */
export async function setSkillSkipped(path: IeltsPath, gate: number, skill: PathSkill, skipped: boolean): Promise<void> {
  const definition = definitionOf(gate);
  if (!definition.optional.includes(skill)) throw new HttpError(400, 'This part cannot be skipped.', 'not_optional');
  const attempt = await openAttempt(path, gate);
  if (sessionIds(attempt)[skill]) throw new HttpError(409, 'This part has already been started.', 'already_started');
  const current = skippedOf(attempt).filter((s) => s !== skill);
  await db.update(gateAttempts).set({ skipped: skipped ? [...current, skill] : current }).where(eq(gateAttempts.id, attempt.id));
}

/* ---------- Path view ---------- */

export async function pathView(path: IeltsPath) {
  const gate0 = await gateView(path, 0);
  // Gate 0 may have just finished: read the path again for its starting phase
  const fresh = gate0.status === 'finished' && path.startPhase === null ? ((await activePath(path.userId)) ?? path) : path;
  const targets = fresh.bandTargets as Bands;
  const plan =
    fresh.startPhase !== null && fresh.startDate
      ? buildPathPlan({
          startPhase: fresh.startPhase,
          endPhase: fresh.endPhase,
          dailyMinutes: fresh.dailyMinutes,
          restDays: fresh.restDays as number[],
          startDate: fresh.startDate,
          examDate: fresh.examDate,
          measuredAll: gate0.bands?.writing != null && gate0.bands?.speaking != null,
        })
      : null;
  return {
    id: fresh.id,
    bandTargets: targets,
    overallTarget: overallOf(targets),
    examDate: fresh.examDate,
    dailyMinutes: fresh.dailyMinutes,
    restDays: fresh.restDays as number[],
    startPhase: fresh.startPhase,
    endPhase: fresh.endPhase,
    startDate: fresh.startDate,
    gate0,
    plan,
  };
}
