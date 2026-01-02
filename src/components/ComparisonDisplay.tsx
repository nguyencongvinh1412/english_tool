/**
 * ComparisonDisplay Component
 * Shows the result of comparing user speech with target phrase
 * Displays similarity score, feedback message, and word-by-word analysis
 */

import type React from 'react';
import type { ComparisonResult } from '@/utils/textComparison';
import { getSimilarityFeedback } from '@/utils/textComparison';

/** ComparisonDisplay component props */
interface ComparisonDisplayProps {
  /** The comparison result to display */
  result: ComparisonResult;
}

/**
 * Displays comparison results with visual feedback
 * Shows overall similarity score, encouraging feedback, and highlights
 * which words were matched (green) or missed (red)
 *
 * @param props - Component props
 * @returns ComparisonDisplay JSX element
 *
 * @example
 * ```tsx
 * <ComparisonDisplay result={{
 *   similarity: 80,
 *   targetWords: [
 *     { word: 'hello', matched: true },
 *     { word: 'world', matched: false }
 *   ],
 *   userWords: ['hello']
 * }} />
 * ```
 */
export const ComparisonDisplay: React.FC<ComparisonDisplayProps> = ({
  result,
}) => {
  const feedbackMessage = getSimilarityFeedback(result.similarity);

  return (
    <div className="comparison-display">
      <div className="similarity-score">
        <span className="similarity-score__value">{result.similarity}%</span>
        <span className="similarity-score__label">Accuracy</span>
      </div>

      <p className="comparison-feedback">{feedbackMessage}</p>

      <div className="word-comparison">
        <span className="word-comparison__label">Word Analysis:</span>
        <div className="word-comparison__words">
          {result.targetWords.map((wordMatch, index) => (
            <span
              key={`${wordMatch.word}-${index}`}
              className={`word-comparison__word ${
                wordMatch.matched
                  ? 'word-comparison__word--matched'
                  : 'word-comparison__word--missed'
              }`}
            >
              {wordMatch.word}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
