/**
 * Filling thin cells of the placement bank with AI-written questions. Every batch is written by one request and
 * then solved by a second request that never sees the answer key; a question the solver does not agree with is
 * dropped. Survivors are stored as drafts: nothing is asked of a learner until an admin approves it.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { placementQuestions, type User } from '../db/schema.js';
import { GENERATE_TIMEOUT_MS, runAIJson } from '../services/ai.js';
import { CEFR_ORDER } from '../progress/levels.js';

export const AI_SKILLS = ['grammar', 'reading', 'listening'] as const;
export type AiSkill = (typeof AI_SKILLS)[number];
type Level = (typeof CEFR_ORDER)[number];

const FEATURE = 'placement-generate';

const LEVEL_GUIDE: Record<Level, string> = {
  A1: 'CEFR A1: very short, simple sentences; the most common 500 words; present simple, "can", "there is".',
  A2: 'CEFR A2: short simple sentences, everyday vocabulary, present and past simple, going to.',
  B1: 'CEFR B1: clear connected sentences, common phrasal verbs, present perfect, first conditional, linking words.',
  B2: 'CEFR B2: varied complex sentences, some idioms, passive, second and third conditionals, opinions and arguments.',
  C1: 'CEFR C1: sophisticated or professional vocabulary, inversion, mixed conditionals, subtle differences in meaning.',
  C2: 'CEFR C2: near-native range, rare idioms and collocations, nuance and register, complex academic structure.',
};

const PASSAGE_WORDS: Record<Level, string> = { A1: '50-80', A2: '90-130', B1: '150-200', B2: '220-280', C1: '300-360', C2: '340-420' };

const text = (max: number) => z.string().trim().min(1).max(max);
const mcq = z.object({ prompt: text(300), options: z.array(text(160)).length(4), answerIndex: z.number().int().min(0).max(3) });
export type Mcq = z.infer<typeof mcq>;

const grammarBatch = z.object({ questions: z.array(mcq).min(3).max(10) });
const readingBatch = z.object({ passage: text(3200), questions: z.array(mcq).min(3).max(6) });
const listeningBatch = z.object({ script: z.array(text(500)).min(3).max(24), questions: z.array(mcq).min(3).max(6) });

const RULES = `Every question has exactly one correct answer that a teacher would accept without argument; the three wrong options are
clearly wrong but plausible. Spread the correct answers over all four positions. Original content, natural correct English.
Respond with ONLY one JSON object, no markdown.`;

/** Questions per batch and what to ask for, per skill */
function prompt(skill: AiSkill, level: Level, avoid: string[]): { system: string; user: string } {
  const system = `You write placement-test questions for adult learners of English. ${LEVEL_GUIDE[level]}\n${RULES}`;
  const avoidLine = avoid.length ? `\nDo not repeat these: ${avoid.map((p) => `"${p.slice(0, 80).replace(/"/g, "'")}"`).join('; ')}.` : '';
  const shape = '{"prompt": "...", "options": ["...","...","...","..."], "answerIndex": 0}';
  switch (skill) {
    case 'grammar':
      return {
        system,
        user: `Write EXACTLY 6 grammar questions at level ${level}. Each is a sentence with one gap written ____ (or "Which sentence is correct?" with the four options as full sentences). Test different structures.${avoidLine}
JSON: {"questions": [${shape}]}`,
      };
    case 'reading':
      return {
        system,
        user: `Write one reading passage of ${PASSAGE_WORDS[level]} words in 2-4 short paragraphs on an everyday or work topic, then EXACTLY 4 multiple-choice questions answerable only from the passage, in passage order.${avoidLine}
JSON: {"passage": "paragraphs separated by a blank line", "questions": [${shape}]}`,
      };
    case 'listening':
      return {
        system,
        user: `Write a short spoken text for a listening test: a dialogue between two people or a monologue (an announcement, a message), about ${PASSAGE_WORDS[level].replace(/\d+/g, (n) => String(Math.round(Number(n) * 0.7)))} words, as it would be read aloud, with no speaker labels and no stage directions. Then EXACTLY 4 multiple-choice questions about what is said (details, not the exact wording).${avoidLine}
JSON: {"script": ["one spoken line", "..."], "questions": [${shape}]}`,
      };
  }
}

