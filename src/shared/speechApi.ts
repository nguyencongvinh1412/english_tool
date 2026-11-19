/**
 * Speech check API: send a WAV recording, get the transcript and pronunciation notes back
 */
import { AI_USED_EVENT } from '@/services/api';
import { ApiRequestError, apiFetch } from './http';

export type PronunciationLevel = 'good' | 'fair' | 'needs_work';

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
  fluency?: { durationSec: number; wpm: number; longPauses: number; fillers: number };
  bandHint?: { pronunciation: number; fluency: number };
  /** Read mode: the learner read a different sentence */
  offScript?: boolean;
  engineModel: string;
  /** basic: only a fallback model was available, so few pronunciation errors are caught */
  accuracy: 'full' | 'basic';
}

/** Summary the IELTS band scorer receives for one answer (mirrors the server's speechSummarySchema) */
export interface SpeechSummary {
  pronunciation?: PronunciationLevel;
  durationSec: number;
  wpm: number;
  longPauses: number;
  fillers: number;
  issues: string[];
}

export type AssessRequest =
  | { mode: 'read'; reference: string }
  | { mode: 'answer'; question: string }
  | { mode: 'transcribe' };

/**
 * @throws ApiRequestError; code "speech_unavailable" means fall back to browser recognition
 */
export async function assessSpeech(wav: Blob, request: AssessRequest): Promise<SpeechAssessment> {
  const form = new FormData();
  for (const [key, value] of Object.entries(request)) form.append(key, value);
  form.append('audio', wav, 'clip.wav');
  const result = await apiFetch<SpeechAssessment>('/api/speech/assess', { method: 'POST', body: form });
  window.dispatchEvent(new Event(AI_USED_EVENT));
  return result;
}

/** The server could not check speech right now; the browser transcript is the best we have */
export const isSpeechUnavailable = (error: unknown): boolean => error instanceof ApiRequestError && error.code === 'speech_unavailable';
