/**
 * Gates of an IELTS path. Each skill of a gate is an ordinary IELTS exam session (mode "gate") built from the gate's
 * groups, so the usual test screens, timers, audio and AI grading are reused. A gate is finished once every required
 * skill has a band (a teacher's band replaces the AI's). Gate 0 only measures and sets the starting phase; Gates 1-6
 * apply the rules of gateRules.ts: pass, conditional (extra practice, then a retest of one skill) or fail (a buffer
 * week, then the whole gate again as version B), a stop after two fails, and the decisions after Gates 3 and 4.
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems, examSessions, gateAttempts, ieltsPaths, pathLessons, skillLevels, type ExamSession, type GateAttempt, type IeltsPath, type User } from '../db/schema.js';
import type { IeltsBlueprint, IeltsResult } from '../exams/ielts.js';
import { HttpError } from '../http/errors.js';
import { cefrOfIelts } from '../progress/levels.js';
import { quotaDay } from '../services/aiAccess.js';
import { addDays, endPhaseFor, PATH_SKILLS, startPhaseFor, type Bands, type MeasuredBands, type PathSkill } from './bands.js';
import { GATES, type GateDefinition, type GroupSource } from './gateContent.js';
import { decisionAfter, evaluate, loweredTargets, RETEST_AFTER_DAYS, STOP_AFTER_FAILS, versionFor, type Decision, type Evaluation, type Outcome } from './gateRules.js';
import { gateGroups } from './practice.js';
import { assignDays } from './schedule.js';

export type SkillStatus = 'todo' | 'in_progress' | 'grading' | 'failed' | 'done' | 'skipped';

export interface GateSkillView {
  skill: PathSkill;
  optional: boolean;
  minutes: number;
  status: SkillStatus;
  sessionId: string | null;
  band: number | null;
  /** The band came from a teacher, not the AI */
  manual: boolean;
  /** Listening and reading: questions answered correctly */
  correct: number | null;
  total: number | null;
}

export type StartBlock = 'earlier-gate' | 'steps-left' | 'stopped' | 'cleared' | 'in-progress-elsewhere';

export interface RetestView {
  skill: PathSkill;
  status: 'locked' | 'due' | 'in_progress' | 'grading' | 'failed' | 'done';
  /** First day the retest can be taken */
  availableFrom: string;
  sessionId: string | null;
  band: number | null;
}

export interface GateView {
  gate: number;
  attemptId: string | null;
  version: 'A' | 'B';
  /** Finished tries of this gate so far */
  tries: number;
  status: 'not_started' | 'in_progress' | 'finished';
  skills: GateSkillView[];
  bands: MeasuredBands | null;
  finishedAt: Date | null;
  /** Gates 1-6: how the bands compare with the targets (after any retest) */
  evaluation: Evaluation | null;
  outcome: Outcome | null;
  retest: RetestView | null;
  decision: (Decision & { choice: 'accept' | 'decline' | null }) | null;
  /** Whether a try can be started now, and if not, why */
  startBlock: StartBlock | null;
  stopped: boolean;
}

const sessionIds = (attempt: GateAttempt) => attempt.sessions as Partial<Record<PathSkill, string>>;
const skippedOf = (attempt: GateAttempt) => attempt.skipped as PathSkill[];
const manualOf = (attempt: GateAttempt) => attempt.manualBands as Partial<Record<PathSkill, number>>;

const definitionOf = (gate: number): GateDefinition => {
  const definition = GATES[gate];
  if (!definition) throw new HttpError(404, 'This gate is not available.', 'gate_unavailable');
  return definition;
};

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

async function attemptsOf(pathId: string, gate: number): Promise<GateAttempt[]> {
  return db.select().from(gateAttempts).where(and(eq(gateAttempts.pathId, pathId), eq(gateAttempts.gate, gate))).orderBy(asc(gateAttempts.startedAt));
}

async function sessionsOf(attempts: GateAttempt[]): Promise<Map<string, ExamSession>> {
  const ids = attempts.flatMap((a) => Object.values(sessionIds(a))).filter((id): id is string => Boolean(id));
  const rows = ids.length ? await db.select().from(examSessions).where(inArray(examSessions.id, ids)) : [];
  return new Map(rows.map((s) => [s.id, s]));
}

