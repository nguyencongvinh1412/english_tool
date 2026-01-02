/**
 * useTextToSpeech hook
 * Provides text-to-speech functionality using Web Speech API
 * Enhanced voice selection and natural pacing for pleasant listening
 */

import { useState, useCallback, useRef, useEffect } from 'react';

/** TTS hook return type */
interface UseTextToSpeechReturn {
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Whether browser supports TTS */
  isSupported: boolean;
  /** Current voice name */
  currentVoice: string | null;
  /** Speak the given text */
  speak: (text: string) => void;
  /** Stop speaking */
  stop: () => void;
}

/** Speech rate (0.1 - 10) - slower for natural pacing */
const SPEECH_RATE = 0.85;

/** Speech pitch (0 - 2) - slightly lower for warmer tone */
const SPEECH_PITCH = 0.95;

/** Speech volume (0 - 1) - slightly lower to reduce harshness */
const SPEECH_VOLUME = 0.85;

/** Pause duration between sentences (ms) */
const SENTENCE_PAUSE_MS = 400;

/**
 * High-quality voice patterns to prioritize
 * These are typically neural/premium voices that sound more natural
 */
const PREFERRED_VOICE_PATTERNS = [
  // Google Neural voices (highest quality)
  'Google US English',
  'Google UK English Female',
  'Google UK English Male',
  // Microsoft Neural voices
  'Microsoft Zira',
  'Microsoft David',
  'Microsoft Jenny',
  'Microsoft Aria',
  // Apple voices (macOS/iOS) - Siri voices are best
  'Samantha',
  'Karen',
  'Daniel',
  'Moira',
  'Tessa',
  // Other high-quality voices
  'Fiona',
  'Alex',
];

/**
 * Scores a voice based on quality indicators
 * Higher score = better quality voice
 */
function getVoiceQualityScore(voice: SpeechSynthesisVoice): number {
  let score = 0;
  const nameLower = voice.name.toLowerCase();

  // Check if it matches preferred voice patterns
  for (const pattern of PREFERRED_VOICE_PATTERNS) {
    if (voice.name.includes(pattern)) {
      score += 100;
      break;
    }
  }

  // Neural/Premium/Enhanced voices are higher quality
  if (nameLower.includes('neural') || nameLower.includes('premium')) {
    score += 80;
  }
  if (nameLower.includes('enhanced') || nameLower.includes('natural')) {
    score += 70;
  }

  // Google and Microsoft voices are typically high quality
  if (nameLower.includes('google')) {
    score += 60;
  }
  if (nameLower.includes('microsoft')) {
    score += 50;
  }

  // Local voices are usually better quality and lower latency
  if (voice.localService) {
    score += 25;
  }

  // Female voices often sound clearer for learning
  if (nameLower.includes('female') || nameLower.includes('woman')) {
    score += 10;
  }

  // US and UK English are typically well-supported
  if (voice.lang === 'en-US') {
    score += 15;
  }
  if (voice.lang === 'en-GB') {
    score += 12;
  }
  if (voice.lang === 'en-AU') {
    score += 8;
  }

  // Any English voice gets a base score
  if (voice.lang.startsWith('en')) {
    score += 5;
  }

  return score;
}

/**
 * Find the best available English voice
 */
function findBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const englishVoices = voices.filter((voice) => voice.lang.startsWith('en'));

  if (englishVoices.length === 0) {
    return null;
  }

  const sortedVoices = [...englishVoices].sort(
    (a, b) => getVoiceQualityScore(b) - getVoiceQualityScore(a)
  );

  return sortedVoices[0];
}

/**
 * Split text into sentences for natural pacing
 * Handles common sentence endings and maintains reasonable chunk sizes
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or end
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If no sentences found, return the original text
  if (sentences.length === 0) {
    return [text];
  }

  return sentences;
}

/**
 * Custom hook for text-to-speech using Web Speech API
 * Enhanced with smart voice selection and natural pacing
 *
 * @returns TTS state and control functions
 */
export function useTextToSpeech(): UseTextToSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentVoice, setCurrentVoice] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const sentenceQueueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);
  const shouldStopRef = useRef(false);

  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Load voices when they become available
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
        const bestVoice = findBestVoice(availableVoices);
        if (bestVoice) {
          setCurrentVoice(bestVoice.name);
        }
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel();
        sentenceQueueRef.current = [];
        isProcessingRef.current = false;
      }
    };
  }, [isSupported]);

  /**
   * Speak a single sentence
   */
  const speakSentence = useCallback(
    (sentence: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!isSupported || shouldStopRef.current) {
          resolve();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.lang = 'en-US';
        utterance.rate = SPEECH_RATE;
        utterance.pitch = SPEECH_PITCH;
        utterance.volume = SPEECH_VOLUME;

        const bestVoice = findBestVoice(voices);
        if (bestVoice) {
          utterance.voice = bestVoice;
        }

        utterance.onend = () => resolve();
        utterance.onerror = (event) => {
          if (event.error !== 'canceled') {
            reject(event);
          } else {
            resolve();
          }
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [isSupported, voices]
  );

  /**
   * Process the sentence queue with pauses between sentences
   */
  const processSentenceQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsSpeaking(true);

    while (sentenceQueueRef.current.length > 0 && !shouldStopRef.current) {
      const sentence = sentenceQueueRef.current.shift();
      if (sentence) {
        try {
          await speakSentence(sentence);

          // Add pause between sentences if more sentences remain
          if (sentenceQueueRef.current.length > 0 && !shouldStopRef.current) {
            await new Promise((resolve) => setTimeout(resolve, SENTENCE_PAUSE_MS));
          }
        } catch (error) {
          console.error('TTS error:', error);
        }
      }
    }

    isProcessingRef.current = false;
    setIsSpeaking(false);
    shouldStopRef.current = false;
  }, [speakSentence]);

  /**
   * Speak the given text with natural sentence pacing
   */
  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text.trim()) return;

      // Stop any ongoing speech
      shouldStopRef.current = true;
      window.speechSynthesis.cancel();
      sentenceQueueRef.current = [];

      // Reset stop flag after a brief delay
      setTimeout(() => {
        shouldStopRef.current = false;

        // Split text into sentences and queue them
        const sentences = splitIntoSentences(text);
        sentenceQueueRef.current = sentences;

        // Update current voice display
        const bestVoice = findBestVoice(voices);
        if (bestVoice) {
          setCurrentVoice(bestVoice.name);
        }

        // Start processing
        processSentenceQueue();
      }, 100);
    },
    [isSupported, voices, processSentenceQueue]
  );

  /**
   * Stop speaking
   */
  const stop = useCallback(() => {
    if (isSupported) {
      shouldStopRef.current = true;
      window.speechSynthesis.cancel();
      sentenceQueueRef.current = [];
      isProcessingRef.current = false;
      setIsSpeaking(false);
    }
  }, [isSupported]);

  return {
    isSpeaking,
    isSupported,
    currentVoice,
    speak,
    stop,
  };
}
