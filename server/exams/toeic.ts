/**
 * TOEIC Exam Engine
 * Test structure, blueprint assembly from the content bank, answer hiding,
 * and scoring with an estimated 5-495 scale per section
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from '../db/client.js';
import { contentItems, examSessions, type ContentItem } from '../db/schema.js';
import { toeicP2, toeicP3, toeicP4, toeicP5, toeicP6, toeicP7, type ContentKind } from '../content/schemas.js';

export const TOEIC_PARTS = [2, 3, 4, 5, 6, 7] as const;
export type ToeicPart = (typeof TOEIC_PARTS)[number];
export type ExamMode = 'mini' | 'part' | 'full';
export type Section = 'listening' | 'reading';

interface PartConfig {
  kind: ContentKind;
  section: Section;
  /** Questions in the official test (Part 1 is not offered, so the full test has 194) */
  officialQuestions: number;
  /** Minutes for part-only mode */
  partMinutes: number;
  /** Groups in mini mode */
  miniGroups: number;
}

export const PART_CONFIG: Record<ToeicPart, PartConfig> = {
  2: { kind: 'toeic-p2', section: 'listening', officialQuestions: 25, partMinutes: 9, miniGroups: 1 },
  3: { kind: 'toeic-p3', section: 'listening', officialQuestions: 39, partMinutes: 20, miniGroups: 1 },
  4: { kind: 'toeic-p4', section: 'listening', officialQuestions: 30, partMinutes: 15, miniGroups: 1 },
  5: { kind: 'toeic-p5', section: 'reading', officialQuestions: 30, partMinutes: 10, miniGroups: 1 },
  6: { kind: 'toeic-p6', section: 'reading', officialQuestions: 16, partMinutes: 8, miniGroups: 1 },
  7: { kind: 'toeic-p7', section: 'reading', officialQuestions: 54, partMinutes: 55, miniGroups: 1 },
};

export const MODE_MINUTES = { mini: 25, full: 120 } as const;

/** Seconds after the deadline during which answers are still accepted (network delays, auto-submit) */
export const DEADLINE_GRACE_SEC = 120;

const SCHEMAS: Record<ToeicPart, z.ZodType> = { 2: toeicP2, 3: toeicP3, 4: toeicP4, 5: toeicP5, 6: toeicP6, 7: toeicP7 };

/** Blueprint stored on the session */
export interface Blueprint {
  sections: { part: ToeicPart; groupIds: string[] }[];
}

/** Question in a group, with the stable id used for answers */
interface ScoredQuestion {
  id: string;
  answerIndex: number;
}

/**
 * Questions of one group in display order, with ids "<groupId>:<index>"
 */
export function groupQuestions(part: ToeicPart, item: ContentItem): ScoredQuestion[] {
  const payload = item.payload as { items?: { answerIndex: number }[]; questions?: { answerIndex: number }[] };
  const list = part === 2 ? (payload.items ?? []) : (payload.questions ?? []);
  return list.map((q, index) => ({ id: `${item.id}:${index}`, answerIndex: q.answerIndex }));
}

/**
 * Number of groups a part needs for the mode (Part 7 is filled by question count)
 */
function groupsNeeded(part: ToeicPart, mode: ExamMode, questionsPerGroup: number): number {
  if (mode === 'mini') return PART_CONFIG[part].miniGroups;
  return Math.ceil(PART_CONFIG[part].officialQuestions / questionsPerGroup);
}

/** Typical questions per group (Part 7 varies from 2 to 5) */
export const QUESTIONS_PER_GROUP: Record<ToeicPart, number> = { 2: 5, 3: 3, 4: 3, 5: 10, 6: 4, 7: 4 };

/**
 * Parts included in a mode
 */
export function partsFor(mode: ExamMode, part?: ToeicPart): ToeicPart[] {
  return mode === 'part' && part ? [part] : [...TOEIC_PARTS];
}

/**
 * Time limit in seconds
 */
export function timeLimitFor(mode: ExamMode, part?: ToeicPart): number {
  if (mode === 'part' && part) return PART_CONFIG[part].partMinutes * 60;
  return (mode === 'full' ? MODE_MINUTES.full : MODE_MINUTES.mini) * 60;
}

/**
 * Published groups per part in the bank
 */
export async function bankCounts(): Promise<Record<ToeicPart, number>> {
  const rows = await db
    .select({ kind: contentItems.kind, count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(and(eq(contentItems.status, 'published'), sql`${contentItems.kind} like 'toeic-p%'`))
    .groupBy(contentItems.kind);

  const counts = Object.fromEntries(TOEIC_PARTS.map((p) => [p, 0])) as Record<ToeicPart, number>;
  for (const row of rows) counts[Number(row.kind.replace('toeic-p', '')) as ToeicPart] = row.count;
  return counts;
}

/**
 * Group ids this user has already seen in earlier sessions
 */
async function seenGroupIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ blueprint: examSessions.blueprint }).from(examSessions).where(eq(examSessions.userId, userId));
  return new Set(rows.flatMap((row) => (row.blueprint as Blueprint).sections.flatMap((s) => s.groupIds)));
}

/**
 * Picks groups for each part, preferring ones the user has not seen yet
 * @returns The blueprint, or the number of missing groups per part
 */
