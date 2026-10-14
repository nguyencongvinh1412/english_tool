/**
 * Grammar point content: the explanation shown on a point's card (forms, uses, signal words,
 * common mistakes of Vietnamese learners, notes on confusable points), in English and Vietnamese
 */
import { z } from 'zod';
import { GRAMMAR_POINTS, type GrammarPointMeta } from './map.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const bilingual = (max: number) => z.object({ en: text(max), vi: text(max) });
const example = z.object({ en: text(250), vi: text(300) });

export const grammarContent = z.object({
  summary: bilingual(500),
  forms: z
    .array(z.object({ label: bilingual(60), pattern: text(200), example }))
    .min(1)
    .max(8),
  uses: z
    .array(z.object({ title: bilingual(120), explanation: bilingual(700), examples: z.array(example).min(1).max(3) }))
    .min(1)
    .max(6),
  /** Words that often signal this point (since, already, if…) */
  signals: z.array(text(60)).max(14).default([]),
  mistakes: z
    .array(z.object({ wrong: text(200), right: text(200), why: bilingual(400) }))
    .min(1)
    .max(5),
  /** How this point differs from each point it is often confused with */
  contrastNotes: z
    .array(z.object({ with: text(60), note: bilingual(600) }))
    .max(5)
    .default([]),
  tip: bilingual(400).optional(),
});
export type GrammarContent = z.infer<typeof grammarContent>;

const titleOf = (id: string) => GRAMMAR_POINTS.find((p) => p.id === id)?.title.en ?? id;

/**
 * Prompt for the AI draft of one point
 */
export function grammarDraftPrompt(point: GrammarPointMeta): { system: string; user: string } {
  const contrasts = point.contrasts ?? [];
  const system = `You are an experienced English grammar teacher writing a reference card for Vietnamese learners.
Write accurate, modern standard English grammar (British and American usage noted when they differ). Keep it clear and practical,
for a learner at about CEFR ${point.cefr}. Every text field has an English ("en") and a natural Vietnamese ("vi") version;
patterns and example sentences are English, each example with its Vietnamese translation.
"mistakes" are typical errors of Vietnamese speakers (e.g. leaving out the verb "be", the third-person -s, articles, wrong tense),
written as a wrong sentence, the right one, and why.
Original wording only; do not copy textbooks. Respond with ONLY one JSON object, no markdown.`;

  const user = `Grammar point: ${point.title.en} (${point.title.vi}), CEFR ${point.cefr}.
${point.builds?.length ? `Learners already know: ${point.builds.map(titleOf).join(', ')}.` : ''}
${contrasts.length ? `It is often confused with: ${contrasts.map((id) => `${titleOf(id)} [${id}]`).join(', ')}. Add one "contrastNotes" entry for each, with "with" = the id in brackets.` : 'Leave "contrastNotes" empty.'}
JSON shape:
{"summary": {"en": "one or two sentences: what it is and when to use it", "vi": "..."},
 "forms": [{"label": {"en": "Affirmative", "vi": "Khẳng định"}, "pattern": "S + V(s/es) + O", "example": {"en": "...", "vi": "..."}}],
 "uses": [{"title": {"en": "...", "vi": "..."}, "explanation": {"en": "...", "vi": "..."}, "examples": [{"en": "...", "vi": "..."}]}],
 "signals": ["..."],
 "mistakes": [{"wrong": "...", "right": "...", "why": {"en": "...", "vi": "..."}}],
 "contrastNotes": [{"with": "point-id", "note": {"en": "...", "vi": "..."}}],
 "tip": {"en": "a short memory tip", "vi": "..."}}
Use 2-5 forms (affirmative, negative, question when they apply), 2-5 uses, 2-4 mistakes.`;
  return { system, user };
}
