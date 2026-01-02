/**
 * PhraseDisplay Component
 * Displays a practice phrase with its difficulty badge and category
 * Used in pronunciation practice to show the target phrase
 */

import type React from 'react';
import type { Phrase } from '@/constants/phrases';

/** PhraseDisplay component props */
interface PhraseDisplayProps {
  /** The phrase to display */
  phrase: Phrase;
}

/**
 * Displays a practice phrase prominently with metadata
 * Shows difficulty as a colored badge and category label
 *
 * @param props - Component props
 * @returns PhraseDisplay JSX element
 *
 * @example
 * ```tsx
 * <PhraseDisplay phrase={{
 *   id: '1',
 *   text: 'Hello, how are you?',
 *   category: 'Greetings',
 *   difficulty: 'easy'
 * }} />
 * ```
 */
export const PhraseDisplay: React.FC<PhraseDisplayProps> = ({ phrase }) => {
  const difficultyClass = `difficulty-badge difficulty-badge--${phrase.difficulty}`;

  return (
    <div className="phrase-display">
      <div className="phrase-display__header">
        <span className={difficultyClass}>{phrase.difficulty}</span>
        <span className="phrase-display__category">{phrase.category}</span>
      </div>
      <p className="phrase-display__text">{phrase.text}</p>
    </div>
  );
};
