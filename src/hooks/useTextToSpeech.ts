/**
 * useTextToSpeech hook
 * Speaks text with the server's natural voices (browser voice as fallback)
 * and tracks whether something is playing
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isSpeechSupported, speakOnce } from '@/shared/speech';

/** TTS hook return type */
interface UseTextToSpeechReturn {
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Whether the device can play speech */
  isSupported: boolean;
  /** Speak the given text, optionally at a custom rate (0.5 - 1.5) */
  speak: (text: string, rate?: number) => void;
  /** Stop speaking */
  stop: () => void;
}

/** Default playback rate */
const DEFAULT_RATE = 1;

/**
 * Custom hook for text-to-speech
 * @returns TTS state and control functions
 */
export function useTextToSpeech(): UseTextToSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const isSupported = isSpeechSupported();

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, rate: number = DEFAULT_RATE) => {
      if (!isSupported || !text.trim()) return;
      stopRef.current?.();
      setIsSpeaking(true);
      stopRef.current = speakOnce(text, rate, () => setIsSpeaking(false));
    },
    [isSupported]
  );

  // Stop on unmount
  useEffect(() => () => stopRef.current?.(), []);

  return { isSpeaking, isSupported, speak, stop };
}
