/**
 * Running a placement test: start or resume, serve one question at a time, grade on the server, and save the
 * measured levels when the last skill is done. The right answer is never sent while the test is running.
 */
import { randomInt } from 'node:crypto';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { placementQuestions, placementSessions, skillLevels, type User } from '../db/schema.js';
import {
  currentSkill, estimate, initialState, nearestLevel, overallLevel, PLACEMENT_SKILLS, QUESTIONS_PER_SKILL, recordAnswer, targetLevel,
  type PlacementSkill, type SkillResult, type TestState,
} from './engine.js';

export interface PublicQuestion {
  id: string;
  skill: PlacementSkill;
  prompt: string;
  context: string | null;
  options: string[];
}

export interface PlacementResult {
  levels: Record<PlacementSkill, SkillResult | null>;
  overall: string | null;
  answered: number;
  correct: number;
}

const TOTAL = Object.values(QUESTIONS_PER_SKILL).reduce((a, b) => a + b, 0);

/** Picks the next question for the current skill, or finishes skills that have none left */
async function advance(state: TestState): Promise<{ state: TestState; question: PublicQuestion | null }> {
  let next = state;
  for (;;) {
    const skill = currentSkill(next);
    if (!skill) return { state: { ...next, pending: null }, question: null };
    const asked = next.skills[skill].asked;
    const rows = await db
      .select()
      .from(placementQuestions)
      .where(
        and(
          eq(placementQuestions.language, 'en'),
          eq(placementQuestions.skill, skill),
          eq(placementQuestions.status, 'approved'),
          asked.length ? notInArray(placementQuestions.id, asked.map((a) => a.id)) : undefined
        )
      );
    if (rows.length === 0) {
      next = { ...next, skills: { ...next.skills, [skill]: { ...next.skills[skill], done: true } } };
      continue;
    }
    const level = nearestLevel(targetLevel(next.startLevel, asked), (l) => rows.some((r) => r.level === l))!;
    const pool = rows.filter((r) => r.level === level);
    const row = pool[randomInt(pool.length)];
    return {
      state: { ...next, pending: { id: row.id, skill, level } },
      question: { id: row.id, skill, prompt: row.prompt, context: row.context, options: row.options as string[] },
    };
  }
}

function view(state: TestState, question: PublicQuestion | null, extra: { id: string; status: string; result: PlacementResult | null }) {
  const phases = PLACEMENT_SKILLS.map((skill) => ({ skill, asked: state.skills[skill].asked.length, total: QUESTIONS_PER_SKILL[skill], done: state.skills[skill].done }));
  const answered = phases.reduce((n, p) => n + p.asked, 0);
  return { ...extra, question, progress: { phases, answered, total: TOTAL, phase: Math.max(1, PLACEMENT_SKILLS.indexOf(question?.skill ?? currentSkill(state) ?? 'listening') + 1) } };
}

async function question(id: string): Promise<PublicQuestion | null> {
  const [row] = await db.select().from(placementQuestions).where(eq(placementQuestions.id, id)).limit(1);
  return row ? { id: row.id, skill: row.skill as PlacementSkill, prompt: row.prompt, context: row.context, options: row.options as string[] } : null;
}

/** The learner's in-progress test (resumed with its pending question), if any */
export async function currentSession(userId: string) {
  const [row] = await db
    .select()
    .from(placementSessions)
    .where(and(eq(placementSessions.userId, userId), eq(placementSessions.language, 'en'), eq(placementSessions.status, 'in_progress')))
    .orderBy(desc(placementSessions.startedAt))
    .limit(1);
  if (!row) return null;
  const state = row.state as TestState;
  return view(state, state.pending ? await question(state.pending.id) : null, { id: row.id, status: row.status, result: null });
}

export async function latestLevels(userId: string) {
  const rows = await db.select().from(skillLevels).where(and(eq(skillLevels.userId, userId), eq(skillLevels.language, 'en')));
  if (rows.length === 0) return null;
  const levels = Object.fromEntries(rows.map((r) => [r.skill, { level: r.level, confidence: r.confidence }]));
  return { levels, overall: overallLevel(levels as Record<string, SkillResult>), measuredAt: rows.reduce((a, r) => (r.measuredAt > a ? r.measuredAt : a), rows[0].measuredAt) };
}

/** Starts a test, or resumes the one in progress. Null when the bank has no questions at all. */
export async function startSession(user: User) {
  const existing = await currentSession(user.id);
  if (existing) return existing;
  const first = await advance(initialState(user.cefrLevel ?? 'B1'));
  if (!first.question) return null;
  const [row] = await db.insert(placementSessions).values({ userId: user.id, language: 'en', state: first.state }).returning();
  return view(first.state, first.question, { id: row.id, status: row.status, result: null });
}

export class PlacementError extends Error {
  constructor(public code: 'not_found' | 'wrong_question' | 'bad_choice') {
    super(code);
  }
}

/** Grades the answer to the pending question and returns the next question, or the result when done */
export async function answer(userId: string, sessionId: string, questionId: string, choice: number) {
  const [row] = await db.select().from(placementSessions).where(and(eq(placementSessions.id, sessionId), eq(placementSessions.userId, userId))).limit(1);
  if (!row || row.status !== 'in_progress') throw new PlacementError('not_found');
  const state = row.state as TestState;
  if (!state.pending || state.pending.id !== questionId) throw new PlacementError('wrong_question');
  const [q] = await db.select().from(placementQuestions).where(eq(placementQuestions.id, questionId)).limit(1);
  if (!q) throw new PlacementError('not_found');
  if (!Number.isInteger(choice) || choice < 0 || choice >= (q.options as string[]).length) throw new PlacementError('bad_choice');

  const graded = recordAnswer(state, choice === q.answerIndex);
  const next = await advance(graded);
  if (next.question) {
    await db.update(placementSessions).set({ state: next.state }).where(eq(placementSessions.id, sessionId));
    return view(next.state, next.question, { id: sessionId, status: 'in_progress', result: null });
  }

  const levels = Object.fromEntries(PLACEMENT_SKILLS.map((s) => [s, estimate(next.state.skills[s].asked)])) as Record<PlacementSkill, SkillResult | null>;
  const all = PLACEMENT_SKILLS.flatMap((s) => next.state.skills[s].asked);
  const result: PlacementResult = { levels, overall: overallLevel(levels), answered: all.length, correct: all.filter((a) => a.correct).length };
  await db.transaction(async (tx) => {
    await tx.update(placementSessions).set({ state: next.state, status: 'finished', result, finishedAt: new Date() }).where(eq(placementSessions.id, sessionId));
    for (const skill of PLACEMENT_SKILLS) {
      const r = levels[skill];
      if (!r) continue;
      await tx
        .insert(skillLevels)
        .values({ userId, language: 'en', skill, level: r.level, confidence: r.confidence, source: 'placement' })
        .onConflictDoUpdate({ target: [skillLevels.userId, skillLevels.language, skillLevels.skill], set: { level: r.level, confidence: r.confidence, source: 'placement', measuredAt: new Date() } });
    }
  });
  return view(next.state, null, { id: sessionId, status: 'finished', result });
}
