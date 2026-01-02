/**
 * ChatInput Component
 * Form input for sending chat messages
 */

import type React from 'react';
import type { FormEvent, KeyboardEvent, ChangeEvent } from 'react';
import { useState, useCallback } from 'react';

/** Props for the ChatInput component */
interface ChatInputProps {
  /** Callback fired when user submits a message */
  onSend: (message: string) => void;
  /** Whether the input should be disabled (e.g., during loading) */
  disabled?: boolean;
  /** Placeholder text for the input field */
  placeholder?: string;
}

/** Default placeholder text */
const DEFAULT_PLACEHOLDER = 'Type a message...';

/**
 * Chat input component with form submission
 * Supports Enter key submission and clears input after send
 *
 * @example
 * ```tsx
 * <ChatInput
 *   onSend={(message) => console.log('Sent:', message)}
 *   disabled={isLoading}
 *   placeholder="Ask a question..."
 * />
 * ```
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled = false,
  placeholder = DEFAULT_PLACEHOLDER,
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    setInputValue(event.target.value);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      const trimmedValue = inputValue.trim();

      if (trimmedValue && !disabled) {
        onSend(trimmedValue);
        setInputValue('');
      }
    },
    [inputValue, disabled, onSend]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      // Submit on Enter (without Shift)
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const trimmedValue = inputValue.trim();

        if (trimmedValue && !disabled) {
          onSend(trimmedValue);
          setInputValue('');
        }
      }
    },
    [inputValue, disabled, onSend]
  );

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <input
        type="text"
        className="chat-input__field"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Chat message input"
      />
      <button
        type="submit"
        className="chat-input__submit"
        disabled={disabled || !inputValue.trim()}
        aria-label="Send message"
      >
        Send
      </button>
    </form>
  );
};
