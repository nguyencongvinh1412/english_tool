/**
 * The learner's error book, worked out from their submitted IELTS sessions (practice and gates): nothing extra is
 * stored, so it is always in line with what they did. Listening mistakes are sorted into kinds, reading is counted by
 * kind of question, writing and speaking by the criteria of the band descriptors.
 */
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems, examSessions, type ExamSession } from '../db/schema.js';
import type { IeltsQuestion } from '../content/schemas.js';
import { objectiveQuestions, type IeltsBlueprint, type IeltsResult } from '../exams/ielts.js';
import { averageCriteria, classifyListening, LISTENING_CATEGORIES, lowestCriterion, tallyListening, type CriterionBand, type ListeningCategory, type TypeTally } from './errorRules.js';
import type { PathSkill } from './bands.js';

const SESSION_LIMIT = 40;
/** Graded writing and speaking answers the criteria are averaged over */
const GRADED_WINDOW = 3;
const EXAMPLE_LIMIT = 10;

export interface ListeningExample {
  prompt: string;
  answered: string;
  expected: string;
  category: ListeningCategory;
}

export interface ErrorBook {
  sessions: number;
  listening: { questions: number; wrong: number; byCategory: Record<ListeningCategory, number>; examples: ListeningExample[] };
  reading: { questions: number; byType: TypeTally[] };
  writing: { graded: number; criteria: CriterionBand[]; lowest: CriterionBand | null };
  speaking: { graded: number; criteria: CriterionBand[]; lowest: CriterionBand | null };
}

type Payload = { questions?: IeltsQuestion[]; script?: { text: string }[]; paragraphs?: string[] };

const optionText = (q: IeltsQuestion, index: number | string | undefined): string => {
  if (index === undefined) return '';
  if ((q.type === 'mcq' || q.type === 'match') && typeof index === 'number') return q.options[index] ?? '';
  if (q.type === 'tfng' && typeof index === 'number') return ['true', 'false', 'not given'][index] ?? '';
  return String(index);
};

const expectedText = (q: IeltsQuestion): string => (q.type === 'gap' ? q.answers[0] : q.type === 'tfng' ? q.answer.replace('_', ' ') : q.options[q.answerIndex]);

/** Criteria of a graded writing or speaking result, when it has them */
const criteriaOf = (feedback: unknown): CriterionBand[] => {
  const list = (feedback as { criteria?: CriterionBand[] } | null)?.criteria;
  return Array.isArray(list) ? list.filter((c) => typeof c.band === 'number') : [];
};

/**
 * A listening or reading session submitted without a single answer: the learner pressed submit by mistake or gave up.
 * It says nothing about their level, so it is not an attempt (not a finished step, not in the error book)
 */
export function isBlankSubmission(session: Pick<ExamSession, 'answers' | 'blueprint'>): boolean {
  const sections = (session.blueprint as IeltsBlueprint).sections;
  if (sections.length === 0 || !sections.every((s) => s.component === 'listening' || s.component === 'reading')) return false;
  return Object.values(session.answers as Record<string, unknown>).every((a) => a === null || a === undefined || (typeof a === 'string' && a.trim() === ''));
}

export async function recentSessions(userId: string, since?: Date, limit = SESSION_LIMIT): Promise<ExamSession[]> {
  const rows = await db
    .select()
    .from(examSessions)
    .where(and(eq(examSessions.userId, userId), eq(examSessions.exam, 'ielts'), eq(examSessions.status, 'submitted'), since ? gte(examSessions.submittedAt, since) : undefined))
    .orderBy(desc(examSessions.submittedAt))
    .limit(limit);
  return rows.filter((s) => !isBlankSubmission(s));
}

