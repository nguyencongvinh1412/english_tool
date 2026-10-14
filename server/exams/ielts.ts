/**
 * IELTS Academic Exam Engine
 * Test structure, blueprint assembly from the content bank, answer hiding,
 * objective scoring with band estimates, and background AI grading of writing and speaking
 */
import { recordWritingMistakes, sanitizeCorrections } from '../grammar/mistakes.js';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems, examSessions, users, type ContentItem, type ExamSession } from '../db/schema.js';
import { normalizeAnswer, speakingFeedback, speakingIelts, writingFeedback, writingPrompt, type IeltsQuestion } from '../content/schemas.js';
import { speakingScoringPrompt, writingScoringPrompt } from '../content/scoring.js';
import { runAIJson, SCORING_MAX_TOKENS, SCORING_TIMEOUT_MS } from '../services/ai.js';
import { recordAttempt } from '../services/progress.js';

export const IELTS_COMPONENTS = ['listening', 'reading', 'writing', 'speaking'] as const;
export type IeltsComponent = (typeof IELTS_COMPONENTS)[number];

/** What part mode can practise on its own */
export const IELTS_PARTS = ['listening', 'reading', 'writing-task1', 'writing-task2', 'speaking'] as const;
export type IeltsPart = (typeof IELTS_PARTS)[number];
export type IeltsMode = 'mini' | 'part' | 'full';

/**
 * Bank slots: one kind of group the blueprint asks for.
 * Listening sections differ in style (1: everyday conversation ... 4: academic lecture), so each is its own slot.
 */
export const IELTS_SLOTS = ['listening-1', 'listening-2', 'listening-3', 'listening-4', 'reading', 'writing-task1', 'writing-task2', 'speaking'] as const;
export type IeltsSlot = (typeof IELTS_SLOTS)[number];

export const SLOT_COMPONENT: Record<IeltsSlot, IeltsComponent> = {
  'listening-1': 'listening',
  'listening-2': 'listening',
  'listening-3': 'listening',
  'listening-4': 'listening',
  reading: 'reading',
  'writing-task1': 'writing',
  'writing-task2': 'writing',
  speaking: 'speaking',
};

/** Minutes per component in the full test (speaking is about 11-14 minutes) */
export const COMPONENT_MINUTES: Record<IeltsComponent, number> = { listening: 30, reading: 60, writing: 60, speaking: 15 };
const PART_MINUTES: Record<IeltsPart, number> = { listening: 10, reading: 20, 'writing-task1': 20, 'writing-task2': 40, speaking: 15 };
const MINI_MINUTES = 30;

/** Questions per listening section and reading passage in the real test */
export const LISTENING_QUESTIONS = 40;
export const READING_QUESTIONS = 40;

/** Answers for TRUE / FALSE / NOT GIVEN are stored as option indexes */
export const TFNG_VALUES = ['true', 'false', 'not_given'] as const;

export interface IeltsBlueprint {
  exam: 'ielts';
  sections: { component: IeltsComponent; groupIds: string[] }[];
}

/**
 * Slots a mode needs, in test order
 */
export function slotsFor(mode: IeltsMode, part?: IeltsPart): IeltsSlot[] {
  if (mode === 'full') return [...IELTS_SLOTS];
  if (mode === 'mini') return ['listening-1', 'reading'];
  switch (part) {
    case 'listening':
      return ['listening-1'];
    case 'reading':
      return ['reading'];
    case 'writing-task1':
      return ['writing-task1'];
    case 'writing-task2':
      return ['writing-task2'];
    default:
      return ['speaking'];
  }
}

/**
 * Time limit in seconds
 */
export function ieltsTimeLimit(mode: IeltsMode, part?: IeltsPart): number {
  if (mode === 'full') return IELTS_COMPONENTS.reduce((sum, c) => sum + COMPONENT_MINUTES[c], 0) * 60;
  if (mode === 'mini') return MINI_MINUTES * 60;
  return PART_MINUTES[part ?? 'speaking'] * 60;
}

/**
 * SQL filter selecting the bank items of a slot (imported items are excluded)
 */
