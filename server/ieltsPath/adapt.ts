/**
 * Lessons that follow the learner: at most one optional step a day is put at the front of the queue when their
 * mistakes show a pattern (docs/plans/ielts-path.md, section 4.4):
 *   a lesson whose drill went under 70%  -> a short review of that lesson the next day
 *   listening: one kind of mistake three or more times in a week -> a listening exercise of the matching kind
 *   reading: a kind of question under 60% over 10 or more questions in two weeks -> practice of that kind
 *   speaking: pronunciation is the lowest criterion and 5.5 or less -> the pronunciation practice
 * A reason is never repeated within a week, and nothing is inserted while the same one is still waiting.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pathLessons, type IeltsPath, type PathLesson } from '../db/schema.js';
import { addDays } from './bands.js';
import { buildErrorBook } from './errors.js';
import { topCategory, weakestType, type ListeningCategory } from './errorRules.js';
import { LESSONS, type StepKind } from './syllabus.js';

export const DRILL_REVIEW_BELOW = 70;
const LISTENING_MIN = 3;
const READING_MIN_QUESTIONS = 10;
const READING_BELOW = 0.6;
const PRONUNCIATION_AT_MOST = 5.5;
const REPEAT_DAYS = 7;

const LISTENING_TYPE: Record<ListeningCategory, string> = { spelling: 'l-form', plural: 'l-form', missed: 'l-form', distractor: 'l-mono', misheard: 'l-mono' };
const READING_TYPE: Record<string, string> = { tfng: 'r-tfng', match: 'r-scan', gap: 'r-short', mcq: 'r-short' };

interface Insert {
  key: string;
  block: PathLesson['block'];
  kind: StepKind;
  ref: Record<string, unknown>;
  minutes: number;
}

/** What to put in front of the learner today, if anything (the first rule that applies) */
export async function chooseInsert(path: IeltsPath, today: string, taken: Set<string>, reviewed: Set<string>, rows: PathLesson[]): Promise<Insert | null> {
  // A lesson whose drill went badly gets a short review
  const weakLesson = rows.find((r) => r.kind === 'lesson' && r.status === 'done' && !(r.ref as { reviewOf?: string }).reviewOf && !reviewed.has(r.id) && typeof (r.result as { drillScore?: number } | null)?.drillScore === 'number' && (r.result as { drillScore: number }).drillScore < DRILL_REVIEW_BELOW);
  if (weakLesson) {
    const lessonId = (weakLesson.ref as { lessonId: string }).lessonId;
    if (LESSONS.some((l) => l.id === lessonId)) return { key: `lesson-review:${weakLesson.id}`, block: weakLesson.block as PathLesson['block'], kind: 'lesson', ref: { lessonId, reviewOf: weakLesson.id }, minutes: 15 };
  }

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
