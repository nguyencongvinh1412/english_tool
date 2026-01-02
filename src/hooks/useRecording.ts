/**
 * useRecording hook
 * Provides audio recording functionality using MediaRecorder API
 * Handles microphone permission, recording state, and audio blob management
 */

import { useState, useCallback, useRef } from 'react';

/** Recording hook state */
interface UseRecordingState {
  /** Whether recording is in progress */
  isRecording: boolean;
  /** URL of the recorded audio blob */
  audioUrl: string | null;
  /** Error message if recording failed */
  error: string | null;
}

/** Recording hook return type */
interface UseRecordingReturn extends UseRecordingState {
  /** Start recording audio */
  startRecording: () => Promise<void>;
  /** Stop recording and create audio blob */
  stopRecording: () => void;
  /** Clear the recorded audio and revoke object URL */
  clearRecording: () => void;
}

/** Audio MIME type for recording */
const AUDIO_MIME_TYPE = 'audio/webm';

/**
 * Custom hook for audio recording using MediaRecorder API
 * Manages microphone permissions, recording state, and audio blob lifecycle
 *
 * @returns Recording state and control functions
 *
 * @example
 * ```tsx
 * const { isRecording, audioUrl, error, startRecording, stopRecording, clearRecording } = useRecording();
 *
 * // Start recording
 * await startRecording();
 *
 * // Stop and get audio
 * stopRecording();
 * console.log(audioUrl); // blob:http://...
 *
 * // Cleanup
 * clearRecording();
 * ```
 */
export function useRecording(): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  /**
   * Start audio recording
   * Requests microphone permission and begins recording
   */
  const startRecording = useCallback(async () => {
    // Clear previous errors when starting new recording
    setError(null);

    // Revoke previous audio URL if exists
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Create MediaRecorder with preferred MIME type
      const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
        ? AUDIO_MIME_TYPE
        : 'audio/ogg';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // Collect audio data chunks
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop - create audio blob
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        setIsRecording(false);

        // Stop all tracks to release microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      // Handle recording errors
      mediaRecorder.onerror = () => {
        setError('Recording error occurred');
        setIsRecording(false);
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      // Handle permission and other errors
      if (err instanceof DOMException) {
        switch (err.name) {
          case 'NotAllowedError':
            setError('Microphone permission denied');
            break;
          case 'NotFoundError':
            setError('No microphone found');
            break;
          case 'NotReadableError':
            setError('Microphone is already in use');
            break;
          default:
            setError('Failed to access microphone');
        }
      } else {
        setError('Failed to start recording');
      }
      setIsRecording(false);
    }
  }, [audioUrl]);

  /**
   * Stop audio recording
   * Stops MediaRecorder which triggers onstop handler to create audio blob
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  }, [isRecording]);

  /**
   * Clear recorded audio and revoke object URL
   * Prevents memory leaks by properly disposing of blob URLs
   */
  const clearRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    audioChunksRef.current = [];
    setError(null);
  }, [audioUrl]);

  return {
    isRecording,
    audioUrl,
    error,
    startRecording,
    stopRecording,
    clearRecording,
  };
}