/** Skills of an attempt as the screens show them, with a teacher's band over the AI's */
function skillsView(definition: GateDefinition, attempt: GateAttempt | null, sessions: Map<string, ExamSession>): GateSkillView[] {
  const ids = attempt ? sessionIds(attempt) : {};
  const skipped = attempt ? skippedOf(attempt) : [];
  const manual = attempt ? manualOf(attempt) : {};
  return PATH_SKILLS.map((skill) => {
    const sessionId = ids[skill] ?? null;
    const base = { skill, optional: definition.optional.includes(skill), minutes: definition.minutes[skill], sessionId, manual: false };
    if (skipped.includes(skill) && !sessionId) return { ...base, status: 'skipped' as const, band: null, correct: null, total: null };
    const read = skillFromSession(skill, sessionId ? sessions.get(sessionId) : undefined);
    const teacher = manual[skill];
    // A teacher's band stands in for the AI's, also when the AI could not grade
    if (teacher !== undefined && (skill === 'writing' || skill === 'speaking') && sessionId && read.status !== 'in_progress') return { ...base, ...read, status: 'done' as const, band: teacher, manual: true };
    return { ...base, ...read };
  });
}

const bandsOf = (skills: GateSkillView[]): MeasuredBands => {
  const band = (skill: PathSkill) => skills.find((s) => s.skill === skill)!.band;
  return { listening: band('listening')!, reading: band('reading')!, writing: band('writing'), speaking: band('speaking') };
};

const isComplete = (skills: GateSkillView[]) => skills.every((s) => s.status === 'done' || s.status === 'skipped');

/* ---------- Progress through the gates ---------- */

/** The highest gate cleared (passed, or passed with a condition); gates below the starting phase count as cleared */
export async function clearedGate(path: IeltsPath): Promise<number> {
  const [row] = await db
    .select({ gate: sql<number | null>`max(${gateAttempts.gate})` })
    .from(gateAttempts)
    .where(and(eq(gateAttempts.pathId, path.id), eq(gateAttempts.status, 'finished'), inArray(gateAttempts.outcome, ['pass', 'conditional']), sql`${gateAttempts.retestSkill} is null`, sql`${gateAttempts.gate} >= 1`));
  return Math.max((path.startPhase ?? 1) - 1, row?.gate ?? 0);
}

/** Fails of one gate since the learner last made a new plan */
async function failsOf(path: IeltsPath, gate: number): Promise<number> {
  const rows = await attemptsOf(path.id, gate);
  return rows.filter((a) => !a.retestSkill && a.outcome === 'fail' && (!path.replannedAt || (a.finishedAt ?? new Date(0)) > path.replannedAt)).length;
}

/** The gate the learner works towards (7 once every gate is cleared) */
export async function nextGate(path: IeltsPath): Promise<number> {
  if (path.startPhase === null) return 0;
  return (await clearedGate(path)) + 1;
}

/** Whether every step of a phase is done (a phase with no steps, or one not written yet, counts as done) */
export async function phaseStepsDone(path: IeltsPath, phase: number): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(pathLessons).where(and(eq(pathLessons.pathId, path.id), eq(pathLessons.phase, phase), eq(pathLessons.status, 'todo')));
  return row.n === 0;
}

async function startBlockOf(path: IeltsPath, gate: number, attempts: GateAttempt[]): Promise<StartBlock | null> {
  if (gate === 0) return attempts.some((a) => !a.retestSkill && a.status === 'finished') ? 'cleared' : null;
  const cleared = await clearedGate(path);
  if (gate <= cleared) return 'cleared';
  if (gate > cleared + 1) return 'earlier-gate';
  if ((await failsOf(path, gate)) >= STOP_AFTER_FAILS) return 'stopped';
  if (!(await phaseStepsDone(path, gate))) return 'steps-left';
  const [open] = await db.select({ id: gateAttempts.id }).from(gateAttempts).where(and(eq(gateAttempts.pathId, path.id), eq(gateAttempts.status, 'in_progress'), sql`${gateAttempts.gate} <> ${gate}`)).limit(1);
  return open ? 'in-progress-elsewhere' : null;
}

/* ---------- The gate screens ---------- */

