/**
 * Lessons that follow the learner: at most one optional step a day is put at the front of the queue when their
 * mistakes show a pattern (docs/plans/ielts-path.md, section 4.4):
 *   a lesson whose drill went under 70%  -> a short review of that lesson the next day
 *   a grammar point that went wrong twice or more in 30 days with no practice since -> its grammar step
 *   listening: one kind of mistake three or more times in a week -> a listening exercise of the matching kind
 *   reading: a kind of question under 60% over 10 or more questions in two weeks -> practice of that kind
 *   speaking: pronunciation is the lowest criterion and 5.5 or less -> the pronunciation practice
 *   writing: a practice task graded under the Writing target of its phase -> the same task again, to rewrite it with the
 *   feedback in hand (once per task, within two weeks)
 *   week 22 of phase 6: the skill furthest below its Gate 6 target in the first mock test gets an extra exercise a day,
 *   so that it has half of the practice time that week
 * A reason is never repeated within a week, and nothing is inserted while the same one is still waiting.
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { examSessions, pathLessons, type IeltsPath, type PathLesson } from '../db/schema.js';
import type { IeltsResult } from '../exams/ielts.js';
import { addDays, gateTarget, type PathSkill } from './bands.js';
import { recentMistakes } from '../grammar/mistakes.js';
import { buildErrorBook } from './errors.js';
import { topCategory, weakestSkill, weakestType, type ListeningCategory } from './errorRules.js';
import { DEFAULT_PRACTICE_MINUTES, LESSONS, type PracticeType, type StepKind } from './syllabus.js';
import { componentOf } from './practice.js';
import type { IeltsBlueprint } from '../exams/ielts.js';

export const DRILL_REVIEW_BELOW = 70;
const LISTENING_MIN = 3;
const READING_MIN_QUESTIONS = 10;
const READING_BELOW = 0.6;
const PRONUNCIATION_AT_MOST = 5.5;
const REPEAT_DAYS = 7;
const GRAMMAR_REVIEW_MINUTES = 20;
const REDO_WINDOW_AGE_MS = 14 * 86_400_000;

const LISTENING_TYPE: Record<ListeningCategory, string> = { spelling: 'l-form', plural: 'l-form', missed: 'l-form', distractor: 'l-mono', misheard: 'l-mono' };
const READING_TYPE: Record<string, string> = { tfng: 'r-tfng', match: 'r-scan', gap: 'r-short', mcq: 'r-short' };

/** Phase 6: the first whole mock test is in week 21, the week of the weakest skill is week 22 */
const MOCK_PHASE = 6;
const MOCK_WEEK = 21;
const WEAKEST_WEEK = 22;

/** The exercises of the extra step each day of the week of the weakest skill */
const WEAKEST_ROTATION: Record<PathSkill, PracticeType[]> = {
  listening: ['l-sec3', 'l-sec4', 'l-test30', 'l-sec4', 'l-sec3'],
  reading: ['r-passage', 'r-summary', 'r-ynng', 'r-matchinfo', 'r-passage'],
  writing: ['w-opinion', 'w-discuss', 'w-problem', 'w-twopart', 'w-advdis'],
  speaking: ['s-full', 's-part2', 's-full', 's-part1', 's-full'],
};

/**
 * The bands of the first mock test from its submitted sessions; null while its Writing or Speaking is still being
 * graded (the weakest skill cannot be told yet) or when there is no result
 */
export async function mockBands(rows: PathLesson[]): Promise<Partial<Record<PathSkill, number>> | null> {
  const ids = rows
    .filter((r) => r.kind === 'practice' && r.phase === MOCK_PHASE && r.week === MOCK_WEEK && (r.ref as { test?: string }).test && (r.ref as { sessionId?: string }).sessionId)
    .map((r) => (r.ref as { sessionId: string }).sessionId);
  if (ids.length === 0) return null;
  const sessions = await db.select({ result: examSessions.result, status: examSessions.status }).from(examSessions).where(inArray(examSessions.id, ids));
  const bands: Partial<Record<PathSkill, number>> = {};
  for (const session of sessions) {
    const result = session.result as IeltsResult | null;
    if (session.status !== 'submitted' || !result) continue;
    if (result.listening) bands.listening = result.listening.band;
    if (result.reading) bands.reading = result.reading.band;
    if (result.writing?.status === 'pending') return null;
    if (result.writing?.status === 'done' && result.writing.band !== null) bands.writing = result.writing.band;
    if (result.speaking?.status === 'pending') return null;
    if (result.speaking?.status === 'done' && result.speaking.band !== null) bands.speaking = result.speaking.band;
  }
  return Object.keys(bands).length > 0 ? bands : null;
}

