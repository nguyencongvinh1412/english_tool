/**
 * Answer-key verification
 * A second AI pass answers a generated group without seeing the key; any disagreement
 * means a flawed question (ambiguous, contradictory or wrongly keyed), so the group is rejected.
 */
import { z } from 'zod';
import type { User } from '../db/schema.js';
import { GENERATE_TIMEOUT_MS, runAIJson } from '../services/ai.js';
import type { ToeicPart } from './toeic.js';

interface GroupLike {
  items?: { question: string; options: string[]; answerIndex: number }[];
  questions?: { prompt: string; options: string[]; answerIndex: number }[];
  script?: { speaker: string; text: string }[];
  passage?: string;
  passages?: { title: string; text: string }[];
}

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * The group as a test-taker sees it, without answers
 */
function describeForSolver(part: ToeicPart, group: GroupLike): { context: string; questions: string[] } {
  if (part === 2) {
    return {
      context: 'Each item is a spoken question followed by three spoken responses. Choose the best response.',
      questions: (group.items ?? []).map((item) => `${item.question}\n${item.options.map((o, i) => `${LETTERS[i]}. ${o}`).join('\n')}`),
    };
  }

  const context =
    part === 3 || part === 4
      ? `Transcript:\n${(group.script ?? []).map((line) => `${line.speaker}: ${line.text}`).join('\n')}`
      : part === 6
        ? `Text with numbered blanks:\n${group.passage ?? ''}`
        : part === 7
          ? (group.passages ?? []).map((p) => `${p.title}\n${p.text}`).join('\n\n---\n\n')
          : 'Choose the word or phrase that best completes each sentence.';

  return {
    context,
    questions: (group.questions ?? []).map((q) => `${q.prompt}\n${q.options.map((o, i) => `${LETTERS[i]}. ${o}`).join('\n')}`),
  };
}

/**
 * Answer key of a group in question order
 */
function answerKey(part: ToeicPart, group: GroupLike): number[] {
  return part === 2 ? (group.items ?? []).map((i) => i.answerIndex) : (group.questions ?? []).map((q) => q.answerIndex);
}

/**
 * Solves the group independently and compares with the key
 * @returns Question numbers (1-based) where the solver disagreed; empty when the key is confirmed
 */
export async function verifyAnswerKey(user: User, part: ToeicPart, group: GroupLike, feature: string): Promise<number[]> {
  const { context, questions } = describeForSolver(part, group);
  const key = answerKey(part, group);

  const solved = await runAIJson(
    user,
    {
      feature,
      timeoutMs: GENERATE_TIMEOUT_MS,
      system: `You are an expert TOEIC test-taker. Answer each question with the single best option.
If two options are equally acceptable or none is correct, answer -1 for that question.
Respond with ONLY one JSON object.`,
      messages: [
        {
          role: 'user',
          content: `${context}\n\nQuestions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}\n\nJSON: {"answers": [0-based option index or -1 for each question, in order]}`,
        },
      ],
    },
    z.object({ answers: z.array(z.number().int().min(-1).max(3)).length(key.length) })
  );

  return key.flatMap((answer, i) => (solved.answers[i] === answer ? [] : [i + 1]));
}