/** Writes measured bands as the learner's skill levels (with the matching CEFR level for the rest of the app) */
async function saveSkillBands(userId: string, bands: Partial<Record<PathSkill, number | null>>): Promise<void> {
  for (const skill of PATH_SKILLS) {
    const band = bands[skill];
    if (band === null || band === undefined) continue;
    const values = { level: cefrOfIelts(band), confidence: 'medium', source: 'gate', band, measuredAt: new Date() };
    await db
      .insert(skillLevels)
      .values({ userId, language: 'en', skill, ...values })
      .onConflictDoUpdate({ target: [skillLevels.userId, skillLevels.language, skillLevels.skill], set: values });
  }
}

/** Steps that practise one skill, by kind of exercise, for extra practice after a gate */
const EXTRA_TYPES: Record<PathSkill, string[]> = {
  listening: ['l-form', 'l-mono'],
  reading: ['r-tfng', 'r-scan'],
  writing: ['w-task1', 'w-task2'],
  speaking: ['s-part1', 's-part2'],
};

/**
 * Appends steps to the end of the learner's queue (week 0 marks them as extra: they belong to no week of the syllabus):
 *  remedial  after a conditional pass: six days of extra practice (about an hour a day) for the weak skill
 *  buffer    after a fail: a week with no new lessons, only practice of the weak skills, before the retake
 */
export async function seedExtraSteps(path: IeltsPath, gate: number, kind: 'remedial' | 'buffer', weak: PathSkill[]): Promise<number> {
  const [last] = await db.select({ seq: sql<number | null>`max(${pathLessons.seq})` }).from(pathLessons).where(eq(pathLessons.pathId, path.id));
  const first = (last?.seq ?? -1) + 1;
  const skills = kind === 'remedial' ? weak.slice(0, 1) : weak.length > 0 ? weak : [...PATH_SKILLS];
  const days = kind === 'remedial' ? 6 : 5;
  const steps: { phase: number; week: number; day: number; block: PathSkill; type: string; minutes: number }[] = [];
  for (let day = 1; day <= days; day++) {
    for (const skill of skills) steps.push({ phase: kind === 'remedial' ? gate + 1 : gate, week: 0, day, block: skill, type: EXTRA_TYPES[skill][(day - 1) % 2], minutes: kind === 'remedial' ? 60 : 40 });
  }
  const planned = assignDays(steps.map((s) => s.minutes), quotaDay(), path.dailyMinutes, path.restDays as number[]);
  await db.insert(pathLessons).values(
    steps.map((s, i) => ({ pathId: path.id, userId: path.userId, seq: first + i, phase: s.phase, week: s.week, studyDay: s.day, block: s.block, kind: 'practice', ref: { type: s.type, [kind]: gate }, core: true, minutes: s.minutes, plannedDay: planned[i] }))
  );
  return steps.length;
}

/** What follows a finished gate: Gate 0 sets the starting phase; later gates add extra steps */
async function afterFinish(path: IeltsPath, gate: number, bands: MeasuredBands, evaluation: Evaluation | null): Promise<void> {
  if (gate === 0) {
    await db.update(ieltsPaths).set({ startPhase: startPhaseFor(bands), startDate: quotaDay(), updatedAt: new Date() }).where(eq(ieltsPaths.id, path.id));
    return;
  }
  if (!evaluation) return;
  if (evaluation.outcome === 'conditional') await seedExtraSteps(path, gate, 'remedial', evaluation.weak);
  else if (evaluation.outcome === 'fail' && (await failsOf(path, gate)) < STOP_AFTER_FAILS) await seedExtraSteps(path, gate, 'buffer', evaluation.weak);
}

const asBands = (bands: MeasuredBands): Bands | null =>
  bands.writing !== null && bands.speaking !== null ? { listening: bands.listening, reading: bands.reading, writing: bands.writing, speaking: bands.speaking } : null;

/** Finishes the open attempt of a gate when every required skill has a band; true when it was finished just now */
async function finalize(path: IeltsPath, definition: GateDefinition, attempt: GateAttempt, skills: GateSkillView[]): Promise<boolean> {
  if (attempt.status !== 'in_progress' || !isComplete(skills)) return false;
  const bands = bandsOf(skills);
  const full = asBands(bands);
  const evaluation = definition.gate >= 1 && full ? evaluate(definition.gate, full) : null;
  const [closed] = await db
    .update(gateAttempts)
    .set({ status: 'finished', bands, outcome: evaluation?.outcome ?? null, finishedAt: new Date() })
    .where(and(eq(gateAttempts.id, attempt.id), eq(gateAttempts.status, 'in_progress')))
    .returning();
  if (!closed) return false;
  await saveSkillBands(path.userId, bands);
  await afterFinish(path, definition.gate, bands, evaluation);
  return true;
}

