/**
 * Grammar practice: AI-generated sets of six questions per grammar point (multiple choice and
 * fill-in), checked by a second AI pass, stored for every learner, and the review schedule of a
 * point from practice scores
 */
import { z } from 'zod';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems, grammarProgress, type ContentItem, type User } from '../db/schema.js';
import { GENERATE_TIMEOUT_MS, runAIJson } from '../services/ai.js';
import { HttpError } from '../http/errors.js';
import { GRAMMAR_POINTS, type GrammarPointMeta } from './map.js';

export const PRACTICE_KIND = 'grammar-practice';
export const SET_SIZE = 6;
const MAX_ROUNDS = 2;

const text = (max: number) => z.string().trim().min(1).max(max);
const bilingual = (max: number) => z.object({ en: text(max), vi: text(max) });

const choiceItem = z.object({
  type: z.literal('choice'),
  prompt: text(300),
  options: z.array(text(160)).min(3).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: bilingual(400),
});

const gapItem = z.object({
  type: z.literal('gap'),
  /** The sentence with one blank written ____ */
  prompt: text(300).refine((p) => (p.match(/_{3,}/g) ?? []).length === 1, 'write exactly one blank as ____'),
  /** Every accepted answer (contractions and full forms) */
  answers: z.array(text(60)).min(1).max(4),
  /** Base form or hint shown in brackets, e.g. (go) */
  hint: z.string().trim().max(40).optional(),
  explanation: bilingual(400),
});

/**
 * A set of `size` questions: models sometimes add extras (dropped); too few is retried. Mostly
 * fill-in and multiple choice together, never only one kind
 */
export const itemsOf = (size: number) =>
  z
    .object({ items: z.array(z.discriminatedUnion('type', [choiceItem, gapItem])).min(size).transform((list) => list.slice(0, size)) })
    .superRefine((set, ctx) => {
      set.items.forEach((item, i) => {
        if (item.type === 'choice' && item.answerIndex >= item.options.length) ctx.addIssue({ code: 'custom', message: 'answerIndex is out of range', path: ['items', i] });
      });
      const gaps = set.items.filter((i) => i.type === 'gap').length;
      const min = Math.ceil(size / 3);
      const max = Math.ceil((size * 2) / 3);
      if (gaps < min || gaps > max) ctx.addIssue({ code: 'custom', message: `use ${min}-${max} fill-in (gap) items and the rest multiple choice`, path: ['items'] });
    });
export const practiceSet = itemsOf(SET_SIZE);
export type PracticeSet = z.infer<typeof practiceSet>;
export type PracticeItem = PracticeSet['items'][number];

/**
 * Typed answer check: case, extra spaces, curly apostrophes and a final full stop do not matter
 */
export const normalizeAnswer = (value: string) =>
  value.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/[.!?]$/, '');

function generationPrompt(point: GrammarPointMeta, size: number, focus: string[]) {
  const contrasts = (point.contrasts ?? []).map((id) => GRAMMAR_POINTS.find((p) => p.id === id)?.title.en).filter(Boolean);
  return {
    system: `You write English grammar practice for Vietnamese learners. Every question has exactly one correct answer that a
grammar teacher would accept without argument; avoid questions where two options are possible. Natural, everyday sentences.
Explanations are short, in English ("en") and Vietnamese ("vi"). Respond with ONLY one JSON object.`,
    user: `Grammar point: ${point.title.en} (CEFR ${point.cefr}).${focus.length ? ` Cover only these uses of it: ${focus.join('; ')}.` : ''}${contrasts.length ? ` Include distractors that test the difference from: ${contrasts.join(', ')}.` : ''}
Write EXACTLY ${size} items (count them: ${size}), mixed:
- "choice": a sentence with a gap ____ (or a question like "Which sentence is correct?") and 3-4 options.
- "gap": a sentence with ONE blank ____ the learner types; "hint" is the base form in brackets when useful (e.g. "(go)");
  "answers" lists every acceptable answer, including contractions (e.g. ["has gone", "'s gone"]).
Use ${Math.ceil(size / 3)}-${Math.ceil((size * 2) / 3)} gap items. Spread correct answers over different positions.
JSON: {"items": [{"type": "choice", "prompt": "...", "options": ["...", "...", "..."], "answerIndex": 0, "explanation": {"en": "...", "vi": "..."}},
 {"type": "gap", "prompt": "She ____ to Paris twice.", "hint": "(be)", "answers": ["has been", "'s been"], "explanation": {"en": "...", "vi": "..."}}]}`,
  };
}

/**
 * Solves the set without the key
 * @returns Question numbers (1-based) where the solver disagreed
 */
async function verifySet(user: User, set: PracticeSet, feature: string, model?: string): Promise<number[]> {
  const solved = await runAIJson(
    user,
    {
      feature,
      model,
      timeoutMs: GENERATE_TIMEOUT_MS,
      system: `You are an expert in English grammar. Answer each question. For multiple choice give the 0-based index of the single
best option, or -1 if two options are equally correct or none is. For a fill-in give the words for the blank.
Respond with ONLY one JSON object.`,
      messages: [
        {
          role: 'user',
          content: `${set.items
            .map((item, i) =>
              item.type === 'choice'
                ? `${i + 1}. [choice] ${item.prompt}\n${item.options.map((o, j) => `${j}) ${o}`).join('\n')}`
                : `${i + 1}. [fill-in] ${item.prompt}${item.hint ? ` ${item.hint}` : ''}`
            )
            .join('\n\n')}\n\nJSON: {"answers": [index or text for each question, in order]}`,
        },
      ],
    },
    z.object({ answers: z.array(z.union([z.number().int(), z.string()])).length(set.items.length) })
  );
  return set.items.flatMap((item, i) => {
    const answer = solved.answers[i];
    const right =
      item.type === 'choice'
        ? answer === item.answerIndex
        : typeof answer === 'string' && item.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(answer));
    return right ? [] : [i + 1];
  });
}

