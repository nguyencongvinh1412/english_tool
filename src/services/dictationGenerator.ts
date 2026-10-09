/**
 * Dictation Lesson Generator
 * Asks the AI to write a short passage for dictation practice
 */

import type { Difficulty } from '@/constants/phrases';
import type { DictationLesson } from '@/constants/dictations';
import { sendMessage } from './api';

/** Minimum sentences a generated lesson must contain */
const MIN_SENTENCES = 3;

/** Maximum sentences kept from a generated lesson */
const MAX_SENTENCES = 10;

/** Level guidance passed to the AI for each difficulty */
const LEVEL_GUIDANCE: Record<Difficulty, string> = {
  easy: 'CEFR A2. 6-8 sentences, 5-10 words each, simple everyday vocabulary, present and past simple.',
  medium: 'CEFR B1-B2. 6-8 sentences, 10-16 words each, common phrasal verbs and linking words.',
  hard: 'CEFR C1. 5-7 sentences, 14-22 words each, natural academic or professional vocabulary.',
};

/** System prompt forcing a strict JSON response */
const GENERATOR_PROMPT = `You write short English listening passages for dictation practice for Vietnamese learners.
Rules:
- The passage must be coherent, natural, and factually reasonable.
- Write every number as words (e.g. "twenty", not "20").
- Do not use abbreviations, symbols, emojis, or quotation marks inside sentences.
- Respond with ONLY a JSON object, no markdown, no explanation:
{"title": "<short title>", "sentences": ["<sentence 1>", "<sentence 2>", ...]}`;

/** Shape of the AI's JSON response */
interface GeneratedLesson {
  title?: unknown;
  sentences?: unknown;
}

/**
 * Extract and validate the lesson JSON from the AI response
 * Tolerates markdown fences or extra text around the JSON object
 *
 * @param response - Raw AI response text
 * @returns Parsed title and sentences
 * @throws Error if the response is not a valid lesson
 */
function parseLesson(response: string): { title: string; sentences: string[] } {
  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');

  if (start === -1 || end <= start) {
    throw new Error('AI returned an invalid lesson. Please try again.');
  }

  const parsed = JSON.parse(response.slice(start, end + 1)) as GeneratedLesson;
  const sentences = Array.isArray(parsed.sentences)
    ? parsed.sentences
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, MAX_SENTENCES)
    : [];

  if (sentences.length < MIN_SENTENCES) {
    throw new Error('AI returned too few sentences. Please try again.');
  }

  const title =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : 'AI Lesson';

  return { title, sentences };
}

/**
 * Generate a dictation lesson on a topic with the AI
 *
 * @param topic - Lesson topic, e.g. "travelling by train"
 * @param difficulty - Target difficulty level
 * @returns Promise resolving to a new dictation lesson
 * @throws Error if the AI request fails or returns an invalid lesson
 */
export async function generateDictationLesson(
  topic: string,
  difficulty: Difficulty
): Promise<DictationLesson> {
  const request = `Topic: ${topic}
Level: ${LEVEL_GUIDANCE[difficulty]}`;

  const response = await sendMessage([{ role: 'user', content: request }], GENERATOR_PROMPT);

  let lesson: { title: string; sentences: string[] };
  try {
    lesson = parseLesson(response);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('AI returned an invalid lesson. Please try again.');
    }
    throw error;
  }

  return {
    id: `ai-${Date.now()}`,
    title: lesson.title,
    difficulty,
    sentences: lesson.sentences,
  };
}
