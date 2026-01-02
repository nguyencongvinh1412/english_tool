/**
 * Gemini AI Service
 * Handles communication with Google Gemini API
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

/** Gemini model to use for chat completions */
const GEMINI_MODEL = 'gemini-2.0-flash';

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
 * Request payload for Gemini chat
 */
export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
}

/**
 * Custom error for Gemini API failures
 */
export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly isTimeout: boolean = false
  ) {
    super(message);
    this.name = 'GeminiApiError';
  }
}

/**
 * Validates that the API key is configured
 * @throws {GeminiApiError} If API key is missing
 */
function validateApiKey(): void {
  if (!process.env.GEMINI_API_KEY) {
    throw new GeminiApiError(
      'Gemini API key is not configured. Get one free at https://aistudio.google.com/apikey',
      500,
      false
    );
  }
}

/**
 * Creates a Gemini client instance
 * @returns Configured Gemini GenerativeModel
 */
function createClient() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      maxOutputTokens: MAX_TOKENS,
    },
  });
}

/**
 * Builds a prompt with system context and conversation history
 * @param messages - Array of chat messages
 * @param systemPrompt - System instructions
 * @returns Combined prompt string
 */
function buildPrompt(messages: ChatMessage[], systemPrompt: string): string {
  let prompt = `Instructions: ${systemPrompt}\n\n`;

  // Add conversation history
  if (messages.length > 1) {
    prompt += 'Previous conversation:\n';
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      prompt += `${role}: ${msg.content}\n`;
    }
    prompt += '\n';
  }

  // Add current user message
  const lastMessage = messages[messages.length - 1];
  prompt += `User: ${lastMessage.content}\n\nAssistant:`;

  return prompt;
}

/**
 * Sends a chat message to Gemini API and returns the response
 *
 * @param request - Chat request containing messages and optional system prompt
 * @returns Promise resolving to the assistant's response content
 * @throws {GeminiApiError} If API call fails or times out
 *
 * @example
 * const response = await sendChatMessage({
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * console.log(response); // "Hello! How can I help you practice English today?"
 */
export async function sendChatMessage(request: ChatRequest): Promise<string> {
  validateApiKey();

  const model = createClient();
  const systemPrompt = request.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  try {
    // Get the last user message
    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new GeminiApiError('Last message must be from user', 400);
    }

    // Build prompt with context
    const prompt = buildPrompt(request.messages, systemPrompt);

    // Generate content
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    if (!text) {
      throw new GeminiApiError('No text content in Gemini response', 500);
    }

    return text;
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof GeminiApiError) {
      throw error;
    }

    // Handle Gemini SDK errors
    if (error instanceof Error) {
      // Log full error for debugging
      console.error('Gemini API Error Details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });

      // Check for common error patterns
      if (error.message.includes('API_KEY_INVALID') || error.message.includes('API key not valid')) {
        throw new GeminiApiError(
          'Invalid API key. Get a free key at https://aistudio.google.com/apikey',
          401
        );
      }

      if (error.message.includes('PERMISSION_DENIED')) {
        throw new GeminiApiError(
          'Permission denied. Make sure Gemini API is enabled for your project.',
          403
        );
      }

      if (error.message.includes('quota') || error.message.includes('rate') || error.message.includes('RESOURCE_EXHAUSTED')) {
        throw new GeminiApiError(
          'Rate limit exceeded. Please try again in a moment.',
          429
        );
      }

      if (error.message.includes('timeout')) {
        throw new GeminiApiError(
          'Request timed out. Please try again.',
          408,
          true
        );
      }

      // Return raw error message for debugging
      throw new GeminiApiError(
        `Gemini error: ${error.message}`,
        500
      );
    }

    // Generic error handling
    console.error('Unexpected error in Gemini service:', error);
    throw new GeminiApiError(
      'An unexpected error occurred',
      500
    );
  }
}
