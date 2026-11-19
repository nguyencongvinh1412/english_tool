/**
 * Microphone error messages shared by the speaking screens
 */
import type { Messages } from '@/i18n/en';
import type { SpeechErrorKind } from '@/hooks/useSpeechRecognition';

/** Microphone problem in the learner's language */
export function micErrorText(kind: SpeechErrorKind, t: Messages): string {
  const mic = t.pronunciation.mic;
  if (kind === 'denied') return `${mic.denied}. ${mic.deniedBody}`;
  if (kind === 'no-mic') return mic.noMic;
  if (kind === 'no-speech') return mic.noSpeech;
  if (kind === 'network') return mic.network;
  return mic.other;
}
