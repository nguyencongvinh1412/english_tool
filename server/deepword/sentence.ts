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
  feedback: text(900).min(1),
  /** The text fixed or made more natural (unchanged when it is already good) */
  improved: text(900),
  /** Parts of the text to fix, in order, each with the reason */
  issues: z
    .array(z.object({ text: text(200).min(1), note: text(300).min(1) }))
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

export type ProduceKind = 'sentence' | 'speak' | 'paragraph' | 'scenario';

export interface ProduceInput {
  kind: ProduceKind;
  text: string;
  /** The situation the learner answered (scenario) */
  situation?: string;
  /** Other words the learner was asked to use too (paragraph) */
  alsoUse?: string[];
}

const KIND_NOTES: Record<ProduceKind, string> = {
  sentence: 'The learner wrote ONE sentence to practise the word.',
  speak: 'The learner SAID one sentence aloud; it was typed by speech recognition. Ignore capital letters, punctuation and small recognition slips; judge the words they chose.',
  paragraph: 'The learner wrote a SHORT PARAGRAPH (2 to 4 sentences) that uses the word. Judge the whole text; "naturalOk" also covers whether the sentences connect.',
  scenario: 'The learner was given a SITUATION and answered it using the word. "naturalOk" also covers whether the answer suits the situation and the way people speak in it.',
};

/**
 * AI feedback on what a learner produced with a word: a sentence, a spoken sentence, a short paragraph or an answer to a
 * situation. The same three judgements for all, so each moves the same cells of the word's depth.
 */
export async function checkProduction(user: User, item: Pick<VocabItem, 'term' | 'pos' | 'meaningsEn' | 'meaningVi'>, input: ProduceInput, model?: string): Promise<SentenceCheck> {
  const lang = user.uiLocale === 'vi' ? 'Vietnamese' : 'English';
  const extra = input.alsoUse?.length ? `\nThe learner was also asked to use: ${input.alsoUse.join(', ')}. Mention them only if they are missing or misused.` : '';
  return runAIJson(
    user,
    {
      feature: 'deep-word-sentence',
      model,
      system: `You are a friendly English teacher for Vietnamese learners. ${KIND_NOTES[input.kind]}
Judge three things separately: "meaningOk" (the word is used with its real meaning), "formOk" (spelling, part of speech and inflection of the word are right) and "naturalOk" (grammar is correct, it sounds natural, and the words around the word fit as collocations).${extra}
"feedback": 1-3 short sentences in ${lang}: what is good, what to fix and why. Encourage; do not scold.
"improved": the text corrected or made more natural; repeat it unchanged when it is already good.
"issues": each part of the learner's text that needs fixing, as an exact substring of it in "text", with a short "note" in ${lang}. Empty when nothing needs fixing.
Respond with ONLY one JSON object: {"meaningOk": true, "formOk": true, "naturalOk": true, "feedback": "...", "improved": "...", "issues": [{"text": "...", "note": "..."}]}`,
      messages: [
        {
          role: 'user',
          content: `Word: ${item.term} (${item.pos ?? 'word'}: ${item.meaningsEn[0] ?? item.meaningVi ?? ''})${input.situation ? `\nSituation: ${input.situation}` : ''}\n${input.kind === 'sentence' || input.kind === 'speak' ? 'Sentence' : input.kind === 'paragraph' ? 'Paragraph' : 'Answer'}: ${input.text}`,
        },
      ],
    },
    sentenceCheck
  );
}

export const checkSentence = (user: User, item: Pick<VocabItem, 'term' | 'pos' | 'meaningsEn' | 'meaningVi'>, sentence: string, model?: string): Promise<SentenceCheck> =>
  checkProduction(user, item, { kind: 'sentence', text: sentence }, model);