export async function assembleBlueprint(
  userId: string,
  mode: ExamMode,
  part?: ToeicPart
): Promise<{ blueprint: Blueprint } | { missing: Partial<Record<ToeicPart, number>> }> {
  const seen = await seenGroupIds(userId);
  const sections: Blueprint['sections'] = [];
  const missing: Partial<Record<ToeicPart, number>> = {};

  for (const p of partsFor(mode, part)) {
    const items = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.kind, PART_CONFIG[p].kind), eq(contentItems.status, 'published')));

    // Unseen first, then random within each bucket
    const shuffled = items
      .map((item) => ({ item, key: (seen.has(item.id) ? 1 : 0) + Math.random() }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.item);

    const picked: ContentItem[] = [];
    if (p === 7 && mode !== 'mini') {
      // Part 7 groups vary in size: add groups until the official question count is reached
      let questions = 0;
      for (const item of shuffled) {
        if (questions >= PART_CONFIG[7].officialQuestions) break;
        picked.push(item);
        questions += groupQuestions(7, item).length;
      }
      if (questions < PART_CONFIG[7].officialQuestions) {
        missing[7] = Math.ceil((PART_CONFIG[7].officialQuestions - questions) / QUESTIONS_PER_GROUP[7]);
      }
    } else {
      const needed = groupsNeeded(p, mode, QUESTIONS_PER_GROUP[p]);
      picked.push(...shuffled.slice(0, needed));
      if (picked.length < needed) missing[p] = needed - picked.length;
    }

    sections.push({ part: p, groupIds: picked.map((item) => item.id) });
  }

  return Object.keys(missing).length > 0 ? { missing } : { blueprint: { sections } };
}

/**
 * Loads every group in a blueprint, keyed by id
 */
export async function loadGroups(blueprint: Blueprint): Promise<Map<string, ContentItem>> {
  const ids = blueprint.sections.flatMap((s) => s.groupIds);
  if (ids.length === 0) return new Map();
  const items = await db.select().from(contentItems).where(inArray(contentItems.id, ids));
  return new Map(items.map((item) => [item.id, item]));
}

type Payload = Record<string, unknown>;

/**
 * Removes answers and explanations so an in-progress test cannot be read from the API
 */
function hideAnswers(part: ToeicPart, payload: Payload): Payload {
  const strip = (q: Payload) =>
    Object.fromEntries(Object.entries(q).filter(([key]) => key !== 'answerIndex' && key !== 'explanation'));
  if (part === 2) return { items: (payload.items as Payload[]).map(strip) };
  return { ...payload, questions: (payload.questions as Payload[]).map(strip) };
}

/**
 * Session view for the client: answers hidden while in progress, full review after submit
 */
export function sessionView(session: typeof examSessions.$inferSelect, groups: Map<string, ContentItem>) {
  const blueprint = session.blueprint as Blueprint;
  const reveal = session.status === 'submitted';

  return {
    id: session.id,
    exam: session.exam,
    mode: session.mode,
    status: session.status,
    timeLimitSec: session.timeLimitSec,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    deadline: new Date(session.startedAt.getTime() + session.timeLimitSec * 1000),
    answers: session.answers as Record<string, number>,
    flags: session.flags as string[],
    result: session.result,
    sections: blueprint.sections.map((section) => ({
      part: section.part,
      section: PART_CONFIG[section.part].section,
      groups: section.groupIds
        .map((id) => groups.get(id))
        .filter((item): item is ContentItem => Boolean(item))
        .map((item) => ({
          id: item.id,
          payload: reveal ? item.payload : hideAnswers(section.part, item.payload as Payload),
        })),
    })),
  };
}

/**
 * Estimated TOEIC scaled score (5-495) from the share of correct answers in a section.
 * Real TOEIC conversion tables are not public and vary per form; this is a linear estimate.
 */
export function estimateScaled(correct: number, total: number): number {
  if (total === 0) return 0;
  const scaled = 5 + (correct / total) * 490;
  return Math.min(495, Math.max(5, Math.round(scaled / 5) * 5));
}

export interface ExamResult {
  parts: { part: ToeicPart; section: Section; correct: number; total: number }[];
  sections: Record<Section, { correct: number; total: number; scaled: number } | null>;
  /** Sum of section estimates when both sections were tested */
  totalScaled: number | null;
}

/**
 * Scores a session's answers against the blueprint
 */
export function scoreSession(blueprint: Blueprint, groups: Map<string, ContentItem>, answers: Record<string, number>): ExamResult {
  const parts = blueprint.sections.map((section) => {
    const questions = section.groupIds.flatMap((id) => {
      const item = groups.get(id);
      return item ? groupQuestions(section.part, item) : [];
    });
    return {
      part: section.part,
      section: PART_CONFIG[section.part].section,
      correct: questions.filter((q) => answers[q.id] === q.answerIndex).length,
      total: questions.length,
    };
  });

  const sectionScore = (name: Section) => {
    const rows = parts.filter((p) => p.section === name);
    if (rows.length === 0) return null;
    const correct = rows.reduce((sum, r) => sum + r.correct, 0);
    const total = rows.reduce((sum, r) => sum + r.total, 0);
    return { correct, total, scaled: estimateScaled(correct, total) };
  };

  const listening = sectionScore('listening');
  const reading = sectionScore('reading');

  return {
    parts,
    sections: { listening, reading },
    totalScaled: listening && reading ? listening.scaled + reading.scaled : null,
  };
}

/**
 * Validates a generated group against its part schema
 */
export function partSchema(part: ToeicPart): z.ZodType {
  return SCHEMAS[part];
}
