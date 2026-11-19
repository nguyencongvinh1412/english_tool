/**
 * useSpokenText
 * Voice input that ends in text, for screens where the learner speaks into a box.
 * English: the recording is turned into text by the server (accurate with accents, does not cut off on a pause).
 * Japanese, a browser that cannot record, or a server check that is unavailable: the browser's own speech recognition.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { micErrorText } from '@/shared/micError';
import { assessSpeech, isSpeechUnavailable } from '@/shared/speechApi';
import { useAudioCapture, type CaptureResult } from './useAudioCapture';
import { useSpeechRecognition, type SpeechErrorKind } from './useSpeechRecognition';

interface Options<T> {
  /** Japanese always uses the browser's recognition */
  language?: 'en' | 'ja';
  /** A recording stops by itself after this many seconds */
  maxSec: number;
  /**
   * Called with the text of each finished recording, possibly seconds after it stopped.
   * `tag` is what `start` was given, so the text lands where the recording was started even if the learner moved on.
   */
  onText: (text: string, tag: T | undefined) => void;
}

export interface SpokenText<T> {
  isSupported: boolean;
  isListening: boolean;
  /** The server is turning a finished recording into text */
  checking: boolean;
  /** Text heard so far while recording (desktop shows it live; phones may not) */
  liveText: string;
  /** Loudness 0..1 for a level ring (server recording only) */
  level: number | undefined;
  error: string | null;
  errorKind: SpeechErrorKind | null;
  start: (tag?: T) => void;
  stop: () => void;
}

export function useSpokenText<T = undefined>({ language = 'en', maxSec, onText }: Options<T>): SpokenText<T> {
  const { t } = useI18n();
  const browser = useSpeechRecognition(language);
  const [pending, setPending] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const tagRef = useRef<T | undefined>(undefined);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const onTake = useCallback(
    ({ wav, fallbackText }: CaptureResult) => {
      // The next recording may start before this one is checked, so the tag is taken now
      const tag = tagRef.current;
      setPending((n) => n + 1);
      setNote(null);
      assessSpeech(wav, { mode: 'transcribe' })
        .then((result) => onTextRef.current(result.transcript, tag))
        .catch((failure: unknown) => {
          // The server check is down: keep what the browser heard, if anything
          const heard = fallbackText();
          if (heard) onTextRef.current(heard, tag);
          else setNote(isSpeechUnavailable(failure) ? t.speechCheck.unavailableNoText : errorMessage(failure, t));
        })
        .finally(() => setPending((n) => n - 1));
    },
    [t]
  );
  const capture = useAudioCapture({ maxSec, livePreview: true, onComplete: onTake });
  const serverVoice = language === 'en' && capture.isSupported;

  // Browser recognition: when it stops, hand over what it heard
  const { isListening: browserListening, transcript, resetTranscript } = browser;
  useEffect(() => {
    if (serverVoice || browserListening || !transcript) return;
    onTextRef.current(transcript, tagRef.current);
    resetTranscript();
  }, [serverVoice, browserListening, transcript, resetTranscript]);

  const start = useCallback(
    (tag?: T) => {
      tagRef.current = tag;
      setNote(null);
      if (serverVoice) void capture.start();
      else {
        resetTranscript();
        browser.startListening();
      }
    },
    [serverVoice, capture, resetTranscript, browser]
  );

  return {
    isSupported: serverVoice || browser.isSupported,
    isListening: serverVoice ? capture.status === 'recording' || capture.status === 'starting' : browser.isListening,
    checking: pending > 0,
    liveText: serverVoice ? capture.liveText : `${browser.transcript} ${browser.interimTranscript}`.trim(),
    level: serverVoice ? capture.level : undefined,
    error: serverVoice ? (capture.errorKind ? micErrorText(capture.errorKind, t) : note) : browser.error,
    errorKind: serverVoice ? capture.errorKind : browser.errorKind,
    start,
    stop: serverVoice ? capture.stop : browser.stopListening,
  };
}
