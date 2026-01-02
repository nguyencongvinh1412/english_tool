/**
 * Claude AI Service
 * Handles communication with the Anthropic Claude API
 */
import Anthropic from '@anthropic-ai/sdk';

/** Claude model to use for chat completions */
const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';

/** Request timeout in milliseconds (NFR-003: < 5 seconds) */
const REQUEST_TIMEOUT_MS = 5000;

/** Maximum tokens in response */
const MAX_TOKENS = 1024;

/** Default system prompt for English learning assistant */
const DEFAULT_SYSTEM_PROMPT = `You are a friendly and patient English speaking assistant designed to help Vietnamese speakers improve their English skills.

Your responsibilities:
- Help users practice English conversation
- Correct grammar and vocabulary mistakes gently
- Explain English concepts in a clear, simple way
- Provide examples and context for new words or phrases
- Encourage users and celebrate their progress

Always be supportive and constructive. When correcting mistakes, explain why something is incorrect and provide the correct form.`;

/**
 * Message role in a chat conversation
 */
export type MessageRole = 'user' | 'assistant';

/**
 * Single message in a chat conversation
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * Request payload for Claude chat
 */
export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
}

/**
 * Custom error for Claude API failures
 */
export class ClaudeApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly isTimeout: boolean = false
  ) {
    super(message);
    this.name = 'ClaudeApiError';
  }
}

/**
 * Validates that the API key is configured
 * @throws {ClaudeApiError} If API key is missing
 */
function validateApiKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeApiError(
      'Claude API key is not configured',
      500,
      false
    );
  }
}

/**
 * Creates an Anthropic client instance
 * @returns Configured Anthropic client
 */
function createClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

/**
 * Sends a chat message to Claude API and returns the response
 *
 * @param request - Chat request containing messages and optional system prompt
 * @returns Promise resolving to the assistant's response content
 * @throws {ClaudeApiError} If API call fails or times out
 *
 * @example
 * const response = await sendChatMessage({
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * console.log(response); // "Hello! How can I help you practice English today?"
 */
export async function sendChatMessage(request: ChatRequest): Promise<string> {
  validateApiKey();

  const client = createClient();
  const systemPrompt = request.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: request.messages,
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text');

    if (!textContent || textContent.type !== 'text') {
      throw new ClaudeApiError('No text content in Claude response', 500);
    }

    return textContent.text;
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof ClaudeApiError) {
      throw error;
    }

    // Handle Anthropic SDK errors
    if (error instanceof Anthropic.APIError) {
      console.error('Claude API Error Details:', {
        status: error.status,
        message: error.message,
        name: error.name,
      });

      // Check for timeout
      if (error.message.toLowerCase().includes('timeout')) {
        throw new ClaudeApiError(
          'Request timed out. Please try again.',
          408,
          true
        );
      }

      // Handle rate limiting
      if (error.status === 429) {
        throw new ClaudeApiError(
          'Service is temporarily busy. Please try again in a moment.',
          429
        );
      }

      // Handle authentication errors
      if (error.status === 401) {
        throw new ClaudeApiError(
          'Authentication failed. Check your API key.',
          401
        );
      }

      // Handle bad request (invalid API key format, invalid model, etc.)
      if (error.status === 400) {
        throw new ClaudeApiError(
          `Bad request: ${error.message}`,
          400
        );
      }

      throw new ClaudeApiError(
        'Failed to get response from AI service',
        error.status ?? 500
      );
    }

    // Handle timeout errors from the client
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ClaudeApiError(
        'Request timed out. Please try again.',
        408,
        true
      );
    }

    // Generic error handling
    console.error('Unexpected error in Claude service:', error);
    throw new ClaudeApiError(
      'An unexpected error occurred',
      500
    );
  }
}
