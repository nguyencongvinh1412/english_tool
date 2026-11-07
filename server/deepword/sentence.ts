/**
 * AI feedback on a sentence a learner wrote with a word they study in depth
 */
import { z } from 'zod';
import type { User, VocabItem } from '../db/schema.js';
import { runAIJson } from '../services/ai.js';
import type { Result } from './stage.js';

const text = (max: number) => z.string().trim().max(max);

export const sentenceCheck = z.object({
  /** The word is used with the right meaning */
  meaningOk: z.boolean(),
  /** The word has the right form (spelling, part of speech, inflection) */
  formOk: z.boolean(),
  /** The grammar is correct, the sentence is natural and the collocation fits */
  naturalOk: z.boolean(),
  /** 1 to 3 short sentences in the learner's language */
  feedback: text(600).min(1),
  /** The sentence fixed or made more natural (unchanged when it is already good) */
  improved: text(400),
  /** Parts of the sentence to fix, in order, each with the reason */
  issues: z
    .array(z.object({ text: text(120).min(1), note: text(240).min(1) }))
    .max(4)
    .default([]),
});
export type SentenceCheck = z.infer<typeof sentenceCheck>;

/** What the check means for each aspect of the word */
export function resultsOf(check: SentenceCheck): { form: Result; meaning: Result; use: Result } {
  const of = (ok: boolean): Result => (ok ? 'pass' : 'fail');
  return { form: of(check.formOk), meaning: of(check.meaningOk), use: of(check.naturalOk) };
}

/** Overall: good when all three hold, almost when the meaning is right, otherwise to fix */
export const verdictOf = (check: SentenceCheck): 'good' | 'almost' | 'fix' => (check.meaningOk && check.formOk && check.naturalOk ? 'good' : check.meaningOk ? 'almost' : 'fix');

export async function checkSentence(user: User, item: Pick<VocabItem, 'term' | 'pos' | 'meaningsEn' | 'meaningVi'>, sentence: string, model?: string): Promise<SentenceCheck> {
  return runAIJson(
    user,
    {
      feature: 'deep-word-sentence',
      model,
      system: `You are a friendly English teacher for Vietnamese learners. The learner wrote one sentence to practise a word.
Judge three things separately: "meaningOk" (the word is used with its real meaning), "formOk" (spelling, part of speech and inflection of the word are right) and "naturalOk" (grammar is correct, the sentence sounds natural, and the words around it fit as collocations).
"feedback": 1-3 short sentences in ${user.uiLocale === 'vi' ? 'Vietnamese' : 'English'}: what is good, what to fix and why. Encourage; do not scold.
"improved": the sentence corrected or made more natural; repeat it unchanged when it is already good.
"issues": each part of the learner's sentence that needs fixing, as an exact substring of it in "text", with a short "note" in the same language as the feedback. Empty when nothing needs fixing.
Respond with ONLY one JSON object: {"meaningOk": true, "formOk": true, "naturalOk": true, "feedback": "...", "improved": "...", "issues": [{"text": "...", "note": "..."}]}`,
      messages: [{ role: 'user', content: `Word: ${item.term} (${item.pos ?? 'word'}: ${item.meaningsEn[0] ?? item.meaningVi ?? ''})\nSentence: ${sentence}` }],
    },
    sentenceCheck
  );
}
