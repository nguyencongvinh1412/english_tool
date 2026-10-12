/**
 * InlineMarkdown
 * Renders the **bold** and *italic* markers AI replies use, without an HTML parser
 * (output is built from React nodes, so model text can never inject markup)
 */
import type React from 'react';
import { JaText } from './ja/JaText';
import { splitJapaneseRuns } from './ja/text';

/**
 * Matches **bold**, __bold__, *italic* and _italic_ spans.
 * Underscore forms must sit on word boundaries so snake_case words stay intact.
 */
const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|(?<!\w)__[^_\n]+__(?!\w)|\*[^*\s][^*\n]*[^*\s]\*|\*[^*\s]\*|(?<!\w)_[^_\s][^_\n]*_(?!\w))/g;

/**
 * Plain text, or with japanese: Japanese runs shown with furigana and the rest left as is
 */
function renderText(text: string, japanese: boolean): React.ReactNode {
  if (!japanese) return text;
  return splitJapaneseRuns(text).map((run, index) => (run.japanese ? <JaText key={index} text={run.text} /> : run.text));
}

export const InlineMarkdown: React.FC<{ text: string; japanese?: boolean }> = ({ text, japanese = false }) => (
  <>
    {text.split(INLINE_PATTERN).map((part, index) => {
      if (/^(\*\*|__).+\1$/.test(part)) return <strong key={index}>{renderText(part.slice(2, -2), japanese)}</strong>;
      if (/^([*_]).+\1$/.test(part)) return <em key={index}>{renderText(part.slice(1, -1), japanese)}</em>;
      return japanese ? <span key={index}>{renderText(part, true)}</span> : part;
    })}
  </>
);
