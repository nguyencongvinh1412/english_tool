/**
 * useSpeechRecognition hook
 * Provides speech-to-text functionality using Web Speech API
 * Handles browser compatibility, recognition state, and transcript management
 */

import { useState, useCallback, useRef, useEffect } from 'react';

/** Speech recognition hook state */
interface UseSpeechRecognitionState {
  /** Whether speech recognition is currently listening */
  isListening: boolean;
  /** Final transcript of recognized speech */
  transcript: string;
  /** Interim (in-progress) transcript */
  interimTranscript: string;
  /** Error message if recognition failed */
  error: string | null;
  /** Whether browser supports speech recognition */
  isSupported: boolean;
}

/** Speech recognition hook return type */
interface UseSpeechRecognitionReturn extends UseSpeechRecognitionState {
  /** Start listening for speech */
  startListening: () => void;
  /** Stop listening for speech */
  stopListening: () => void;
  /** Reset transcript to empty string */
  resetTranscript: () => void;
}

/** Recognition language */
const RECOGNITION_LANG = 'en-US';

/**
 * Get SpeechRecognition constructor from window
 * Handles vendor prefixes for browser compatibility
 */
function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Custom hook for speech recognition using Web Speech API
 * Provides real-time speech-to-text transcription with interim results
 *
 * @returns Speech recognition state and control functions
 *
 * @example
 * ```tsx
 * const {
 *   isListening,
 *   transcript,
 *   interimTranscript,
 *   error,
 *   isSupported,
 *   startListening,
 *   stopListening,
 *   resetTranscript
 * } = useSpeechRecognition();
 *
 * if (!isSupported) {
 *   return <div>Browser does not support speech recognition</div>;
 * }
 *
 * return (
 *   <div>
 *     <button onClick={isListening ? stopListening : startListening}>
 *       {isListening ? 'Stop' : 'Start'}
 *     </button>
 *     <p>Final: {transcript}</p>
 *     <p>Interim: {interimTranscript}</p>
 *   </div>
 * );
 * ```
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const SpeechRecognitionClass = getSpeechRecognition();
  const isSupported = SpeechRecognitionClass !== null;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  /**
   * Initialize speech recognition instance
   * Configured for continuous mode with interim results
   */
  useEffect(() => {
    if (!SpeechRecognitionClass) {
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = RECOGNITION_LANG;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // Handle recognition results
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcriptText = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += transcriptText;
        } else {
          currentInterim += transcriptText;
        }
      }

      if (finalTranscript) {
        setTranscript((prev) => prev + finalTranscript);
      }
      setInterimTranscript(currentInterim);
    };

    // Handle recognition end
    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    // Handle recognition errors
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      setInterimTranscript('');

      switch (event.error) {
        case 'no-speech':
          setError('No speech detected. Please try speaking again.');
          break;
        case 'audio-capture':
          setError('No microphone found. Please check your microphone.');
          break;
        case 'not-allowed':
          setError('Microphone permission denied. Please allow microphone access.');
          break;
        case 'network':
          setError('Speech recognition unavailable. Please check your internet connection or try typing instead.');
          break;
        case 'aborted':
          // User aborted - no error message needed
          break;
        default:
          setError('Speech recognition error. Please try again or type your message.');
      }
    };

    recognitionRef.current = recognition;

    // Cleanup on unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, [SpeechRecognitionClass]);

  /**
   * Start listening for speech
   * Clears previous errors before starting
   */
  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSupported) {
      setError('Speech recognition not supported');
      return;
    }

    // Clear error when starting new session
    setError(null);

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      // Handle case where recognition is already started
      if (err instanceof DOMException && err.name === 'InvalidStateError') {
        // Already listening, ignore
        setIsListening(true);
      } else {
        setError('Failed to start speech recognition');
      }
    }
  }, [isSupported]);

  /**
   * Stop listening for speech
   * Recognition end handler will clear interim transcript
   */
  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  /**
   * Reset transcript to empty string
   * Clears both final and interim transcripts
   */
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}
