/**
 * AudioPlayback component
 * Provides HTML5 audio player with controls and clear functionality
 * Only renders when audioUrl is available
 */

import type React from 'react';

/** AudioPlayback component props */
interface AudioPlaybackProps {
  /** URL of the recorded audio blob, null if no recording exists */
  audioUrl: string | null;
  /** Handler called when user wants to clear/remove the recording */
  onClear: () => void;
}

/**
 * Audio player component for recorded audio playback
 * Returns null when no audio is available
 *
 * @param props - Component props
 * @returns AudioPlayback JSX element or null
 *
 * @example
 * ```tsx
 * <AudioPlayback
 *   audioUrl={audioUrl}
 *   onClear={clearRecording}
 * />
 * ```
 */
export const AudioPlayback: React.FC<AudioPlaybackProps> = ({
  audioUrl,
  onClear,
}) => {
  if (!audioUrl) {
    return null;
  }

  return (
    <div className="audio-playback">
      <span className="audio-playback__label">Recording</span>
      <div className="audio-playback__container">
        <audio
          src={audioUrl}
          controls
          className="audio-playback__player"
          aria-label="Recorded audio playback"
        />
        <button
          type="button"
          className="audio-playback__clear-btn"
          onClick={onClear}
          aria-label="Clear recording"
        >
          <svg
            className="audio-playback__clear-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
          Clear
        </button>
      </div>
    </div>
  );
};
