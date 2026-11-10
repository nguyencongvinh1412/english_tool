import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { examSessions, ieltsPaths, pathLessons, skillLevels } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureGateContent, GATE_GROUPS } from '../ieltsPath/gateContent.js';
import { ensurePathLessons } from '../ieltsPath/lessons.js';
import { ensurePracticeContent } from '../ieltsPath/practiceContent.js';
import { quotaDay } from '../services/aiAccess.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(async () => 'Mock reply'),
  listAllowedModels: vi.fn(async () => ['claude-haiku-5-5']),
}));

const app = createApp();
const body = { bandTargets: { listening: 7.5, reading: 7.5, writing: 6.5, speaking: 6.5 }, examDate: null, dailyMinutes: 240, restDays: [] };

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await ensureGateContent();
  await ensurePracticeContent();
  await ensurePathLessons();
  vi.mocked(sendChatMessage).mockClear();
});
afterAll(closeDb);

type Agent = Awaited<ReturnType<typeof signIn>>;
const todayOf = async (agent: Agent) => (await agent.get('/api/ielts-path/today')).body.today;

async function startedPath(agent: Agent) {
  await agent.post('/api/ielts-path').send(body);
  await db.update(ieltsPaths).set({ startPhase: 1, startDate: quotaDay() });
  await todayOf(agent);
}

/** A submitted IELTS session with the given answers (as if the learner had taken it) */
async function submitted(userId: string, component: 'listening' | 'reading', groupId: string, answers: Record<string, number | string>, mode = 'lesson') {
  await db.insert(examSessions).values({ userId, exam: 'ielts', mode, blueprint: { exam: 'ielts', sections: [{ component, groupIds: [groupId] }] }, answers, status: 'submitted', submittedAt: new Date(), timeLimitSec: 1800, result: { listening: null, reading: null, writing: null, speaking: null, overall: null } });
}

const gateListening = (id: string) => (GATE_GROUPS.find((g) => g.id === id)!.payload as { questions: { type: string; answers?: string[]; answerIndex?: number; answer?: string }[] }).questions;

/** Right answers for a group, with changes: { index: answer } */
function answersWith(groupId: string, changes: Record<number, number | string>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  gateListening(groupId).forEach((q, i) => {
    out[`${groupId}:${i}`] = q.type === 'gap' ? q.answers![0] : q.type === 'tfng' ? ['true', 'false', 'not_given'].indexOf(q.answer!) : q.answerIndex!;
  });
  for (const [i, value] of Object.entries(changes)) out[`${groupId}:${i}`] = value;
  return out;
}

describe('error book', () => {
  it('sorts listening mistakes into kinds and counts reading by kind of question', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await agent.post('/api/ielts-path').send(body);
    // Gate 1 listening: 0 surname Harris, 1 phone, 2 membership "student", 6 "Maple", 8 "Tuesday", 9 "trainers"
    await submitted(user.id, 'listening', 'gate-1-listening', answersWith('gate-1-listening', { 0: 'Haris', 1: '', 2: 'standard', 6: 'Mapel', 9: 'trainer' }));
    // Gate 1 reading: 6 true/false/not given (the first six) and 4 gaps; get the tfng all wrong
    const reading = answersWith('gate-1-reading', { 0: 1, 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 });
    await submitted(user.id, 'reading', 'gate-1-reading', reading);

    const { book } = (await agent.get('/api/ielts-path/errors')).body;
    expect(book.sessions).toBe(2);
    expect(book.listening.questions).toBe(10);
    expect(book.listening.wrong).toBe(5);
    expect(book.listening.byCategory).toEqual({ spelling: 2, plural: 1, distractor: 1, misheard: 0, missed: 1 });
    expect(book.listening.examples[0]).toMatchObject({ category: expect.any(String), expected: expect.any(String) });
    const tfng = book.reading.byType.find((t: { type: string }) => t.type === 'tfng');
    expect(tfng).toMatchObject({ correct: 0, total: 6 });
    expect(book.reading.byType.find((t: { type: string }) => t.type === 'gap')).toMatchObject({ correct: 4, total: 4 });
    expect(book.reading.byType[0].type).toBe('tfng'); // weakest first
  });

  it('reads writing and speaking criteria from graded results', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await agent.post('/api/ielts-path').send(body);
    const criteria = [{ key: 'TR', name: 'Task Response', band: 5, comment: '' }, { key: 'LR', name: 'Lexical Resource', band: 4, comment: '' }];
    await db.insert(examSessions).values({ userId: user.id, exam: 'ielts', mode: 'lesson', blueprint: { exam: 'ielts', sections: [] }, answers: {}, status: 'submitted', submittedAt: new Date(), timeLimitSec: 600, result: { listening: null, reading: null, writing: { status: 'done', band: 4.5, tasks: [{ groupId: 'x', taskType: 'ielts-task2', words: 100, band: 4.5, feedback: { criteria } }] }, speaking: { status: 'done', band: 5, groupId: 'y', feedback: { criteria: [{ key: 'FC', name: 'Fluency', band: 5.5, comment: '' }, { key: 'P', name: 'Pronunciation', band: 4.5, comment: '' }] } }, overall: null } });
    const { book } = (await agent.get('/api/ielts-path/errors')).body;
    expect(book.writing.lowest).toMatchObject({ key: 'LR', band: 4 });
    expect(book.speaking.lowest).toMatchObject({ key: 'P', band: 4.5 });
  });
});

