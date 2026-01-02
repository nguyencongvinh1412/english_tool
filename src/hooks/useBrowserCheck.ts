/**
 * useBrowserCheck Hook
 * Checks browser capabilities for speech recognition and media access
 * Returns feature availability status for conditional rendering
 */

import { useMemo } from 'react';

/** Browser capability detection results */
interface BrowserCapabilities {
  /** Whether Speech Recognition API is available */
  speechRecognition: boolean;
  /** Whether Media Devices API is available */
  mediaDevices: boolean;
  /** Whether all required features are supported */
  isSupported: boolean;
  /** List of unsupported feature names */
  unsupportedFeatures: string[];
}

/** Feature display names for user messaging */
const FEATURE_NAMES = {
  SPEECH_RECOGNITION: 'Speech Recognition',
  MICROPHONE_ACCESS: 'Microphone Access',
} as const;

/**
 * Checks if Speech Recognition API is available in browser
 */
function checkSpeechRecognition(): boolean {
  return (
    'SpeechRecognition' in window ||
    'webkitSpeechRecognition' in window
  );
}

/**
 * Checks if Media Devices API is available in browser
 */
function checkMediaDevices(): boolean {
  return (
    'mediaDevices' in navigator &&
    'getUserMedia' in navigator.mediaDevices
  );
}

/**
 * Hook for checking browser feature compatibility
 * Memoized to prevent unnecessary recalculations
 *
 * @returns Browser capability status object
 *
 * @example
 * ```tsx
 * const { isSupported, unsupportedFeatures } = useBrowserCheck();
 *
 * if (!isSupported) {
 *   return <BrowserWarning features={unsupportedFeatures} />;
 * }
 * ```
 */
export function useBrowserCheck(): BrowserCapabilities {
  return useMemo(() => {
    const speechRecognition = checkSpeechRecognition();
    const mediaDevices = checkMediaDevices();

    const unsupportedFeatures: string[] = [];

    if (!speechRecognition) {
      unsupportedFeatures.push(FEATURE_NAMES.SPEECH_RECOGNITION);
    }

    if (!mediaDevices) {
      unsupportedFeatures.push(FEATURE_NAMES.MICROPHONE_ACCESS);
    }

    return {
      speechRecognition,
      mediaDevices,
      isSupported: speechRecognition && mediaDevices,
      unsupportedFeatures,
    };
  }, []);
}
