/**
 * TranscriptDisplay component
 * Displays speech-to-text transcription with real-time interim results
 * Shows final transcript in primary color and interim in muted/italic style
 */

import type React from 'react';

/** TranscriptDisplay component props */
interface TranscriptDisplayProps {
  /** Final transcript text (confirmed speech recognition results) */
  transcript: string;
  /** Interim transcript text (in-progress recognition, not yet confirmed) */
  interimTranscript: string;
}

/** Placeholder text shown when no transcript exists */
const PLACEHOLDER_TEXT = 'Your speech will appear here...';

/**
 * Component to display speech recognition results
 * Separates final and interim transcripts for better UX
 *
 * @param props - Component props
 * @returns TranscriptDisplay JSX element
 *
 * @example
 * ```tsx
 * <TranscriptDisplay
 *   transcript="Hello, how are you?"
 *   interimTranscript="I am doing"
 * />
 * ```
 */
export const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({
  transcript,
  interimTranscript,
}) => {
  const hasContent = transcript || interimTranscript;

  return (
    <div className="transcript-display">
      <span className="transcript-label">Transcript</span>
      <div className="transcript-content">
        {hasContent ? (
          <>
            {transcript && (
              <span className="final-transcript">{transcript}</span>
            )}
            {interimTranscript && (
              <span className="interim-transcript">{interimTranscript}</span>
            )}
          </>
        ) : (
          <span className="transcript-placeholder">{PLACEHOLDER_TEXT}</span>
        )}
      </div>
    </div>
  );
};
