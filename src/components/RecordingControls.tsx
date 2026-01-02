/**
 * RecordingControls component
 * Provides a toggle button for starting/stopping audio recording
 * Includes visual recording indicator with pulsing animation
 */

import type React from 'react';

/** RecordingControls component props */
interface RecordingControlsProps {
  /** Whether recording is currently in progress */
  isRecording: boolean;
  /** Handler called when recording should start */
  onStart: () => void;
  /** Handler called when recording should stop */
  onStop: () => void;
  /** Whether the button should be disabled */
  disabled?: boolean;
}

/**
 * Recording toggle button with visual feedback
 * Single button that switches between start/stop states
 * Shows pulsing animation when recording is active
 *
 * @param props - Component props
 * @returns Recording controls JSX element
 *
 * @example
 * ```tsx
 * <RecordingControls
 *   isRecording={isRecording}
 *   onStart={startRecording}
 *   onStop={stopRecording}
 *   disabled={!isSupported}
 * />
 * ```
 */
export const RecordingControls: React.FC<RecordingControlsProps> = ({
  isRecording,
  onStart,
  onStop,
  disabled = false,
}) => {
  const handleClick = () => {
    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  };

  const buttonLabel = isRecording ? 'Stop Recording' : 'Start Recording';
  const buttonClassName = `record-btn ${isRecording ? 'record-btn--recording' : ''}`;

  return (
    <div className="recording-controls">
      <button
        type="button"
        className={buttonClassName}
        onClick={handleClick}
        disabled={disabled}
        aria-label={buttonLabel}
        aria-pressed={isRecording}
      >
        <span className="record-btn__icon" aria-hidden="true" />
        <span className="record-btn__text">{buttonLabel}</span>
      </button>
    </div>
  );
};