function slotFilter(slot: IeltsSlot) {
  const base = and(eq(contentItems.status, 'published'), ne(contentItems.source, 'imported'));
  if (slot.startsWith('listening-')) {
    return and(base, eq(contentItems.kind, 'ielts-listening'), sql`${contentItems.payload}->>'section' = ${slot.slice(-1)}`);
  }
  if (slot === 'reading') return and(base, eq(contentItems.kind, 'ielts-reading'));
  if (slot === 'speaking') return and(base, eq(contentItems.kind, 'speaking-ielts'));
  return and(base, eq(contentItems.kind, 'writing-prompt'), sql`${contentItems.payload}->>'taskType' = ${slot === 'writing-task1' ? 'ielts-task1' : 'ielts-task2'}`);
}

/**
 * Groups per slot in the bank
 */
export async function ieltsBankCounts(): Promise<Record<IeltsSlot, number>> {
  const entries = await Promise.all(
    IELTS_SLOTS.map(async (slot) => {
      const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(contentItems).where(slotFilter(slot));
      return [slot, row?.count ?? 0] as const;
    })
  );
  return Object.fromEntries(entries) as Record<IeltsSlot, number>;
}

/** Groups a full test needs per slot */
export const FULL_TEST_GROUPS: Record<IeltsSlot, number> = {
  'listening-1': 1,
  'listening-2': 1,
  'listening-3': 1,
  'listening-4': 1,
  reading: 3,
  'writing-task1': 1,
  'writing-task2': 1,
  speaking: 1,
};

/**
 * Group ids this user has already seen in earlier sessions (any exam)
 */
async function seenGroupIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ blueprint: examSessions.blueprint }).from(examSessions).where(eq(examSessions.userId, userId));
  return new Set(rows.flatMap((row) => (row.blueprint as { sections: { groupIds: string[] }[] }).sections.flatMap((s) => s.groupIds)));
}

/**
 * Picks groups for each slot, preferring ones the user has not seen yet
 * @returns The blueprint, or the number of missing groups per slot
 */
export async function assembleIelts(
  userId: string,
  mode: IeltsMode,
  part?: IeltsPart
): Promise<{ blueprint: IeltsBlueprint } | { missing: Partial<Record<IeltsSlot, number>> }> {
  const seen = await seenGroupIds(userId);
  const slots = slotsFor(mode, part);
  const missing: Partial<Record<IeltsSlot, number>> = {};
  const picked = new Map<IeltsComponent, string[]>();

  for (const slot of slots) {
    const needed = mode === 'full' ? FULL_TEST_GROUPS[slot] : 1;
    const items = await db.select({ id: contentItems.id }).from(contentItems).where(slotFilter(slot));
    const chosen = items
      .map((item) => ({ id: item.id, key: (seen.has(item.id) ? 1 : 0) + Math.random() }))
      .sort((a, b) => a.key - b.key)
      .slice(0, needed)
      .map((entry) => entry.id);
    if (chosen.length < needed) missing[slot] = needed - chosen.length;
    const component = SLOT_COMPONENT[slot];
    picked.set(component, [...(picked.get(component) ?? []), ...chosen]);
  }

  if (Object.keys(missing).length > 0) return { missing };
  const sections = IELTS_COMPONENTS.filter((c) => picked.has(c)).map((component) => ({ component, groupIds: picked.get(component)! }));
  return { blueprint: { exam: 'ielts', sections } };
}

/**
 * Loads every group in a blueprint, keyed by id
 */
export async function loadIeltsGroups(blueprint: IeltsBlueprint): Promise<Map<string, ContentItem>> {
  const ids = blueprint.sections.flatMap((s) => s.groupIds);
  if (ids.length === 0) return new Map();
  const items = await db.select().from(contentItems).where(inArray(contentItems.id, ids));
  return new Map(items.map((item) => [item.id, item]));
}

type Payload = Record<string, unknown>;
type Answers = Record<string, number | string>;

/**
 * Removes answers and explanations from objective questions
 */
