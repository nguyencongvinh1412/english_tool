/**
 * Grammar mistakes: tagging corrections and wrong test answers with the grammar point they belong
 * to, recording them, and finding what a learner should review now
 */
import { z } from 'zod';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { grammarMistakes, grammarProgress, type User } from '../db/schema.js';
import { runAIJson } from '../services/ai.js';
import { GRAMMAR_POINTS } from './map.js';

/** Mistakes older than this no longer count */
export const MISTAKE_DAYS = 30;
/** This many recent mistakes on a point without practice since means "review now" */
export const URGENT_MISTAKES = 2;

const KNOWN = new Set(GRAMMAR_POINTS.map((p) => p.id));
export const isGrammarPoint = (id: unknown): id is string => typeof id === 'string' && KNOWN.has(id);

/** Point ids with their English titles, for prompts */
export const pointCatalog = () => GRAMMAR_POINTS.map((p) => `${p.id} (${p.title.en})`).join(', ');

interface Correction {
  original: string;
  corrected: string;
  grammarPoint?: string;
}

/**
 * Drops grammar point ids the AI made up, so stored feedback only links to real points
 */
export function sanitizeCorrections<T extends { corrections: Correction[] }>(feedback: T): T {
  for (const correction of feedback.corrections) {
    if (!isGrammarPoint(correction.grammarPoint)) delete correction.grammarPoint;
  }
  return feedback;
}

/**
 * Records the tagged corrections of scored writing as mistakes
 */
export async function recordWritingMistakes(userId: string, feedback: { corrections: Correction[] }): Promise<void> {
  const rows = feedback.corrections
    .filter((c): c is Correction & { grammarPoint: string } => isGrammarPoint(c.grammarPoint))
    .map((c) => ({ userId, pointId: c.grammarPoint, source: 'writing', wrong: c.original.slice(0, 300), right: c.corrected.slice(0, 300) }));
  if (rows.length > 0) await db.insert(grammarMistakes).values(rows);
}

export interface TestMistake {
  /** The question as shown, with its blank */
  prompt: string;
  /** Right answer and what the learner chose */
  correct: string;
  chosen?: string;
}

const tagReply = z.object({ items: z.array(z.object({ index: z.number().int().min(1), point: z.string().nullable() })) });

/**
 * Asks the AI which grammar point each wrong test answer is about, and records them
 * @returns The point per input, or null when none fits
 */
export async function tagTestMistakes(user: User, mistakes: TestMistake[], model?: string): Promise<(string | null)[]> {
  const reply = await runAIJson(
    user,
    {
      feature: 'grammar-tag',
      model,
      timeoutMs: 120_000,
      system: `You tag English test mistakes with the grammar point they test. For each numbered question choose ONE id from this list,
or null when it tests vocabulary (word choice, collocation, meaning) rather than grammar.
Grammar points: ${pointCatalog()}.
Respond with ONLY one JSON object: {"items": [{"index": 1, "point": "present-perfect"}]}`,
      messages: [
        {
          role: 'user',
          content: mistakes.map((m, i) => `${i + 1}. ${m.prompt}\n   correct: ${m.correct}${m.chosen ? `; learner chose: ${m.chosen}` : ''}`).join('\n'),
        },
      ],
    },
    tagReply
  );
  const tags = mistakes.map((_, i) => {
    const point = reply.items.find((item) => item.index === i + 1)?.point;
    return isGrammarPoint(point) ? point : null;
  });
  const rows = tags.flatMap((point, i) => (point ? [{ userId: user.id, pointId: point, source: 'test', wrong: mistakes[i].chosen?.slice(0, 300) ?? null, right: mistakes[i].correct.slice(0, 300) }] : []));
  if (rows.length > 0) await db.insert(grammarMistakes).values(rows);
  return tags;
}

export interface MistakeSummary {
  pointId: string;
  count: number;
  lastAt: Date;
  /** Review now: several recent mistakes and no practice since the last one */
  urgent: boolean;
  examples: { wrong: string | null; right: string | null }[];
}

/**
 * Points the learner made mistakes on recently, most frequent first
 */
export async function recentMistakes(userId: string): Promise<MistakeSummary[]> {
  const since = new Date(Date.now() - MISTAKE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ pointId: grammarMistakes.pointId, count: sql<number>`count(*)::int`, lastAt: sql<Date>`max(${grammarMistakes.createdAt})` })
    .from(grammarMistakes)
    .where(and(eq(grammarMistakes.userId, userId), gte(grammarMistakes.createdAt, since)))
    .groupBy(grammarMistakes.pointId)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${grammarMistakes.createdAt})`));
  if (rows.length === 0) return [];

  const practised = new Map((await db.select({ pointId: grammarProgress.pointId, at: grammarProgress.practicedAt }).from(grammarProgress).where(eq(grammarProgress.userId, userId))).map((r) => [r.pointId, r.at]));
  const examples = await db
    .select({ pointId: grammarMistakes.pointId, wrong: grammarMistakes.wrong, right: grammarMistakes.right })
    .from(grammarMistakes)
    .where(and(eq(grammarMistakes.userId, userId), gte(grammarMistakes.createdAt, since)))
    .orderBy(desc(grammarMistakes.createdAt))
    .limit(200);

  return rows.map((row) => {
    const lastAt = new Date(row.lastAt);
    const practicedAt = practised.get(row.pointId);
    return {
      pointId: row.pointId,
      count: row.count,
      lastAt,
      urgent: row.count >= URGENT_MISTAKES && (!practicedAt || practicedAt < lastAt),
      examples: examples.filter((e) => e.pointId === row.pointId && e.wrong && e.right).slice(0, 2).map(({ wrong, right }) => ({ wrong, right })),
    };
  });
}

const askReply = z.object({
  onTopic: z.boolean(),
  answer: z.string().trim().min(1).max(2500),
  points: z.array(z.string()).max(6).default([]),
});

/**
 * Answers a grammar question and points to the grammar points that explain it
 */
export async function answerGrammarQuestion(user: User, question: string, model?: string): Promise<{ answer: string; points: string[]; onTopic: boolean }> {
  const reply = await runAIJson(
    user,
    {
      feature: 'grammar-ask',
      model,
      timeoutMs: 120_000,
      system: `You are a friendly English grammar teacher for Vietnamese learners. Answer the question accurately and briefly (under 180 words),
with 2-3 short example sentences when useful. Write the explanation in ${user.uiLocale === 'vi' ? 'Vietnamese' : 'English'}; keep example sentences in English.
When two forms compete, say how they differ. "points" lists up to 4 ids from this list that explain the answer (most relevant first),
or [] if none: ${pointCatalog()}.
Only answer questions about English grammar, usage, vocabulary or punctuation; for anything else set "onTopic" to false and politely say
in "answer" that you can only help with English questions. Respond with ONLY one JSON object: {"onTopic": true, "answer": "...", "points": ["..."]}`,
      messages: [{ role: 'user', content: question }],
    },
    askReply
  );
  return { onTopic: reply.onTopic, answer: reply.answer, points: reply.onTopic ? reply.points.filter(isGrammarPoint) : [] };
}
