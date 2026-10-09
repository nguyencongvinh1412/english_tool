/**
 * InlineMarkdown
 * Renders the **bold** and *italic* markers AI replies use, without an HTML parser
 * (output is built from React nodes, so model text can never inject markup)
 */
import type React from 'react';

/**
 * Matches **bold**, __bold__, *italic* and _italic_ spans.
 * Underscore forms must sit on word boundaries so snake_case words stay intact.
 */
const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|(?<!\w)__[^_\n]+__(?!\w)|\*[^*\s][^*\n]*[^*\s]\*|\*[^*\s]\*|(?<!\w)_[^_\s][^_\n]*_(?!\w))/g;

export const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(INLINE_PATTERN).map((part, index) => {
      if (/^(\*\*|__).+\1$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
      if (/^([*_]).+\1$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
      return part;
    })}
  </>
);
