/**
 * RecordButton
 * Big round microphone button; pulses red while recording
 */
import type React from 'react';
import { Icon } from '@/design';
import './speaking.css';

interface RecordButtonProps {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
  startLabel: string;
  stopLabel: string;
  disabled?: boolean;
  size?: 'md' | 'lg';
}

export const RecordButton: React.FC<RecordButtonProps> = ({
  isRecording,
  onStart,
  onStop,
  startLabel,
  stopLabel,
  disabled = false,
  size = 'lg',
}) => (
  <button
    type="button"
    className={`record record--${size} ${isRecording ? 'record--on' : ''}`}
    onClick={isRecording ? onStop : onStart}
    disabled={disabled}
    aria-pressed={isRecording}
  >
    <span className="record__disc">
      <Icon name={isRecording ? 'x' : 'mic'} size={size === 'lg' ? 34 : 24} />
    </span>
    <span className="record__label">{isRecording ? stopLabel : startLabel}</span>
  </button>
);