/**
 * Generates `size` questions for a point and has a second pass solve them. Questions the solver
 * disagrees with are dropped; the batch is asked again when more than `maxDropped` are lost
 * @param focus Titles of the uses to cover; empty covers the whole point
 * @throws HttpError 502 if no generated batch passes the check
 */
export async function generateItems(user: User, point: GrammarPointMeta, size: number, focus: string[], maxDropped: number, model?: string): Promise<PracticeItem[]> {
  const prompt = generationPrompt(point, size, focus);
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const candidate = await runAIJson(
      user,
      { feature: 'grammar-practice', model, timeoutMs: GENERATE_TIMEOUT_MS, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] },
      itemsOf(size)
    );
    const disagreements = await verifySet(user, candidate, 'grammar-practice', model);
    if (disagreements.length <= maxDropped) return candidate.items.filter((_, i) => !disagreements.includes(i + 1));
    console.warn(`Grammar practice for ${point.id} rejected (round ${round}): solver disagreed on ${disagreements.join(', ')}`);
  }
  throw new HttpError(502, 'Generated questions failed the answer check. Please try again.', 'ai_invalid_output');
}

/**
 * Generates, checks and stores a practice set for a point
 * @throws HttpError 502 if no generated set passes the check
 */
export async function generatePracticeSet(user: User, point: GrammarPointMeta, model?: string): Promise<ContentItem> {
  // A single doubtful question is dropped by asking again; more means the set is unreliable
  const items = await generateItems(user, point, SET_SIZE, [], 0, model);
  const set: PracticeSet = { items };

  const [item] = await db
    .insert(contentItems)
    .values({
      kind: PRACTICE_KIND,
      skill: 'reading',
      language: 'en',
      part: point.id,
      level: point.cefr,
      title: `${point.title.en} practice`,
      payload: set,
      source: 'ai',
      createdBy: user.id,
    })
    .returning();
  return item;
}

/**
 * A stored set the learner has not done yet, if any
 */
export async function unseenPracticeSet(pointId: string, seen: string[]): Promise<ContentItem | null> {
  const [item] = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.kind, PRACTICE_KIND), eq(contentItems.part, pointId), eq(contentItems.status, 'published'), seen.length ? notInArray(contentItems.id, seen) : undefined))
    .limit(1);
  return item ?? null;
}

/* ---------- Review schedule ---------- */

export interface PointSchedule {
  state: 'learning' | 'review';
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

export const NEW_POINT: PointSchedule = { state: 'learning', intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 };
export const MASTERED_POINT_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Next review from a practice score (share of right answers): weak scores come back tomorrow,
 * good ones after a growing number of days
 */
export function schedulePoint(current: PointSchedule, score: number, now = new Date()): PointSchedule & { dueAt: Date } {
  let { intervalDays, ease, reps, lapses } = current;
  if (score < 0.6) {
    intervalDays = 1;
    ease = Math.max(1.3, ease - 0.2);
    lapses += current.reps > 0 ? 1 : 0;
  } else if (score < 0.85) {
    intervalDays = Math.max(2, intervalDays * 1.2);
    ease = Math.max(1.3, ease - 0.05);
    reps += 1;
  } else {
    intervalDays = intervalDays === 0 ? 3 : intervalDays * ease;
    ease = Math.min(2.8, ease + 0.05);
    reps += 1;
  }
  intervalDays = Math.round(intervalDays * 10) / 10;
  return { state: intervalDays >= 7 ? 'review' : 'learning', intervalDays, ease, reps, lapses, dueAt: new Date(now.getTime() + intervalDays * DAY_MS) };
}

/** none → learning → good (a week) → mastered (three weeks) */
export const masteryOf = (intervalDays: number | undefined) =>
  intervalDays === undefined ? 'none' : intervalDays >= MASTERED_POINT_DAYS ? 'mastered' : intervalDays >= 7 ? 'good' : 'learning';

/**
 * Moves a point's review schedule by a practice score and stores it
 * @param score Share of right answers, 0-1
 * @param setId A finished practice set, so the next practice is a new one
 */
export async function applyPointScore(userId: string, pointId: string, score: number, setId?: string) {
  const [current] = await db.select().from(grammarProgress).where(and(eq(grammarProgress.userId, userId), eq(grammarProgress.pointId, pointId)));
  const next = schedulePoint(current ? { state: current.state as 'learning' | 'review', intervalDays: current.intervalDays, ease: current.ease, reps: current.reps, lapses: current.lapses } : NEW_POINT, score);
  const values = {
    state: next.state,
    dueAt: next.dueAt,
    intervalDays: next.intervalDays,
    ease: next.ease,
    reps: next.reps,
    lapses: next.lapses,
    lastScore: score,
    practicedAt: new Date(),
  };
  await db
    .insert(grammarProgress)
    .values({ userId, pointId, ...values, seenSets: setId ? [setId] : [] })
    .onConflictDoUpdate({
      target: [grammarProgress.userId, grammarProgress.pointId],
      set: setId ? { ...values, seenSets: sql`array_append(array_remove(${grammarProgress.seenSets}, ${setId}), ${setId})` } : values,
    });
  return next;
}