export async function gateView(path: IeltsPath, gate: number): Promise<GateView> {
  const definition = definitionOf(gate);
  let attempts = await attemptsOf(path.id, gate);
  let sessions = await sessionsOf(attempts);
  const mains = attempts.filter((a) => !a.retestSkill);
  let main = mains.at(-1) ?? null;

  // A teacher's band can arrive after the gate was finished: bring the stored result in line
  let skills = skillsView(definition, main, sessions);
  if (main && (await finalize(path, definition, main, skills))) {
    attempts = await attemptsOf(path.id, gate);
    main = attempts.filter((a) => !a.retestSkill).at(-1) ?? main;
    sessions = await sessionsOf(attempts);
    skills = skillsView(definition, main, sessions);
  }
  const tries = mains.filter((a) => a.status === 'finished').length;
  const stopped = gate >= 1 && (await failsOf(path, gate)) >= STOP_AFTER_FAILS;
  const startBlock = await startBlockOf(path, gate, attempts);
  // The version shown is the attempt's own, except after a fail: then it is the one the retake will be
  const version = main && (main.status === 'in_progress' || main.outcome !== 'fail') ? (main.version as 'A' | 'B') : versionFor(tries);

  const base = { gate, version, tries, skills, stopped, startBlock };
  if (!main) return { ...base, attemptId: null, status: 'not_started', bands: null, finishedAt: null, evaluation: null, outcome: null, retest: null, decision: null };
  if (main.status !== 'finished') return { ...base, attemptId: main.id, status: 'in_progress', bands: null, finishedAt: null, evaluation: null, outcome: null, retest: null, decision: null };

  let bands = main.bands as MeasuredBands;
  // A teacher's band entered after the gate finished replaces the stored one
  const live = bandsOf(skills);
  if (skills.some((s) => s.manual)) bands = { ...bands, writing: live.writing, speaking: live.speaking };
  let retest: RetestView | null = null;
  let evaluation: Evaluation | null = null;
  let outcome: Outcome | null = main.outcome as Outcome | null;
  if (gate >= 1) {
    const stored = asBands(bands);
    if (stored) {
      evaluation = evaluate(gate, stored);
      outcome = evaluation.outcome;
      if (outcome !== main.outcome && skills.some((s) => s.manual)) await db.update(gateAttempts).set({ outcome, bands }).where(eq(gateAttempts.id, main.id));
      if (evaluation.outcome === 'conditional') {
        const skill = evaluation.weak[0];
        const attempt = attempts.filter((a) => a.retestSkill === skill && a.startedAt > (main?.finishedAt ?? new Date(0))).at(-1) ?? null;
        const session = attempt?.sessions && sessionIds(attempt)[skill] ? sessions.get(sessionIds(attempt)[skill]!) : undefined;
        const read = attempt ? skillFromSession(skill, session) : null;
        const availableFrom = addDays(quotaDayOf(main.finishedAt), RETEST_AFTER_DAYS);
        const status: RetestView['status'] = !attempt ? (quotaDay() >= availableFrom ? 'due' : 'locked') : (read!.status === 'todo' || read!.status === 'skipped' ? 'due' : read!.status);
        retest = { skill, status, availableFrom, sessionId: attempt ? (sessionIds(attempt)[skill] ?? null) : null, band: read?.band ?? null };
        // The retest settles the gate: the retested skill takes its new band
        if (retest.band !== null) {
          const merged = asBands(withRetestMeasured(bands, skill, retest.band));
          if (merged) {
            evaluation = evaluate(gate, merged);
            bands = withRetestMeasured(bands, skill, retest.band);
          }
        }
      }
    }
  }

  let decision: GateView['decision'] = null;
  const settled = !retest || retest.status === 'done';
  const fullBands = asBands(bands);
  if (gate >= 1 && fullBands && evaluation && evaluation.outcome !== 'fail' && settled) {
    const found = decisionAfter(gate, fullBands, path.startDate, path.examDate);
    const chosen = (main.decision as { choice?: 'accept' | 'decline' } | null)?.choice ?? null;
    decision = found ? { ...found, choice: chosen } : null;
  }
  return { ...base, attemptId: main.id, status: 'finished', bands, finishedAt: main.finishedAt, evaluation, outcome: evaluation?.outcome ?? outcome, retest, decision };
}