describe('lessons that follow the learner', () => {
  it('puts one optional listening exercise at the front when one kind of mistake repeats', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await startedPath(agent);
    const before = await todayOf(agent);
    expect(before.steps.some((s: { ref: { adaptive?: string } }) => s.ref.adaptive)).toBe(false);

    // Three spelling mistakes in a session this week
    await submitted(user.id, 'listening', 'gate-1-listening', answersWith('gate-1-listening', { 0: 'Haris', 6: 'Mapel', 8: 'Tuesdy' }));
    await db.update(pathLessons).set({ plannedDay: quotaDay() }).where(eq(pathLessons.userId, user.id));
    const today = await todayOf(agent);
    const first = today.steps[0];
    expect(first.ref).toMatchObject({ type: 'l-form', adaptive: 'listening-spelling' });
    expect(first.core).toBe(false);
    expect(first.block).toBe('listening');
    // Everything else keeps its order behind it
    expect(today.steps.slice(1, 3).map((s: { kind: string }) => s.kind)).toEqual(['words', 'grammar']);

    // Only one a day, and the same reason is not added twice
    await db.update(ieltsPaths).set({ aheadMinutes: 0 });
    await submitted(user.id, 'reading', 'gate-1-reading', answersWith('gate-1-reading', { 0: 1, 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 }));
    await submitted(user.id, 'reading', 'gate-2-reading', answersWith('gate-2-reading', { 4: 1, 5: 0, 6: 0, 7: 0, 8: 1, 9: 0 }));
    const again = await todayOf(agent);
    expect(again.steps.filter((s: { ref: { adaptive?: string } }) => s.ref.adaptive)).toHaveLength(1);
    const stored = await db.select().from(pathLessons).where(eq(pathLessons.userId, user.id));
    expect(new Set(stored.map((r) => r.seq)).size).toBe(stored.length); // the queue order stayed unique
  });

  it('adds a reading exercise of the weakest kind of question the next day', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await startedPath(agent);
    // 12 true/false/not given questions, all wrong, over two sessions
    await submitted(user.id, 'reading', 'gate-1-reading', answersWith('gate-1-reading', { 0: 1, 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 }));
    await submitted(user.id, 'reading', 'gate-2-reading', answersWith('gate-2-reading', { 4: 1, 5: 0, 6: 0, 7: 0, 8: 1, 9: 0 }));
    const today = await todayOf(agent);
    expect(today.steps[0].ref).toMatchObject({ type: 'r-tfng', adaptive: 'reading-tfng' });
  });

  it('asks for the pronunciation practice when pronunciation is the lowest speaking criterion', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await startedPath(agent);
    await db.insert(examSessions).values({ userId: user.id, exam: 'ielts', mode: 'lesson', blueprint: { exam: 'ielts', sections: [] }, answers: {}, status: 'submitted', submittedAt: new Date(), timeLimitSec: 600, result: { listening: null, reading: null, writing: null, speaking: { status: 'done', band: 5, groupId: 'y', feedback: { criteria: [{ key: 'FC', name: 'Fluency', band: 5.5, comment: '' }, { key: 'P', name: 'Pronunciation', band: 4.5, comment: '' }] } }, overall: null } });
    const today = await todayOf(agent);
    expect(today.steps[0]).toMatchObject({ kind: 'pronunciation', block: 'speaking', core: false });
    expect(today.steps[0].ref.adaptive).toBe('speaking-pronunciation');
    expect(today.focus.speaking).toMatchObject({ key: 'P' });
  });

  it('adds a short review of a lesson whose drill went under 70%, once', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await startedPath(agent);
    const lesson = (await todayOf(agent)).steps.find((s: { kind: string }) => s.kind === 'lesson');
    await agent.post(`/api/ielts-path/steps/${lesson.id}/complete`).send({ drills: { correct: 1, total: 4 } });
    const today = await todayOf(agent);
    const review = today.steps.find((s: { ref: { reviewOf?: string } }) => s.ref.reviewOf);
    expect(review).toMatchObject({ kind: 'lesson', core: false, minutes: 15 });
    expect(review.ref).toMatchObject({ lessonId: lesson.ref.lessonId, reviewOf: lesson.id, adaptive: `lesson-review:${lesson.id}` });
    expect(review.id).not.toBe(lesson.id);

    // Finish the review with good drills: the lesson is not reviewed again
    await agent.post(`/api/ielts-path/steps/${review.id}/complete`).send({ drills: { correct: 4, total: 4 } });
    // A day later the same lesson is not reviewed again
    await db.execute(sql`update path_lessons set ref = jsonb_set(ref, '{adaptiveDay}', '"2000-01-01"') where id = ${review.id}`);
    const later = await todayOf(agent);
    expect(later.steps.filter((s: { ref: { reviewOf?: string } }) => s.ref.reviewOf === lesson.id)).toHaveLength(1);
  });

  it('shows the last gate band and the practice average per skill', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    await startedPath(agent);
    await db.insert(skillLevels).values({ userId: user.id, language: 'en', skill: 'listening', level: 'A2', confidence: 'medium', source: 'gate', band: 4 });
    await db.insert(examSessions).values({ userId: user.id, exam: 'ielts', mode: 'lesson', blueprint: { exam: 'ielts', sections: [] }, answers: {}, status: 'submitted', submittedAt: new Date(), timeLimitSec: 600, result: { listening: { correct: 8, total: 10, band: 6.5 }, reading: null, writing: null, speaking: null, overall: null } });
    const { bands } = await todayOf(agent);
    expect(bands.listening).toEqual({ target: 7.5, gate: 4, practice: 6.5, n: 1 });
    expect(bands.reading).toEqual({ target: 7.5, gate: null, practice: null, n: 0 });
  });
});
