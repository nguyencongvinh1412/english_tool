/**
 * The AI's short note on a learner's week (Plus): it only restates and interprets the numbers of the review, in the
 * learner's language, and may not invent anything that is not in them.
 */
import { z } from 'zod';
import { runAIJson } from '../services/ai.js';
import type { User } from '../db/schema.js';
import type { WeeklyReview } from './weekly.js';

const reply = z.object({ text: z.string().trim().min(20).max(900) });

export async function weeklyCoachNote(user: User, review: WeeklyReview, model?: string): Promise<string> {
  const language = user.uiLocale === 'vi' ? 'Vietnamese' : 'English';
  const facts = {
    week: `${review.weekStart} to ${review.weekEnd}`,
    studyDays: `${review.studyDays} of ${review.plannedDays} planned days`,
    minutes: review.minutes === null ? 'not recorded' : `${review.minutes} of ${review.plannedMinutes} planned`,
    targets: review.targets.map((t) => `${t.kind}${t.skill ? ` ${t.skill}` : ''}: ${t.have}/${t.goal}`),
    shareOfTargetsMet: `${review.percent}%`,
    bestSkill: review.best,
    weakestSkill: review.weak,
    suggestion: review.suggestion,
  };
  const result = await runAIJson(
    user,
    {
      feature: 'weekly-note',
      model,
      system: `You are a calm, encouraging study coach. Write 3 to 4 short sentences in ${language} about the learner's week, using only the facts given. Name what went well first, then the one thing to change, in a neutral tone: no pressure, no guilt, no exclamation marks, no invented numbers. Respond with ONLY one JSON object.`,
      messages: [{ role: 'user', content: `Facts: ${JSON.stringify(facts)}\n\nJSON: {"text": "..."}` }],
    },
    reply
  );
  return result.text;
}