const quotaDayOf = (date: Date | null) => quotaDay(date ?? new Date());

function withRetestMeasured(bands: MeasuredBands, skill: PathSkill, band: number): MeasuredBands {
  return { ...bands, [skill]: Math.max(bands[skill] ?? 0, band) };
}

/* ---------- Running a gate ---------- */

/** The groups of one skill of a gate for a version, drawing unseen pool groups where the gate asks for them */
async function groupsFor(user: User, definition: GateDefinition, version: 'A' | 'B', skill: PathSkill): Promise<string[]> {
  const source: GroupSource = definition.versions[version][skill];
  if (Array.isArray(source)) return source;
  if ('real' in source) {
    // The groups of a real test, when the bank has every one of them; otherwise a generated test of the same size
    const found = await db.select({ id: contentItems.id }).from(contentItems).where(inArray(contentItems.id, source.real));
    if (found.length === source.real.length) return source.real;
  }
  return gateGroups(user, source.pool, definition.gate);
}

/** The open attempt of a gate, created when there is none (a new try is version A the first time and B after) */
async function openAttempt(path: IeltsPath, gate: number): Promise<GateAttempt> {
  const attempts = await attemptsOf(path.id, gate);
  const mains = attempts.filter((a) => !a.retestSkill);
  const open = mains.find((a) => a.status === 'in_progress');
  if (open) return open;
  if (gate === 0 && mains.length > 0) throw new HttpError(409, 'Gate 0 is already finished.', 'gate_finished');
  const block = await startBlockOf(path, gate, attempts);
  if (block) throw new HttpError(409, BLOCK_MESSAGES[block], `gate_${block.replace(/-/g, '_')}`);
  const [row] = await db
    .insert(gateAttempts)
    .values({ pathId: path.id, userId: path.userId, gate, version: versionFor(mains.filter((a) => a.status === 'finished').length) })
    .returning();
  return row;
}

const BLOCK_MESSAGES: Record<StartBlock, string> = {
  'earlier-gate': 'Pass the earlier gate first.',
  'steps-left': 'Finish the steps of this phase first (the gate opens when they are done).',
  stopped: 'You did not pass this gate twice. Make a new plan first.',
  cleared: 'You have already passed this gate.',
  'in-progress-elsewhere': 'Finish the gate you have started first.',
};

