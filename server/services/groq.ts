/**
 * Groq AI Service
 * Handles communication with Groq API (fast LLama models)
 */
import Groq from 'groq-sdk';

/** Groq model to use - Llama 3.3 70B is fast and capable */
const GROQ_MODEL = 'llama-3.3-70b-versatile';

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
 * Request payload for Groq chat
 */
export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
}

/**
 * Custom error for Groq API failures
 */
export class GroqApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly isTimeout: boolean = false
  ) {
    super(message);
    this.name = 'GroqApiError';
  }
}

/**
 * Validates that the API key is configured
 * @throws {GroqApiError} If API key is missing
 */
function validateApiKey(): void {
  if (!process.env.GROQ_API_KEY) {
    throw new GroqApiError(
      'Groq API key is not configured. Get one free at https://console.groq.com/keys',
      500,
      false
    );
  }
}

/**
 * Creates a Groq client instance
 * @returns Configured Groq client
 */
function createClient(): Groq {
  return new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
}

/**
 * Sends a chat message to Groq API and returns the response
 *
 * @param request - Chat request containing messages and optional system prompt
 * @returns Promise resolving to the assistant's response content
 * @throws {GroqApiError} If API call fails or times out
 */
export async function sendChatMessage(request: ChatRequest): Promise<string> {
  validateApiKey();

  const client = createClient();
  const systemPrompt = request.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  try {
    // Build messages array with system prompt
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...request.messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: MAX_TOKENS,
      messages,
    });

    const text = response.choices[0]?.message?.content;

    if (!text) {
      throw new GroqApiError('No text content in Groq response', 500);
    }

    return text;
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof GroqApiError) {
      throw error;
    }

    // Handle Groq SDK errors
    if (error instanceof Error) {
      console.error('Groq API Error Details:', {
        message: error.message,
        name: error.name,
      });

      // Check for common error patterns
      if (error.message.includes('API key') || error.message.includes('authentication')) {
        throw new GroqApiError(
          'Invalid API key. Get a free key at https://console.groq.com/keys',
          401
        );
      }

      if (error.message.includes('rate') || error.message.includes('limit')) {
        throw new GroqApiError(
          'Rate limit exceeded. Please try again in a moment.',
          429
        );
      }

      if (error.message.includes('timeout')) {
        throw new GroqApiError(
          'Request timed out. Please try again.',
          408,
          true
        );
      }

      throw new GroqApiError(
        `Groq error: ${error.message}`,
        500
      );
    }

    console.error('Unexpected error in Groq service:', error);
    throw new GroqApiError(
      'An unexpected error occurred',
      500
    );
  }
}