function hideAnswers(payload: Payload): Payload {
  if (!Array.isArray(payload.questions)) return payload;
  return {
    ...payload,
    questions: (payload.questions as Payload[]).map((q) =>
      Object.fromEntries(Object.entries(q).filter(([key]) => !['answerIndex', 'answer', 'answers', 'explanation'].includes(key)))
    ),
  };
}

/**
 * Session view for the client: answers hidden while in progress, full review after submit
 */
export function ieltsSessionView(session: ExamSession, groups: Map<string, ContentItem>) {
  const blueprint = session.blueprint as IeltsBlueprint;
  const reveal = session.status === 'submitted';
  return {
    id: session.id,
    exam: 'ielts' as const,
    mode: session.mode,
    status: session.status,
    timeLimitSec: session.timeLimitSec,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    deadline: new Date(session.startedAt.getTime() + session.timeLimitSec * 1000),
    answers: session.answers as Answers,
    flags: session.flags as string[],
    result: session.result,
    title: null,
    sections: blueprint.sections.map((section) => ({
      component: section.component,
      groups: section.groupIds
        .map((id) => groups.get(id))
        .filter((item): item is ContentItem => Boolean(item))
        .map((item) => ({ id: item.id, kind: item.kind, payload: reveal ? item.payload : hideAnswers(item.payload as Payload) })),
    })),
  };
}

/**
 * Whether one objective answer is correct
 */
export function isCorrect(question: IeltsQuestion, answer: number | string | undefined): boolean {
  if (answer === undefined) return false;
  if (question.type === 'mcq') return answer === question.answerIndex;
  if (question.type === 'tfng') return typeof answer === 'number' && TFNG_VALUES[answer] === question.answer;
  if (typeof answer !== 'string' || !answer.trim()) return false;
  const given = normalizeAnswer(answer);
  return question.answers.some((accepted) => normalizeAnswer(accepted) === given);
}

/** Reference conversion of raw scores out of 40 to bands (listening and academic reading) */
const LISTENING_BANDS: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1],
];
const READING_BANDS: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1],
];

/**
 * Estimated band from a raw score, scaled to 40 questions when fewer were tested
 */
export function objectiveBand(component: 'listening' | 'reading', correct: number, total: number): number {
  if (total === 0) return 0;
  const raw = Math.round((correct / total) * 40);
  const table = component === 'listening' ? LISTENING_BANDS : READING_BANDS;
  return table.find(([min]) => raw >= min)?.[1] ?? 0;
}

/**
 * IELTS overall band: mean of the four, rounded to the nearest half band (.25 and .75 round up)
 */
export function overallBand(bands: number[]): number {
  const mean = bands.reduce((sum, b) => sum + b, 0) / bands.length;
  return Math.floor(mean * 2 + 0.5) / 2;
}

/**
 * Writing band: Task 2 counts twice as much as Task 1
 */
export function writingBand(task1: number | undefined, task2: number | undefined): number {
  if (task1 === undefined) return task2 ?? 0;
  if (task2 === undefined) return task1;
  return Math.floor(((task1 + 2 * task2) / 3) * 2 + 0.5) / 2;
}

type GradeStatus = 'pending' | 'done' | 'failed';

export interface IeltsResult {
  listening: { correct: number; total: number; band: number } | null;
  reading: { correct: number; total: number; band: number } | null;
  writing: {
    status: GradeStatus;
    band: number | null;
    tasks: { groupId: string; taskType: string; words: number; band: number | null; feedback: unknown }[];
    error?: string;
  } | null;
  speaking: { status: GradeStatus; band: number | null; groupId: string; feedback: unknown; error?: string } | null;
  overall: number | null;
}

/**
 * Objective questions of a listening or reading group, with answer ids
 */
export function objectiveQuestions(item: ContentItem): { id: string; question: IeltsQuestion }[] {
  const questions = ((item.payload as { questions?: IeltsQuestion[] }).questions ?? []) as IeltsQuestion[];
  return questions.map((question, index) => ({ id: `${item.id}:${index}`, question }));
}

