/**
 * API service for Claude AI communication
 * All API calls go through /api (backend proxy) - no API keys in frontend
 */

import type { ChatMessage, ChatRequest, ChatResponse } from '@/types/api';

/** Base URL for API endpoints */
const API_BASE = '/api';

/** Default timeout for API requests (5 seconds per NFR-003) */
const REQUEST_TIMEOUT_MS = 5000;

/** HTTP status codes for error handling */
const HTTP_STATUS = {
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * Custom error class for API-related errors
 * Provides additional context about the error type
 */
export class ApiError extends Error {
  /** HTTP status code if available */
  public readonly statusCode?: number;
  /** Whether this is a network connectivity error */
  public readonly isNetworkError: boolean;
  /** Whether the request can be retried */
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    statusCode?: number,
    isNetworkError: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isNetworkError = isNetworkError;
    // Rate limits and network errors are retryable
    this.isRetryable = isNetworkError || statusCode === HTTP_STATUS.TOO_MANY_REQUESTS;
  }
}

/**
 * Gets user-friendly error message based on HTTP status code
 *
 * @param statusCode - HTTP status code
 * @returns User-friendly error message
 */
function getStatusErrorMessage(statusCode: number): string {
  if (statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    return 'Server error. Please try again later.';
  }
  return 'Request failed. Please try again.';
}

/**
 * Sends a message to the Claude AI and receives a response
 *
 * @param messages - Array of conversation messages
 * @param systemPrompt - Optional custom system prompt to override default
 * @returns Promise resolving to the assistant's response message
 * @throws ApiError if the request fails or times out
 *
 * @example
 * ```ts
 * try {
 *   const response = await sendMessage([
 *     { role: 'user', content: 'Hello!' }
 *   ]);
 *   console.log(response); // "Hello! How can I help you today?"
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     if (error.isNetworkError) {
 *       showOfflineMessage();
 *     } else if (error.isRetryable) {
 *       scheduleRetry();
 *     }
 *   }
 * }
 * ```
 */
export async function sendMessage(
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const requestBody: ChatRequest = {
      messages,
      ...(systemPrompt && { systemPrompt }),
    };

    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Try to parse error response
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || getStatusErrorMessage(response.status);
      throw new ApiError(errorMessage, response.status);
    }

    const data: ChatResponse = await response.json();
    return data.message;
  } catch (error) {
    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', undefined, false);
    }

    // Handle network errors (TypeError from fetch)
    if (error instanceof TypeError) {
      throw new ApiError(
        'Network error. Please check your connection.',
        undefined,
        true
      );
    }

    // Handle unknown errors
    throw new ApiError('An unexpected error occurred. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}
