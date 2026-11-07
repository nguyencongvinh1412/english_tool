/**
 * Deep content of a word: simple definition, close words, word family, collocations, register and examples.
 * Written once by the AI and shared by every learner; an admin can edit and approve it.
 */
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { deepWordContent, vocabItems, type User, type VocabItem } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import { GENERATE_TIMEOUT_MS, runAIJson } from '../services/ai.js';

const text = (max: number) => z.string().trim().min(1).max(max);

/** A sentence with a typical mistake with the word, the corrected sentence and why */
export const fixSchema = z.object({ wrong: text(240), right: text(240), note: z.string().trim().max(300).default('') });

export const deepContentSchema = z.object({
  simpleDefinition: text(300),
  coreUse: text(300),
  synonyms: z.array(text(40)).max(6).default([]),
  antonyms: z.array(text(40)).max(4).default([]),
  contrast: z.array(z.object({ word: text(40), difference: text(300), differenceVi: text(300) })).max(3).default([]),
  wordFamily: z.array(text(40)).max(8).default([]),
  // A model sometimes lists plain phrases; keep them, the example sentence is optional then
  collocations: z
    .array(z.union([z.string().trim().min(1).max(60).transform((phrase) => ({ phrase, example: '' })), z.object({ phrase: text(60), example: z.string().trim().max(200).default('') })]))
    .min(1)
    .max(8),
  register: text(160),
  examples: z.array(z.object({ text: text(240), vi: text(300) })).min(2).max(5),
  fixes: z.array(fixSchema).max(4).default([]),
});
export type DeepContent = z.infer<typeof deepContentSchema>;

/** Generations in progress, so two learners opening the same word do not pay for it twice */
const inFlight = new Map<string, Promise<void>>();

/**
 * The prompt that asks for the deep content of one word
 */
export function contentPrompt(item: Pick<VocabItem, 'term' | 'pos' | 'meaningsEn' | 'meaningVi' | 'level'>): { system: string; user: string } {
  return {
    system: `You write vocabulary notes for Vietnamese learners of English, based on how words are really used.
Write about ONE English word. Be accurate; do not invent collocations. Keep every English sentence natural and short.
Fields:
- "simpleDefinition": the core meaning in plain English a ${item.level || 'B1'} learner understands.
- "coreUse": one sentence on the most common way to use the word (for a beginner).
- "synonyms", "antonyms": single words or short phrases, only when they really exist.
- "contrast": up to 2 near-meaning words learners confuse with it; "difference" in English, "differenceVi" in Vietnamese; both short and concrete.
- "wordFamily": related forms (optimize, optimal, optimizer...).
- "collocations": 3 to 6 common word combinations with a short example sentence each.
- "register": formality and where it is used, in English (e.g. "semi-formal; common in business and technical writing").
- "examples": 3 or 4 example sentences from everyday work or study life, each with a natural Vietnamese translation in "vi".
- "fixes": 2 sentences where a learner makes a typical mistake with this word (wrong collocation, wrong part of speech, wrong preposition); "wrong" has exactly one mistake, "right" is the corrected sentence, "note" explains it briefly in English.
Respond with ONLY one JSON object with exactly these fields and this shape (objects, not plain strings, inside "contrast", "collocations" and "examples"):
{"simpleDefinition": "...", "coreUse": "...", "synonyms": ["..."], "antonyms": [], "contrast": [{"word": "...", "difference": "...", "differenceVi": "..."}], "wordFamily": ["..."], "collocations": [{"phrase": "cost optimization", "example": "..."}], "register": "...", "examples": [{"text": "...", "vi": "..."}], "fixes": [{"wrong": "...", "right": "...", "note": "..."}]}`,
    user: `Word: ${item.term}\nPart of speech: ${item.pos ?? 'unknown'}\nMeaning: ${item.meaningsEn[0] ?? item.meaningVi ?? ''}`,
  };
}

/** The saved content of a word, or null */
export async function findContent(itemId: string) {
  const [row] = await db.select().from(deepWordContent).where(eq(deepWordContent.itemId, itemId)).limit(1);
  return row ?? null;
}

/**
 * Makes sure a word has its deep content. Returns when it exists; concurrent calls for one word share one request.
 * @throws HttpError 404 when the word is not an English word, or the AI error when it fails
 */
export async function ensureContent(user: User, itemId: string, model?: string): Promise<NonNullable<Awaited<ReturnType<typeof findContent>>>> {
  const existing = await findContent(itemId);
  if (existing) return existing;

  const [item] = await db.select().from(vocabItems).where(eq(vocabItems.id, itemId)).limit(1);
  if (!item || item.language !== 'en') throw new HttpError(404, 'Word not found.', 'not_found');

  let job = inFlight.get(itemId);
  if (!job) {
    job = (async () => {
      const prompt = contentPrompt(item);
      const content = await runAIJson(user, { feature: 'deep-word-content', model, system: prompt.system, messages: [{ role: 'user', content: prompt.user }], timeoutMs: GENERATE_TIMEOUT_MS }, deepContentSchema);
      await db.insert(deepWordContent).values({ itemId, ...content }).onConflictDoNothing();
    })().finally(() => inFlight.delete(itemId));
    inFlight.set(itemId, job);
  }
  await job;
  const created = await findContent(itemId);
  if (!created) throw new HttpError(502, 'The AI returned an invalid result. Please try again.', 'ai_invalid_output');
  return created;
}

/**
 * Starts writing the content in the background (when a word enters a queue). A failure is not an error here:
 * the content is written when the word is opened.
 */
export function prepareContent(user: User, itemId: string): void {
  void ensureContent(user, itemId).catch(() => undefined);
}

const fixesOnly = z.object({ fixes: z.array(fixSchema).min(1).max(4) });

/** Fix-the-sentence exercises of one word, written when its content has none (older content) */
export async function ensureFixes(user: User, itemId: string, model?: string): Promise<z.infer<typeof fixSchema>[]> {
  const content = await findContent(itemId);
  if (!content) return [];
  const existing = content.fixes as z.infer<typeof fixSchema>[];
  if (existing.length > 0) return existing;
  const [item] = await db.select().from(vocabItems).where(eq(vocabItems.id, itemId)).limit(1);
  if (!item) return [];
  const { fixes } = await runAIJson(
    user,
    {
      feature: 'deep-word-content',
      model,
      system: `You write exercises for Vietnamese learners of English. Write 2 sentences in which a learner makes a typical mistake with ONE word (wrong collocation, wrong part of speech, wrong preposition).
"wrong" has exactly one mistake; "right" is the corrected sentence; "note" explains the mistake briefly in English.
Respond with ONLY one JSON object: {"fixes": [{"wrong": "...", "right": "...", "note": "..."}]}`,
      messages: [{ role: 'user', content: `Word: ${item.term} (${item.pos ?? 'word'}: ${item.meaningsEn[0] ?? ''})` }],
    },
    fixesOnly
  );
  await db.update(deepWordContent).set({ fixes }).where(eq(deepWordContent.itemId, itemId));
  return fixes;
}

/** Starts writing the missing fix exercises in the background; a failure is not an error */
export function prepareFixes(user: User, itemId: string): void {
  void ensureFixes(user, itemId).catch(() => undefined);
}