/** Answer id of an essay */
export const essayId = (groupId: string) => `${groupId}:essay`;

/**
 * Speaking questions in order with their answer ids
 */
export function speakingQuestions(item: ContentItem): { id: string; question: string }[] {
  const set = speakingIelts.parse(item.payload);
  return [
    ...set.part1.map((question, i) => ({ id: `${item.id}:p1-${i}`, question })),
    {
      id: `${item.id}:p2`,
      question: `${set.part2.cueCard} You should say: ${set.part2.bullets.join('; ')}; ${set.part2.closing}`,
    },
    ...set.part3.map((question, i) => ({ id: `${item.id}:p3-${i}`, question })),
  ];
}

const wordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Scores listening and reading now; writing and speaking start as pending for the AI grader
 */
export function scoreIeltsObjective(blueprint: IeltsBlueprint, groups: Map<string, ContentItem>, answers: Answers): IeltsResult {
  const result: IeltsResult = { listening: null, reading: null, writing: null, speaking: null, overall: null };

  for (const section of blueprint.sections) {
    const items = section.groupIds.map((id) => groups.get(id)).filter((item): item is ContentItem => Boolean(item));
    if (section.component === 'listening' || section.component === 'reading') {
      const questions = items.flatMap(objectiveQuestions);
      const correct = questions.filter((q) => isCorrect(q.question, answers[q.id])).length;
      result[section.component] = { correct, total: questions.length, band: objectiveBand(section.component, correct, questions.length) };
    } else if (section.component === 'writing') {
      result.writing = {
        status: 'pending',
        band: null,
        tasks: items.map((item) => ({
          groupId: item.id,
          taskType: (item.payload as { taskType: string }).taskType,
          words: wordsIn(String(answers[essayId(item.id)] ?? '')),
          band: null,
          feedback: null,
        })),
      };
    } else if (items[0]) {
      result.speaking = { status: 'pending', band: null, groupId: items[0].id, feedback: null };
    }
  }
  return withOverall(result);
}

/**
 * Overall band once every component has a band
 */
function withOverall(result: IeltsResult): IeltsResult {
  const bands = [result.listening?.band, result.reading?.band, result.writing?.band, result.speaking?.band];
  const complete = bands.every((b) => typeof b === 'number');
  return { ...result, overall: complete ? overallBand(bands as number[]) : null };
}

/** Responses shorter than this are scored 0 without asking the AI */
const MIN_ESSAY_WORDS = 20;

/**
 * Grades writing and speaking of a submitted session with the AI and stores the bands.
 * Runs in the background after submit; failures are stored so the learner can retry.
 */
