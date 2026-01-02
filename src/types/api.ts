/**
 * Shared API types for frontend-backend communication
 * These types ensure type safety across the client-server boundary
 */

/**
 * Message role in a chat conversation
 * - 'user': Message from the user
 * - 'assistant': Response from Claude AI
 */
export type MessageRole = 'user' | 'assistant';

/**
 * Single message in a chat conversation
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: MessageRole;
  /** Content of the message */
  content: string;
}

/**
 * Request payload for chat endpoint
 */
export interface ChatRequest {
  /** Array of messages in the conversation */
  messages: ChatMessage[];
  /** Optional custom system prompt to override default */
  systemPrompt?: string;
}

/**
 * Successful response from chat endpoint
 */
export interface ChatResponse {
  /** Response message content from Claude */
  message: string;
}

/**
 * Error response from API endpoints
 */
export interface ApiError {
  /** Error message (sanitized for client display) */
  error: string;
  /** HTTP status code */
  statusCode: number;
}
