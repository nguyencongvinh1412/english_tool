/**
 * MicrophonePermission Component
 * Handles microphone permission request flow
 * Displays appropriate error messages for different failure scenarios
 */

import type React from 'react';
import { useState, useCallback } from 'react';

interface MicrophonePermissionProps {
  /** Callback when permission is granted */
  onGranted: () => void;
  /** Optional callback when permission is denied */
  onDenied?: (error: string) => void;
}

/** Error messages for different permission failure scenarios */
const ERROR_MESSAGES = {
  NOT_ALLOWED: 'Microphone access denied. Please enable it in browser settings.',
  NOT_FOUND: 'No microphone found. Please connect a microphone.',
  DEFAULT: 'Unable to access microphone. Please check your settings.',
} as const;

/**
 * Gets user-friendly error message from DOMException
 *
 * @param error - The DOMException from getUserMedia
 * @returns User-friendly error message
 */
function getErrorMessage(error: DOMException): string {
  switch (error.name) {
    case 'NotAllowedError':
      return ERROR_MESSAGES.NOT_ALLOWED;
    case 'NotFoundError':
      return ERROR_MESSAGES.NOT_FOUND;
    default:
      return `${ERROR_MESSAGES.DEFAULT} (${error.message})`;
  }
}

/**
 * Component for requesting and handling microphone permissions
 *
 * @example
 * ```tsx
 * <MicrophonePermission
 *   onGranted={() => setHasPermission(true)}
 *   onDenied={(error) => console.error(error)}
 * />
 * ```
 */
export function MicrophonePermission({
  onGranted,
  onDenied,
}: MicrophonePermissionProps): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  /**
   * Requests microphone access from the browser
   */
  const requestPermission = useCallback(async (): Promise<void> => {
    setIsRequesting(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop all tracks to release the microphone
      stream.getTracks().forEach((track) => track.stop());
      onGranted();
    } catch (err) {
      let errorMessage: string = ERROR_MESSAGES.DEFAULT;

      if (err instanceof DOMException) {
        errorMessage = getErrorMessage(err);
      } else if (err instanceof Error) {
        errorMessage = `${ERROR_MESSAGES.DEFAULT} (${err.message})`;
      }

      setError(errorMessage);
      onDenied?.(errorMessage);
    } finally {
      setIsRequesting(false);
    }
  }, [onGranted, onDenied]);

  return (
    <div className="permission-request" role="dialog" aria-labelledby="permission-title">
      <h3 id="permission-title" className="permission-request__title">
        Microphone Access Required
      </h3>
      <p className="permission-request__description">
        This app needs microphone access to record your voice for pronunciation practice.
      </p>

      {error && (
        <div className="permission-request__error" role="alert">
          {error}
        </div>
      )}

      <button
        onClick={requestPermission}
        disabled={isRequesting}
        className="permission-request__button"
        type="button"
      >
        {isRequesting ? 'Requesting...' : 'Enable Microphone'}
      </button>
    </div>
  );
}
