/**
 * The progress report of the IELTS Path: where the learner stands against the targets, the gates passed, what to work
 * on, and how far the AI's writing and speaking bands are from a teacher's (so the grading prompts can be tuned).
 */
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { gateAttempts, type GateAttempt, type IeltsPath } from '../db/schema.js';
import { quotaDay } from '../services/aiAccess.js';
import { overallOf, type Bands, type PathSkill } from './bands.js';
import { gateHistory, sessionsOf, skillFromSession } from './gates.js';
import { pathToday, type PathTodayView } from './today.js';

export interface Calibration {
  skill: 'writing' | 'speaking';
  gate: number;
  ai: number;
  teacher: number;
}

export interface PathReport {
  generatedOn: string;
  startDate: string | null;
  examDate: string | null;
  daysToExam: number | null;
  targets: Bands;
  overallTarget: number;
  position: PathTodayView['position'];
  progress: PathTodayView['progress'] & { percent: number };
  eta: PathTodayView['eta'];
  behind: PathTodayView['behind'];
  bands: PathTodayView['bands'];
  focus: PathTodayView['focus'];
  gates: Awaited<ReturnType<typeof gateHistory>>;
  /** Writing and speaking bands the AI gave next to a teacher's, and the mean difference (teacher minus AI) */
  calibration: { pairs: Calibration[]; meanDiff: { writing: number | null; speaking: number | null } };
}

const dayNumber = (iso: string) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000);

const mean = (values: number[]) => (values.length === 0 ? null : Math.round((values.reduce((n, v) => n + v, 0) / values.length) * 100) / 100);

/** Pairs of the AI's band and the teacher's band for every graded writing or speaking test of the path */
export async function calibrationOf(path: IeltsPath): Promise<PathReport['calibration']> {
  const attempts: GateAttempt[] = await db.select().from(gateAttempts).where(and(eq(gateAttempts.pathId, path.id))).orderBy(asc(gateAttempts.startedAt));
  const withTeacher = attempts.filter((a) => Object.keys((a.manualBands ?? {}) as object).length > 0);
  const sessions = await sessionsOf(withTeacher);
  const pairs: Calibration[] = [];
  for (const attempt of withTeacher) {
    const manual = attempt.manualBands as Partial<Record<PathSkill, number>>;
    const ids = attempt.sessions as Partial<Record<PathSkill, string>>;
    for (const skill of ['writing', 'speaking'] as const) {
      const teacher = manual[skill];
      const id = ids[skill];
      if (teacher === undefined || !id) continue;
      // Read the session itself: the screens show the teacher's band over it
      const ai = skillFromSession(skill, sessions.get(id)).band;
      if (ai !== null) pairs.push({ skill, gate: attempt.gate, ai, teacher });
    }
  }
  const diffs = (skill: 'writing' | 'speaking') => pairs.filter((p) => p.skill === skill).map((p) => p.teacher - p.ai);
  return { pairs, meanDiff: { writing: mean(diffs('writing')), speaking: mean(diffs('speaking')) } };
}

export async function buildReport(path: IeltsPath, today = quotaDay()): Promise<PathReport> {
  const view = await pathToday(path, today);
  const targets = path.bandTargets as Bands;
  const total = view.progress.total;
  return {
    generatedOn: today,
    startDate: path.startDate,
    examDate: path.examDate,
    daysToExam: path.examDate ? dayNumber(path.examDate) - dayNumber(today) : null,
    targets,
    overallTarget: overallOf(targets),
    position: view.position,
    progress: { ...view.progress, percent: total === 0 ? 0 : Math.round((view.progress.done / total) * 100) },
    eta: view.eta,
    behind: view.behind,
    bands: view.bands,
    focus: view.focus,
    gates: await gateHistory(path),
    calibration: await calibrationOf(path),
  };
}

