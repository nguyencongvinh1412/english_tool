/**
 * SuggestedPrompts Component
 * Displays a list of suggested phrases the user can click to quickly send
 */

import type React from 'react';

/** Props for the SuggestedPrompts component */
interface SuggestedPromptsProps {
  /** Array of suggested prompt strings */
  prompts: string[];
  /** Callback when a prompt is selected */
  onSelect: (prompt: string) => void;
}

/**
 * Displays clickable prompt chips that can be used to quickly send a message
 * Useful for scenario-based conversations where common phrases are provided
 *
 * @param props - Component props
 * @returns SuggestedPrompts JSX element
 *
 * @example
 * ```tsx
 * <SuggestedPrompts
 *   prompts={['Hello!', 'How are you?', 'Thank you']}
 *   onSelect={(prompt) => sendMessage(prompt)}
 * />
 * ```
 */
export const SuggestedPrompts: React.FC<SuggestedPromptsProps> = ({ prompts, onSelect }) => {
  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className="suggested-prompts">
      <h4 className="suggested-prompts__title">Suggested phrases:</h4>
      <div className="suggested-prompts__list">
        {prompts.map((prompt, index) => (
          <button
            key={index}
            type="button"
            className="suggested-prompts__chip"
            onClick={() => onSelect(prompt)}
            aria-label={`Use phrase: ${prompt}`}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
};