async function createSession(user: User, minutes: number, skill: PathSkill, groupIds: string[]): Promise<ExamSession> {
  const blueprint: IeltsBlueprint = { exam: 'ielts', sections: [{ component: skill, groupIds }] };
  const [session] = await db.insert(examSessions).values({ userId: user.id, exam: 'ielts', mode: 'gate', blueprint, timeLimitSec: minutes * 60 }).returning();
  return session;
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
  const groupIds = await groupsFor(user, definition, attempt.version as 'A' | 'B', skill);
  const session = await createSession(user, definition.minutes[skill], skill, groupIds);
  await db
    .update(gateAttempts)
    .set({ sessions: { ...sessionIds(attempt), [skill]: session.id }, skipped: skippedOf(attempt).filter((s) => s !== skill) })
    .where(eq(gateAttempts.id, attempt.id));
  return session.id;
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

/**
 * Starts (or resumes) the retest of the one skill that was half a band short, as version B
 * @returns The exam session id to open
 */
export async function startRetest(user: User, path: IeltsPath, gate: number): Promise<string> {
  const view = await gateView(path, gate);
  const retest = view.retest;
  if (!retest) throw new HttpError(409, 'There is nothing to retake for this gate.', 'no_retest');
  if (retest.sessionId) return retest.sessionId;
  if (retest.status === 'locked') throw new HttpError(409, `The retest opens on ${retest.availableFrom}.`, 'retest_locked');
  const definition = definitionOf(gate);
  const groupIds = await groupsFor(user, definition, 'B', retest.skill);
  const session = await createSession(user, definition.minutes[retest.skill], retest.skill, groupIds);
  await db.insert(gateAttempts).values({ pathId: path.id, userId: path.userId, gate, version: 'B', retestSkill: retest.skill, sessions: { [retest.skill]: session.id }, status: 'finished', finishedAt: new Date() });
  return session.id;
}

/**
 * A teacher's band for writing or speaking replaces the AI's (null takes it back). The result of a gate that is already
 * finished is worked out again: when its outcome changes, the extra steps seeded for the old outcome that are still
 * undone are replaced by those of the new one.
 */
export async function setManualBand(path: IeltsPath, gate: number, skill: 'writing' | 'speaking', band: number | null): Promise<void> {
  if (gate === 0) throw new HttpError(400, 'A teacher cannot set bands for Gate 0.', 'manual_not_for_gate0');
  const definition = definitionOf(gate);
  const attempts = (await attemptsOf(path.id, gate)).filter((a) => !a.retestSkill);
  const attempt = attempts.at(-1);
  if (!attempt || !sessionIds(attempt)[skill]) throw new HttpError(409, 'This part has not been taken yet.', 'not_taken');
  const next = { ...manualOf(attempt) };
  if (band === null) delete next[skill];
  else next[skill] = band;
  const [updated] = await db.update(gateAttempts).set({ manualBands: next }).where(eq(gateAttempts.id, attempt.id)).returning();
  if (updated.status !== 'finished') return;

  const skills = skillsView(definition, updated, await sessionsOf([updated]));
  if (!isComplete(skills)) return;
  const bands = bandsOf(skills);
  const full = asBands(bands);
  if (!full) return;
  const evaluation = evaluate(gate, full);
  await db.update(gateAttempts).set({ bands, outcome: evaluation.outcome }).where(eq(gateAttempts.id, updated.id));
  if (evaluation.outcome === updated.outcome) return;
  await db.delete(pathLessons).where(and(eq(pathLessons.pathId, path.id), eq(pathLessons.status, 'todo'), sql`(${pathLessons.ref}->>'remedial' = ${String(gate)} or ${pathLessons.ref}->>'buffer' = ${String(gate)})`));
  await saveSkillBands(path.userId, bands);
  await afterFinish(path, gate, bands, evaluation);
}

/** What the learner chose after Gate 3 or 4; accepting changes the exam date or the targets */
export async function applyDecision(path: IeltsPath, gate: number, choice: 'accept' | 'decline'): Promise<void> {
  const view = await gateView(path, gate);
  const decision = view.decision;
  if (!decision || !view.attemptId) throw new HttpError(409, 'There is no decision to make.', 'no_decision');
  if (decision.choice) throw new HttpError(409, 'You already made this decision.', 'decision_made');
  await db.update(gateAttempts).set({ decision: { kind: decision.kind, choice } }).where(eq(gateAttempts.id, view.attemptId));
  if (choice !== 'accept') return;
  if (decision.kind === 'move-exam') {
    await db.update(ieltsPaths).set({ examDate: decision.earliest, updatedAt: new Date() }).where(eq(ieltsPaths.id, path.id));
  } else {
    const targets = loweredTargets(path.bandTargets as Bands, decision.overall);
    await db.update(ieltsPaths).set({ bandTargets: targets, endPhase: endPhaseFor(targets), updatedAt: new Date() }).where(eq(ieltsPaths.id, path.id));
  }
}

/** The learner made a new plan after failing a gate twice: the earlier fails stop counting */
export async function replan(path: IeltsPath): Promise<void> {
  await db.update(ieltsPaths).set({ replannedAt: new Date(), updatedAt: new Date() }).where(eq(ieltsPaths.id, path.id));
}

/** One line per gate for the path screen: where each gate stands */
export async function gateHistory(path: IeltsPath): Promise<{ gate: number; outcome: Outcome | 'open' | null; tries: number; bands: MeasuredBands | null; finishedAt: Date | null }[]> {
  const rows = await db.select().from(gateAttempts).where(and(eq(gateAttempts.pathId, path.id), sql`${gateAttempts.gate} >= 1`, sql`${gateAttempts.retestSkill} is null`)).orderBy(desc(gateAttempts.startedAt));
  const byGate = new Map<number, GateAttempt[]>();
  for (const row of rows) byGate.set(row.gate, [...(byGate.get(row.gate) ?? []), row]);
  return [...byGate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gate, list]) => {
      const finished = list.filter((a) => a.status === 'finished');
      const latest = finished[0];
      return { gate, outcome: latest ? ((latest.outcome as Outcome | null) ?? null) : 'open', tries: finished.length, bands: (latest?.bands as MeasuredBands | null) ?? null, finishedAt: latest?.finishedAt ?? null };
    });
}