/**
 * A graded writing practice task that fell under the Writing target of its phase's gate and has not been redone: the
 * learner writes the same task again. A rewrite is never redone itself, so nobody is stuck on one prompt.
 */
export async function writingRedo(rows: PathLesson[], now = new Date()): Promise<{ id: string; type: PracticeType; groupIds: string[]; minutes: number } | null> {
  const redone = new Set(rows.map((r) => (r.ref as { redoOf?: string }).redoOf).filter((id): id is string => Boolean(id)));
  const since = now.getTime() - REDO_WINDOW_AGE_MS;
  const candidates = rows
    .filter((r) => {
      const ref = r.ref as { type?: PracticeType; test?: string; sessionId?: string; redoOf?: string };
      return r.kind === 'practice' && r.status === 'done' && ref.type && componentOf(ref.type) === 'writing' && !ref.test && !ref.redoOf && ref.sessionId && !redone.has(r.id) && r.doneAt !== null && r.doneAt.getTime() >= since;
    })
    .sort((a, b) => a.seq - b.seq);
  if (candidates.length === 0) return null;
  const sessions = await db
    .select({ id: examSessions.id, result: examSessions.result, blueprint: examSessions.blueprint })
    .from(examSessions)
    .where(inArray(examSessions.id, candidates.map((r) => (r.ref as { sessionId: string }).sessionId)));
  for (const row of candidates) {
    const session = sessions.find((s) => s.id === (row.ref as { sessionId: string }).sessionId);
    const writing = (session?.result as IeltsResult | null)?.writing;
    if (!session || writing?.status !== 'done' || writing.band === null) continue;
    if (writing.band >= gateTarget(Math.min(Math.max(row.phase, 1), 6), 'writing')) continue;
    const groupIds = (session.blueprint as IeltsBlueprint).sections.filter((s) => s.component === 'writing').flatMap((s) => s.groupIds);
    if (groupIds.length === 0) continue;
    const type = (row.ref as { type: PracticeType }).type;
    return { id: row.id, type, groupIds, minutes: row.minutes || DEFAULT_PRACTICE_MINUTES[type] };
  }
  return null;
}

interface Insert {
  key: string;
  block: PathLesson['block'];
  kind: StepKind;
  ref: Record<string, unknown>;
  minutes: number;
}

