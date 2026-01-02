/**
 * useClaude Hook
 * Manages conversation state and Claude AI communication
 */

import { useState, useCallback } from 'react';
import type { ChatMessage } from '@/types/api';
import { sendMessage } from '@/services/api';

/** State returned by useClaude hook */
interface UseClaudeState {
  /** Array of messages in the conversation */
  messages: ChatMessage[];
  /** Whether a request is currently in progress */
  isLoading: boolean;
  /** Error message if the last request failed */
  error: string | null;
}

/** Actions returned by useClaude hook */
interface UseClaudeActions {
  /** Send a user message and receive AI response */
  sendUserMessage: (content: string) => Promise<void>;
  /** Clear all messages in the conversation */
  clearMessages: () => void;
}

/** Options for useClaude hook */
interface UseClaudeOptions {
  /** Optional initial system prompt for the conversation */
  initialSystemPrompt?: string;
}

/**
 * Hook for managing Claude AI conversations
 *
 * @param options - Configuration options
 * @returns State and actions for managing the conversation
 *
 * @example
 * ```tsx
 * const { messages, isLoading, error, sendUserMessage, clearMessages } = useClaude({
 *   initialSystemPrompt: 'You are a helpful English tutor.'
 * });
 *
 * const handleSend = async (text: string) => {
 *   await sendUserMessage(text);
 * };
 * ```
 */
export function useClaude(options: UseClaudeOptions = {}): UseClaudeState & UseClaudeActions {
  const { initialSystemPrompt } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sends a user message and receives the AI response
   * Automatically updates messages state with both user and assistant messages
   */
  const sendUserMessage = useCallback(
    async (content: string): Promise<void> => {
      if (!content.trim()) return;

      const userMessage: ChatMessage = {
        role: 'user',
        content: content.trim(),
      };

      // Add user message to state
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        // Send all messages including the new one
        const allMessages = [...messages, userMessage];
        const response = await sendMessage(allMessages, initialSystemPrompt);

        // Add assistant response to state
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: response,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, initialSystemPrompt]
  );

  /**
   * Clears all messages in the conversation
   */
  const clearMessages = useCallback((): void => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendUserMessage,
    clearMessages,
  };
}
