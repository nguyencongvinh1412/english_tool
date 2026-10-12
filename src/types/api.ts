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
 * Activity a chat request belongs to (mirrors server/content/chatPrompts.ts)
 */
export type ChatContext =
  | { mode: 'conversation'; topic?: string }
  | { mode: 'scenario'; scenario: { aiRole: string; userRole: string; context: string; difficulty: 'beginner' | 'intermediate' | 'advanced' } }
  | { mode: 'pronunciation' }
  | { mode: 'dictation' }
  | { mode: 'ja-conversation'; topic?: string; politeness: 'polite' | 'casual'; level: 'N5' | 'N4' | 'N3' | 'N2' | 'N1' }
  | { mode: 'ja-scenario'; scenario: { aiRole: string; userRole: string; context: string }; level: 'N5' | 'N4' | 'N3' | 'N2' | 'N1' }
  | { mode: 'ja-pronunciation' };

/**
 * Request payload for chat endpoint
 */
export interface ChatRequest {
  /** Array of messages in the conversation */
  messages: ChatMessage[];
  /** Activity the chat belongs to; the server builds the system prompt from it */
  context: ChatContext;
  /** Optional AI model ID (from GET /api/chat/models) */
  model?: string;
}

/**
 * Response from models endpoint
 */
export interface ModelsResponse {
  /** Allowed model IDs; empty when the AI proxy is unavailable */
  models: string[];
  /** Server default model, or null when the AI proxy is unavailable */
  defaultModel: string | null;
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