/** What to put in front of the learner today, if anything (the first rule that applies) */
export async function chooseInsert(path: IeltsPath, today: string, taken: Set<string>, reviewed: Set<string>, rows: PathLesson[]): Promise<Insert | null> {
  // The week of the weakest skill: an extra exercise a day for the skill furthest below its Gate 6 target in the first mock
  const front = rows.filter((r) => r.status === 'todo').sort((a, b) => a.seq - b.seq)[0];
  if (front && front.phase === MOCK_PHASE && front.week === WEAKEST_WEEK) {
    const bands = await mockBands(rows);
    const weak = bands ? weakestSkill(bands, (skill) => gateTarget(6, skill)) : null;
    if (weak) {
      const kinds = WEAKEST_ROTATION[weak.skill];
      let type = kinds[(Math.min(Math.max(front.studyDay, 1), 6) - 1) % kinds.length];
      // Listening and Reading: the kind of mistake or question the error book shows most
      if (weak.skill === 'listening') {
        const category = topCategory((await buildErrorBook(path.userId, new Date(`${addDays(today, -7)}T00:00:00+07:00`))).listening.byCategory, 2);
        if (category) type = LISTENING_TYPE[category] as PracticeType;
      } else if (weak.skill === 'reading') {
        const kind = weakestType((await buildErrorBook(path.userId, new Date(`${addDays(today, -14)}T00:00:00+07:00`))).reading.byType, 6, 0.7);
        if (kind) type = READING_TYPE[kind.type] as PracticeType;
      }
      return { key: `weakest-${weak.skill}:${today}`, block: weak.skill, kind: 'practice', ref: { type }, minutes: DEFAULT_PRACTICE_MINUTES[type] };
    }
  }

  // A writing task graded under the target of its phase is written again, with its feedback in hand
  const redo = await writingRedo(rows);
  if (redo) return { key: `writing-redo:${redo.id}`, block: 'writing', kind: 'practice', ref: { type: redo.type, redoOf: redo.id, groupIds: redo.groupIds }, minutes: redo.minutes };

  // A lesson whose drill went badly gets a short review
  const weakLesson = rows.find((r) => r.kind === 'lesson' && r.status === 'done' && !(r.ref as { reviewOf?: string }).reviewOf && !reviewed.has(r.id) && typeof (r.result as { drillScore?: number } | null)?.drillScore === 'number' && (r.result as { drillScore: number }).drillScore < DRILL_REVIEW_BELOW);
  if (weakLesson) {
    const lessonId = (weakLesson.ref as { lessonId: string }).lessonId;
    if (LESSONS.some((l) => l.id === lessonId)) return { key: `lesson-review:${weakLesson.id}`, block: weakLesson.block as PathLesson['block'], kind: 'lesson', ref: { lessonId, reviewOf: weakLesson.id }, minutes: 15 };
  }

  // A grammar point that keeps going wrong, with no practice since the last mistake
  const urgent = (await recentMistakes(path.userId)).find((m) => m.urgent && !taken.has(`grammar-${m.pointId}`));
  if (urgent) return { key: `grammar-${urgent.pointId}`, block: 'vocab-grammar', kind: 'grammar', ref: { pointId: urgent.pointId }, minutes: GRAMMAR_REVIEW_MINUTES };

  const week = await buildErrorBook(path.userId, new Date(`${addDays(today, -7)}T00:00:00+07:00`));
  const category = topCategory(week.listening.byCategory, LISTENING_MIN);
  if (category && !taken.has(`listening-${category}`)) return { key: `listening-${category}`, block: 'listening', kind: 'practice', ref: { type: LISTENING_TYPE[category] }, minutes: 30 };

  const fortnight = await buildErrorBook(path.userId, new Date(`${addDays(today, -14)}T00:00:00+07:00`));
  const weak = weakestType(fortnight.reading.byType, READING_MIN_QUESTIONS, READING_BELOW);
  if (weak && !taken.has(`reading-${weak.type}`)) return { key: `reading-${weak.type}`, block: 'reading', kind: 'practice', ref: { type: READING_TYPE[weak.type] }, minutes: 35 };

  const low = fortnight.speaking.lowest;
  if (low && low.key === 'P' && low.band <= PRONUNCIATION_AT_MOST && !taken.has('speaking-pronunciation')) return { key: 'speaking-pronunciation', block: 'speaking', kind: 'pronunciation', ref: {}, minutes: 15 };
  return null;
}

/**
 * Puts at most one optional step at the front of today's queue
 * @returns Whether a step was added
 */
export async function adaptSteps(path: IeltsPath, today: string): Promise<boolean> {
  const rows = await db.select().from(pathLessons).where(eq(pathLessons.pathId, path.id));
  const adaptive = rows.filter((r) => (r.ref as { adaptive?: string }).adaptive);
  if (adaptive.some((r) => (r.ref as { adaptiveDay?: string }).adaptiveDay === today)) return false;

  // Reasons waiting, or used within the last week
  const weekAgo = addDays(today, -REPEAT_DAYS);
  const taken = new Set(adaptive.filter((r) => r.status === 'todo' || ((r.ref as { adaptiveDay?: string }).adaptiveDay ?? '') >= weekAgo).map((r) => (r.ref as { adaptive: string }).adaptive));
  const reviewed = new Set(rows.map((r) => (r.ref as { reviewOf?: string }).reviewOf).filter((id): id is string => Boolean(id)));
  const first = rows.filter((r) => r.status === 'todo').sort((a, b) => a.seq - b.seq)[0];
  if (!first) return false;

  const insert = await chooseInsert(path, today, taken, reviewed, rows);
  if (!insert || taken.has(insert.key)) return false;

  await db.transaction(async (tx) => {
    // Make room at the front of the queue (two steps, so the unique order never clashes half way)
    await tx.update(pathLessons).set({ seq: sql`${pathLessons.seq} + 1000000` }).where(and(eq(pathLessons.pathId, path.id), gte(pathLessons.seq, first.seq)));
    await tx.update(pathLessons).set({ seq: sql`${pathLessons.seq} - 999999` }).where(and(eq(pathLessons.pathId, path.id), gte(pathLessons.seq, 1_000_000)));
    await tx.insert(pathLessons).values({
      pathId: path.id,
      userId: path.userId,
      seq: first.seq,
      phase: first.phase,
      week: first.week,
      studyDay: first.studyDay,
      block: insert.block,
      kind: insert.kind,
      ref: { ...insert.ref, adaptive: insert.key, adaptiveDay: today },
      core: false,
      minutes: insert.minutes,
      plannedDay: today,
    });
  });
  return true;
}
