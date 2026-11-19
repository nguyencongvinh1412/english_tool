/**
 * Speech assessment types shared by the engine, post-processing and the route
 */
import { z } from 'zod';

/** read: read a given sentence aloud · answer: answer an IELTS question · transcribe: just the words (chat) */
export type SpeechMode = 'read' | 'answer' | 'transcribe';

export const PRONUNCIATION_LEVELS = ['good', 'fair', 'needs_work'] as const;
export type PronunciationLevel = (typeof PRONUNCIATION_LEVELS)[number];

export interface AssessInput {
  mode: SpeechMode;
  /** The sentence the learner read (read mode) */
  reference?: string;
  /** The question the learner answered (answer mode) */
  question?: string;
  durationSec: number;
}

const text = (max: number) => z.string().catch('').transform((s) => s.trim().slice(0, max));
const seconds = z.coerce.number().catch(Number.NaN);

/** The JSON the model returns; lenient so one odd field does not fail the whole reply */
export const rawAssessmentSchema = z.object({
  transcript: z.string().transform((s) => s.trim()),
  words: z.array(z.object({ word: text(40), start: seconds, end: seconds })).catch([]).default([]),
  issues: z
    .array(z.object({ word: text(40), heardAs: text(40).optional(), sound: text(40).optional(), tip: text(300).default('') }))
    .catch([])
    .default([]),
  overall: z
    .object({ pronunciation: z.enum(PRONUNCIATION_LEVELS).catch('fair'), intonation: text(300).optional(), clarity: text(300).optional() })
    .nullish()
    .catch(null),
  bandHint: z.object({ pronunciation: z.coerce.number(), fluency: z.coerce.number() }).nullish().catch(null),
});
export type RawAssessment = z.infer<typeof rawAssessmentSchema>;

export interface SpeechIssue {
  word: string;
  heardAs?: string;
  sound?: string;
  tip: string;
}

export interface SpeechAssessment {
  transcript: string;
  issues: SpeechIssue[];
  overall?: { pronunciation: PronunciationLevel; intonation?: string; clarity?: string };
  /** Answer mode only: measured from word timings, not judged by the model */
  fluency?: { durationSec: number; wpm: number; longPauses: number; fillers: number };
  /** Answer mode only: a rough hint; the IELTS band scorer stays the authority */
  bandHint?: { pronunciation: number; fluency: number };
  /** Read mode: the learner read a different sentence */
  offScript?: boolean;
  /** Model that produced the result */
  engineModel: string;
  /** basic: a fallback model with weak pronunciation checking answered */
  accuracy: 'full' | 'basic';
}
