/**
 * JaText
 * Japanese text with furigana (readings) above kanji, from 漢字{かんじ} markup.
 * The learner chooses whether readings are always shown, shown on tap, or hidden.
 */
import type React from 'react';
import { useEffect } from 'react';
import { parseRuby } from './text';
import { ensureJapaneseFont, useFuriganaPreference, type FuriganaMode } from './furigana';
import './ja.css';

interface JaTextProps {
  /** Text with optional 漢字{かんじ} readings */
  text: string;
  /** Mode when the learner has no saved preference (beginners see readings) */
  defaultMode?: FuriganaMode;
  className?: string;
}

export const JaText: React.FC<JaTextProps> = ({ text, defaultMode = 'always', className = '' }) => {
  const [preference] = useFuriganaPreference();
  const mode = preference ?? defaultMode;

  useEffect(ensureJapaneseFont, []);

  return (
    <span lang="ja" className={`ja-text ja-text--${mode} ${className}`}>
      {parseRuby(text).map((segment, index) =>
        segment.reading ? (
          // Focusable in tap mode so a tap (or keyboard focus) reveals the reading
          <ruby key={index} tabIndex={mode === 'tap' ? 0 : undefined}>
            {segment.text}
            <rp>(</rp>
            <rt>{segment.reading}</rt>
            <rp>)</rp>
          </ruby>
        ) : (
          segment.text
        )
      )}
    </span>
  );
};
