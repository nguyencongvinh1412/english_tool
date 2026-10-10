/**
 * Scoring Prompts
 * IELTS-style band scoring for writing and speaking. Bands are estimates, not official scores.
 */
import type { z } from 'zod';
import type { speakingIelts, writingPrompt } from './schemas.js';

type Locale = 'en' | 'vi';

/** Criteria per writing task, in the order the AI must return them */
const WRITING_CRITERIA = {
  'ielts-task1': [
    ['TA', 'Task Achievement'],
    ['CC', 'Coherence and Cohesion'],
    ['LR', 'Lexical Resource'],
    ['GRA', 'Grammatical Range and Accuracy'],
  ],
  'ielts-task2': [
    ['TR', 'Task Response'],
    ['CC', 'Coherence and Cohesion'],
    ['LR', 'Lexical Resource'],
    ['GRA', 'Grammatical Range and Accuracy'],
  ],
  email: [
    ['TF', 'Task Fulfilment'],
    ['ORG', 'Organisation and Tone'],
    ['LR', 'Vocabulary'],
    ['GRA', 'Grammar and Accuracy'],
  ],
} as const;

const SPEAKING_CRITERIA = [
  ['FC', 'Fluency and Coherence'],
  ['LR', 'Lexical Resource'],
  ['GRA', 'Grammatical Range and Accuracy'],
  ['P', 'Pronunciation (estimated from transcript)'],
] as const;

/**
 * Language instruction for feedback text; corrections and model answers stay in English
 */
function languageRule(locale: Locale): string {
  return locale === 'vi'
    ? 'Write every comment, strength, improvement and explanation in Vietnamese. Keep quoted English words, corrections, better answers and the improved version in English.'
    : 'Write all feedback in clear, simple English.';
}

const criteriaJson = (criteria: readonly (readonly [string, string])[]) =>
  criteria.map(([key, name]) => `{"key": "${key}", "name": "${name}", "band": 6.5, "comment": "..."}`).join(', ');

/**
 * Prompt for scoring a writing response
 */
export function writingScoringPrompt(
  task: z.infer<typeof writingPrompt>,
  response: string,
  locale: Locale
): { system: string; user: string } {
  const criteria = WRITING_CRITERIA[task.taskType];
  const words = response.trim().split(/\s+/).filter(Boolean).length;

  return {
    system: `You are an experienced IELTS and TOEIC writing examiner coaching a Vietnamese learner.
Score strictly but fairly using the public IELTS band descriptors (0-9 in steps of 0.5); for the email task use the same
band scale to estimate quality. Penalise responses under the minimum word count (${task.minWords}) and off-topic answers.
The overall band is the average of the four criteria rounded down to the nearest 0.5.
${languageRule(locale)}
Respond with ONLY one JSON object, no markdown.`,
    user: `TASK (${task.taskType}): ${task.title}
Instructions: ${task.instructions}
Prompt: ${task.prompt}
${task.email ? `Email to reply to (from ${task.email.from}, subject "${task.email.subject}"):\n${task.email.body}\n` : ''}${task.chart ? `Chart data: ${JSON.stringify(task.chart)}\n` : ''}
LEARNER RESPONSE (${words} words):
"""
${response}
"""

Return:
{"overallBand": 6.0,
 "criteria": [${criteriaJson(criteria)}],
 "strengths": ["..."],
 "improvements": ["specific, actionable advice"],
 "corrections": [{"original": "exact phrase from the response", "corrected": "...", "explanation": "..."}],
 "improvedVersion": "a rewritten version of the learner's response at about one band higher, keeping their ideas"}
List up to 10 of the most important corrections; "original" must be copied exactly from the response.`,
  };
}

/**
 * Prompt for scoring a spoken IELTS set from speech-recognition transcripts
 */
export function speakingScoringPrompt(
  set: z.infer<typeof speakingIelts>,
  answers: { question: string; transcript: string }[],
  locale: Locale
): { system: string; user: string } {
  return {
    system: `You are an experienced IELTS Speaking examiner coaching a Vietnamese learner.
You only have speech-recognition transcripts: judge fluency from length, development and coherence of answers;
estimate pronunciation cautiously from recognition quality (misrecognised words suggest unclear pronunciation) and say so.
Bands 0-9 in steps of 0.5. The overall band is the average of the four criteria rounded to the nearest 0.5.
${languageRule(locale)}
Respond with ONLY one JSON object, no markdown.`,
    user: `TOPIC: ${set.topic}
ANSWERS:
${answers.map((a, i) => `${i + 1}. Q: ${a.question}\n   A: ${a.transcript || '(no answer)'}`).join('\n')}

Return:
{"overallBand": 6.0,
 "criteria": [${criteriaJson(SPEAKING_CRITERIA)}],
 "strengths": ["..."],
 "improvements": ["..."],
 "answers": [{"question": "...", "comment": "...", "betterAnswer": "a natural band-7+ answer the learner could give"}]}
Include one "answers" entry per question above, in the same order.`,
  };
}