/** A second pass answers the questions without the key; returns the 1-based numbers it did not agree with */
async function solve(user: User, context: string | null, questions: Mcq[], model?: string): Promise<number[]> {
  const body = questions.map((q, i) => `${i + 1}. ${q.prompt}\n${q.options.map((o, j) => `${j}) ${o}`).join('\n')}`).join('\n\n');
  const solved = await runAIJson(
    user,
    {
      feature: FEATURE,
      model,
      timeoutMs: GENERATE_TIMEOUT_MS,
      system: 'You are a careful English teacher. Answer each question with the 0-based index of the single best option, or -1 if two options are equally correct or none is. Respond with ONLY one JSON object.',
      messages: [{ role: 'user', content: `${context ? `Text:\n${context}\n\n` : ''}${body}\n\nJSON: {"answers": [index for each question, in order]}` }],
    },
    z.object({ answers: z.array(z.number().int()).length(questions.length) })
  );
  return questions.flatMap((q, i) => (solved.answers[i] === q.answerIndex ? [] : [i + 1]));
}

/** Questions that are well formed: four different options, a prompt that is not a copy of another */
export function wellFormed(q: Mcq, taken: Set<string>): boolean {
  const options = q.options.map((o) => o.trim().toLowerCase());
  if (new Set(options).size !== options.length) return false;
  const key = q.prompt.trim().toLowerCase();
  if (taken.has(key)) return false;
  taken.add(key);
  return true;
}

export interface FillResult {
  skill: AiSkill;
  level: Level;
  written: number;
  dropped: number;
  stored: number;
}

/**
 * Writes one batch for one cell, checks it, and stores the questions the solver agreed with as drafts.
 * @throws HttpError 502 when the AI's answer cannot be used (the admin can try again)
 */
export async function fillCell(user: User, skill: AiSkill, level: Level, model?: string): Promise<FillResult> {
  const existing = await db
    .select({ prompt: placementQuestions.prompt })
    .from(placementQuestions)
    .where(and(eq(placementQuestions.language, 'en'), eq(placementQuestions.skill, skill), eq(placementQuestions.level, level)));
  const taken = new Set(existing.map((e) => e.prompt.trim().toLowerCase()));
  const { system, user: userPrompt } = prompt(skill, level, existing.slice(0, 6).map((e) => e.prompt));
  const request = { feature: FEATURE, model, timeoutMs: GENERATE_TIMEOUT_MS, system, messages: [{ role: 'user' as const, content: userPrompt }] };

  let context: string | null = null;
  let questions: Mcq[];
  if (skill === 'grammar') questions = (await runAIJson(user, request, grammarBatch)).questions;
  else if (skill === 'reading') {
    const batch = await runAIJson(user, request, readingBatch);
    context = batch.passage;
    questions = batch.questions;
  } else {
    const batch = await runAIJson(user, request, listeningBatch);
    context = batch.script.join('\n');
    questions = batch.questions;
  }

  const candidates = questions.filter((q) => wellFormed(q, taken));
  const disagreed = new Set(candidates.length ? await solve(user, context, candidates, model) : []);
  const kept = candidates.filter((_, i) => !disagreed.has(i + 1));
  if (kept.length) {
    await db.insert(placementQuestions).values(
      kept.map((q) => ({ id: `ai:${randomUUID()}`, language: 'en' as const, skill, level, prompt: q.prompt, context, options: q.options, answerIndex: q.answerIndex, source: 'ai', status: 'draft' }))
    );
  }
  return { skill, level, written: questions.length, dropped: questions.length - kept.length, stored: kept.length };
}

/** Approves every AI draft in a cell (the admin has reviewed them) */
export async function approveDrafts(skill: string, level: string): Promise<number> {
  const rows = await db
    .update(placementQuestions)
    .set({ status: 'approved' })
    .where(and(eq(placementQuestions.language, 'en'), eq(placementQuestions.skill, skill), eq(placementQuestions.level, level), eq(placementQuestions.source, 'ai'), eq(placementQuestions.status, 'draft')))
    .returning({ id: placementQuestions.id });
  return rows.length;
}
