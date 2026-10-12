/**
 * JaText
 * Japanese text with furigana (readings) above kanji, from 漢字{かんじ} markup.
 * The learner chooses whether readings are always shown, shown on tap, or hidden.
 * With onWordTap, each word becomes a button (tap-to-define).
 */
import type React from 'react';
import { useEffect } from 'react';
import { parseRuby, wordsOf, type RubySegment } from './text';
import { ensureJapaneseFont, useFuriganaPreference, type FuriganaMode } from './furigana';
import './ja.css';

interface JaTextProps {
  /** Text with optional 漢字{かんじ} readings */
  text: string;
  /** Mode when the learner has no saved preference (beginners see readings) */
  defaultMode?: FuriganaMode;
  className?: string;
  /** Makes words tappable; receives the plain word */
  onWordTap?: (word: string) => void;
  /** Highlights the word being looked up */
  activeWord?: string | null;
}

/**
 * Segments with their readings as ruby
 */
const Pieces: React.FC<{ pieces: RubySegment[]; focusable: boolean }> = ({ pieces, focusable }) => (
  <>
    {pieces.map((segment, index) =>
      segment.reading ? (
        // Focusable in tap mode so a tap (or keyboard focus) reveals the reading
        <ruby key={index} tabIndex={focusable ? 0 : undefined}>
          {segment.text}
          <rp>(</rp>
          <rt>{segment.reading}</rt>
          <rp>)</rp>
        </ruby>
      ) : (
        segment.text
      )
    )}
  </>
);

export const JaText: React.FC<JaTextProps> = ({ text, defaultMode = 'always', className = '', onWordTap, activeWord }) => {
  const [preference] = useFuriganaPreference();
  const mode = preference ?? defaultMode;

  useEffect(ensureJapaneseFont, []);

  return (
    <span lang="ja" className={`ja-text ja-text--${mode} ${className}`}>
      {onWordTap
        ? wordsOf(text).map((word, index) =>
            word.isWord ? (
              <button
                key={index}
                type="button"
                className={`ja-word ${activeWord === word.text ? 'ja-word--active' : ''}`}
                onClick={() => onWordTap(word.text)}
              >
                <Pieces pieces={word.pieces} focusable={false} />
              </button>
            ) : (
              <Pieces key={index} pieces={word.pieces} focusable={false} />
            )
          )
        : <Pieces pieces={parseRuby(text)} focusable={mode === 'tap'} />}
    </span>
  );
};