/** The error book over the learner's recent IELTS sessions (newest first), optionally only since a date */
export async function buildErrorBook(userId: string, since?: Date): Promise<ErrorBook> {
  const sessions = await recentSessions(userId, since);
  const groupIds = [...new Set(sessions.flatMap((s) => (s.blueprint as IeltsBlueprint).sections.flatMap((sec) => sec.groupIds)))];
  const items = groupIds.length ? await db.select().from(contentItems).where(inArray(contentItems.id, groupIds)) : [];
  const byId = new Map(items.map((item) => [item.id, item]));

  const listening: (ListeningCategory | null)[] = [];
  const examples: ListeningExample[] = [];
  const types = new Map<IeltsQuestion['type'], TypeTally>();
  let readingQuestions = 0;
  const writing: CriterionBand[][] = [];
  const speaking: CriterionBand[][] = [];

  for (const session of sessions) {
    const answers = session.answers as Record<string, number | string>;
    const result = session.result as IeltsResult | null;
    for (const section of (session.blueprint as IeltsBlueprint).sections) {
      for (const id of section.groupIds) {
        const item = byId.get(id);
        if (!item) continue;
        if (section.component === 'listening') {
          const script = ((item.payload as Payload).script ?? []).map((l) => l.text).join(' ');
          for (const { id: qid, question } of objectiveQuestions(item)) {
            const category = classifyListening(question, answers[qid], script);
            listening.push(category);
            if (category && examples.length < EXAMPLE_LIMIT) examples.push({ prompt: question.prompt, answered: optionText(question, answers[qid]), expected: expectedText(question), category });
          }
        } else if (section.component === 'reading') {
          for (const { id: qid, question } of objectiveQuestions(item)) {
            const tally = types.get(question.type) ?? { type: question.type, correct: 0, total: 0 };
            tally.total += 1;
            if (classifyListening(question, answers[qid], '') === null) tally.correct += 1;
            types.set(question.type, tally);
            readingQuestions++;
          }
        }
      }
    }
    if (result?.writing?.status === 'done' && writing.length < GRADED_WINDOW) {
      const all = result.writing.tasks.flatMap((t) => criteriaOf(t.feedback));
      if (all.length > 0) writing.push(all);
    }
    if (result?.speaking?.status === 'done' && speaking.length < GRADED_WINDOW) {
      const criteria = criteriaOf(result.speaking.feedback);
      if (criteria.length > 0) speaking.push(criteria);
    }
  }

  const tally = tallyListening(listening);
  const writingCriteria = averageCriteria(writing);
  const speakingCriteria = averageCriteria(speaking);
  return {
    sessions: sessions.length,
    listening: { ...tally, examples },
    reading: { questions: readingQuestions, byType: [...types.values()].sort((a, b) => a.correct / a.total - b.correct / b.total) },
    writing: { graded: writing.length, criteria: writingCriteria, lowest: lowestCriterion(writingCriteria) },
    speaking: { graded: speaking.length, criteria: speakingCriteria, lowest: lowestCriterion(speakingCriteria) },
  };
}

/** Mean band of the learner's last practice sessions in each skill (what they score on the practice, not on a gate) */
export async function recentPracticeBands(userId: string, count = 5): Promise<Partial<Record<PathSkill, { band: number; n: number }>>> {
  const sessions = (await recentSessions(userId, undefined, 60)).filter((s) => s.mode === 'lesson');
  const bands: Record<PathSkill, number[]> = { listening: [], reading: [], writing: [], speaking: [] };
  for (const session of sessions) {
    const result = session.result as IeltsResult | null;
    if (!result) continue;
    if (result.listening && bands.listening.length < count) bands.listening.push(result.listening.band);
    if (result.reading && bands.reading.length < count) bands.reading.push(result.reading.band);
    if (result.writing?.status === 'done' && result.writing.band !== null && bands.writing.length < count) bands.writing.push(result.writing.band);
    if (result.speaking?.status === 'done' && result.speaking.band !== null && bands.speaking.length < count) bands.speaking.push(result.speaking.band);
  }
  const mean = (list: number[]) => Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
  return Object.fromEntries((Object.keys(bands) as PathSkill[]).filter((skill) => bands[skill].length > 0).map((skill) => [skill, { band: mean(bands[skill]), n: bands[skill].length }]));
}

export { LISTENING_CATEGORIES };