export async function gradeIeltsSession(sessionId: string, model?: string): Promise<void> {
  const [session] = await db.select().from(examSessions).where(eq(examSessions.id, sessionId)).limit(1);
  if (!session || session.exam !== 'ielts' || !session.result) return;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return;

  const blueprint = session.blueprint as IeltsBlueprint;
  const groups = await loadIeltsGroups(blueprint);
  const answers = session.answers as Answers;
  const result = session.result as IeltsResult;
  const locale = user.uiLocale;
  const label = session.mode === 'part' ? 'IELTS practice' : `IELTS ${session.mode} test`;

  // Writing and speaking are graded in parallel; saves run one at a time so neither overwrites the other
  let saving: Promise<void> = Promise.resolve();
  const save = (change: Partial<IeltsResult>): Promise<void> => {
    saving = saving.catch(() => undefined).then(async () => {
      const [latest] = await db.select({ result: examSessions.result }).from(examSessions).where(eq(examSessions.id, sessionId));
      const merged = withOverall({ ...(latest.result as IeltsResult), ...change });
      await db.update(examSessions).set({ result: merged, updatedAt: new Date() }).where(eq(examSessions.id, sessionId));
    });
    return saving;
  };

  const gradeWriting = async () => {
    const writing = result.writing;
    if (!writing || writing.status === 'done') return;
    try {
      const tasks = await Promise.all(
        writing.tasks.map(async (task) => {
          const item = groups.get(task.groupId);
          const essay = String(answers[essayId(task.groupId)] ?? '').trim();
          if (!item || wordsIn(essay) < MIN_ESSAY_WORDS) return { ...task, band: 0, feedback: null };
          const prompt = writingScoringPrompt(writingPrompt.parse(item.payload), essay, locale);
          const feedback = await runAIJson(
            user,
            { feature: 'score-writing', model, system: prompt.system, messages: [{ role: 'user', content: prompt.user }], timeoutMs: SCORING_TIMEOUT_MS, maxTokens: SCORING_MAX_TOKENS },
            writingFeedback
          );
          sanitizeCorrections(feedback);
          await recordWritingMistakes(user.id, feedback);
          return { ...task, band: feedback.overallBand, feedback };
        })
      );
      const band = writingBand(
        tasks.find((t) => t.taskType === 'ielts-task1')?.band ?? undefined,
        tasks.find((t) => t.taskType === 'ielts-task2')?.band ?? undefined
      );
      await save({ writing: { status: 'done', band, tasks } });
      await recordAttempt(user.id, { activity: 'ielts-writing', contentRef: session.id, title: `${label} · Writing`, score: band, maxScore: 9 });
    } catch (error) {
      console.error(`IELTS writing grading failed for ${sessionId}:`, error);
      await save({ writing: { ...writing, status: 'failed', error: error instanceof Error ? error.message : 'Grading failed' } });
    }
  };

  const gradeSpeaking = async () => {
    const speaking = result.speaking;
    if (!speaking || speaking.status === 'done') return;
    try {
      const item = groups.get(speaking.groupId);
      const spoken = item ? speakingQuestions(item).map((q) => ({ question: q.question, transcript: String(answers[q.id] ?? '').trim() })) : [];
      if (!item || spoken.every((a) => !a.transcript)) {
        await save({ speaking: { ...speaking, status: 'done', band: 0, feedback: null } });
        return;
      }
      const prompt = speakingScoringPrompt(speakingIelts.parse(item.payload), spoken, locale);
      const feedback = await runAIJson(
        user,
        { feature: 'score-speaking', model, system: prompt.system, messages: [{ role: 'user', content: prompt.user }], timeoutMs: SCORING_TIMEOUT_MS, maxTokens: SCORING_MAX_TOKENS },
        speakingFeedback
      );
      await save({ speaking: { ...speaking, status: 'done', band: feedback.overallBand, feedback } });
      await recordAttempt(user.id, { activity: 'ielts-speaking', contentRef: session.id, title: `${label} · Speaking`, score: feedback.overallBand, maxScore: 9 });
    } catch (error) {
      console.error(`IELTS speaking grading failed for ${sessionId}:`, error);
      await save({ speaking: { ...speaking, status: 'failed', error: error instanceof Error ? error.message : 'Grading failed' } });
    }
  };

  await Promise.all([gradeWriting(), gradeSpeaking()]);
}

/**
 * Marks grading that was running when the server stopped as failed, so learners can retry
 */
export async function recoverInterruptedGrading(): Promise<void> {
  const rows = await db
    .select()
    .from(examSessions)
    .where(
      and(
        eq(examSessions.exam, 'ielts'),
        eq(examSessions.status, 'submitted'),
        sql`(${examSessions.result}->'writing'->>'status' = 'pending' or ${examSessions.result}->'speaking'->>'status' = 'pending')`
      )
    );
  for (const row of rows) {
    const result = row.result as IeltsResult | null;
    if (!result) continue;
    const stuck = (s: { status: GradeStatus } | null) => s?.status === 'pending';
    if (!stuck(result.writing) && !stuck(result.speaking)) continue;
    const message = 'Grading was interrupted. Try again.';
    await db
      .update(examSessions)
      .set({
        result: {
          ...result,
          writing: result.writing && stuck(result.writing) ? { ...result.writing, status: 'failed', error: message } : result.writing,
          speaking: result.speaking && stuck(result.speaking) ? { ...result.speaking, status: 'failed', error: message } : result.speaking,
        },
      })
      .where(eq(examSessions.id, row.id));
  }
}
