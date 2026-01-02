/**
 * MessageList Component
 * Displays a scrollable list of chat messages with role-based styling
 */

import type React from 'react';
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types/api';

/** Props for the MessageList component */
interface MessageListProps {
  /** Array of messages to display */
  messages: ChatMessage[];
  /** Whether the AI is currently processing a response */
  isLoading?: boolean;
  /** Callback when AI message should be spoken */
  onSpeakMessage?: (text: string) => void;
}

/** Role labels for display */
const ROLE_LABELS: Record<ChatMessage['role'], string> = {
  user: 'You',
  assistant: 'AI',
};

/**
 * Displays a list of chat messages with role indicators
 * Includes a loading indicator when waiting for AI response
 * Auto-scrolls to bottom when new messages arrive
 *
 * @example
 * ```tsx
 * <MessageList
 *   messages={[
 *     { role: 'user', content: 'Hello!' },
 *     { role: 'assistant', content: 'Hi there!' }
 *   ]}
 *   isLoading={false}
 * />
 * ```
 */
export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading = false,
  onSpeakMessage,
}) => {
  const hasMessages = messages.length > 0;
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Speak new AI messages
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'assistant' && onSpeakMessage) {
        onSpeakMessage(lastMessage.content);
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, onSpeakMessage]);

  return (
    <div className="message-list">
      {!hasMessages && !isLoading && (
        <div className="message-list__empty">
          <p className="message-list__empty-text">Start a conversation by typing a message below.</p>
        </div>
      )}

      {messages.map((message, index) => (
        <div key={index} className={`message message--${message.role}`}>
          <span className="message__role">{ROLE_LABELS[message.role]}</span>
          <p className="message__content">{message.content}</p>
          {message.role === 'assistant' && onSpeakMessage && (
            <button
              type="button"
              className="message__speak-btn"
              onClick={() => onSpeakMessage(message.content)}
              title="Listen to this message"
            >
              🔊
            </button>
          )}
        </div>
      ))}

      {isLoading && (
        <div className="message message--assistant message--loading">
          <span className="message__role">{ROLE_LABELS.assistant}</span>
          <div className="typing-indicator">
            <span className="typing-indicator__dot" />
            <span className="typing-indicator__dot" />
            <span className="typing-indicator__dot" />
            <span className="typing-indicator__text">Thinking...</span>
          </div>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
};
