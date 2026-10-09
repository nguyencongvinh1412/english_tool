/**
 * Chat Routes
 * Handles chat message endpoints for AI communication
 * Uses CLIProxyAPI when configured, falling back to Groq when the proxy is unavailable
 */
import { Router, Request, Response } from 'express';
import {
  sendChatMessage as sendGroqMessage,
  GroqApiError,
  type ChatMessage,
} from '../services/groq.js';
import {
  sendChatMessage as sendCliProxyMessage,
  isCliProxyConfigured,
  isModelAllowed,
  getDefaultModel,
  listAllowedModels,
  CliProxyApiError,
  type ChatRequest,
} from '../services/cliproxy.js';

/**
 * Sends a chat message via CLIProxyAPI, falling back to Groq if the proxy is unavailable
 *
 * @param request - Chat request containing messages and optional system prompt
 * @returns Promise resolving to the assistant's response content
 */
async function sendChatMessage(request: ChatRequest): Promise<string> {
  if (!isCliProxyConfigured()) {
    return sendGroqMessage(request);
  }

  try {
    return await sendCliProxyMessage(request);
  } catch (error) {
    // Only fall back when the proxy itself is down (tunnel offline, machine asleep, upstream 5xx)
    if (
      !(error instanceof CliProxyApiError) ||
      !error.isUnavailable ||
      !process.env.GROQ_API_KEY
    ) {
      throw error;
    }

    console.warn(`CLIProxyAPI unavailable (${error.message}), falling back to Groq`);
    return sendGroqMessage(request);
  }
}

/** Minimum messages required in request */
const MIN_MESSAGES_REQUIRED = 1;

/** Maximum messages allowed in single request */
const MAX_MESSAGES_ALLOWED = 100;

/** Maximum content length per message (characters) */
const MAX_CONTENT_LENGTH = 10000;

/**
 * Request body type for chat endpoint
 */
interface ChatRequestBody {
  messages?: unknown;
  systemPrompt?: unknown;
  model?: unknown;
}

/**
 * Validates that messages array is properly formatted
 *
 * @param messages - Messages to validate
 * @returns Object with isValid flag and optional error message
 */
function validateMessages(
  messages: unknown
): { isValid: boolean; error?: string; validatedMessages?: ChatMessage[] } {
  // Check if messages exists and is an array
  if (!messages) {
    return { isValid: false, error: 'Messages array is required' };
  }

  if (!Array.isArray(messages)) {
    return { isValid: false, error: 'Messages must be an array' };
  }

  // Check minimum length
  if (messages.length < MIN_MESSAGES_REQUIRED) {
    return { isValid: false, error: 'At least one message is required' };
  }

  // Check maximum length
  if (messages.length > MAX_MESSAGES_ALLOWED) {
    return {
      isValid: false,
      error: `Maximum ${MAX_MESSAGES_ALLOWED} messages allowed`,
    };
  }

  // Validate each message structure
  const validatedMessages: ChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Check message is an object
    if (typeof msg !== 'object' || msg === null) {
      return { isValid: false, error: `Message at index ${i} is invalid` };
    }

    const messageObj = msg as Record<string, unknown>;

    // Validate role
    if (messageObj.role !== 'user' && messageObj.role !== 'assistant') {
      return {
        isValid: false,
        error: `Message at index ${i} has invalid role. Must be 'user' or 'assistant'`,
      };
    }

    // Validate content
    if (typeof messageObj.content !== 'string') {
      return {
        isValid: false,
        error: `Message at index ${i} must have string content`,
      };
    }

    // Validate content length
    if (messageObj.content.length === 0) {
      return {
        isValid: false,
        error: `Message at index ${i} cannot have empty content`,
      };
    }

    if (messageObj.content.length > MAX_CONTENT_LENGTH) {
      return {
        isValid: false,
        error: `Message at index ${i} exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`,
      };
    }

    validatedMessages.push({
      role: messageObj.role,
      content: messageObj.content,
    });
  }

  return { isValid: true, validatedMessages };
}

/**
 * Creates the chat router with POST endpoint
 * @returns Express Router with chat routes configured
 */
export function createChatRouter(): Router {
  const router = Router();

  /**
   * GET /models - List models the client may choose from
   *
   * @route GET /api/chat/models
   * @returns {Object} { models: string[], defaultModel: string | null }
   *   Empty list when CLIProxyAPI is not configured or unreachable (Groq is used)
   */
  router.get('/models', async (_req: Request, res: Response): Promise<void> => {
    if (!isCliProxyConfigured()) {
      res.json({ models: [], defaultModel: null });
      return;
    }

    try {
      const models = await listAllowedModels();
      res.json({ models, defaultModel: getDefaultModel() });
    } catch (error) {
      console.error('Failed to list models:', error);
      res.json({ models: [], defaultModel: null });
    }
  });

  /**
   * POST / - Send chat message to Claude
   *
   * @route POST /api/chat
   * @body {Object} request - Chat request
   * @body {Array} request.messages - Array of chat messages
   * @body {string} [request.systemPrompt] - Optional system prompt override
   * @body {string} [request.model] - Optional CLIProxyAPI model ID
   * @returns {Object} { message: string } - Claude's response
   * @throws {400} If request validation fails
   * @throws {408} If request times out
   * @throws {500} If internal error occurs
   */
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const body = req.body as ChatRequestBody;

    // Validate messages
    const validation = validateMessages(body.messages);

    if (!validation.isValid || !validation.validatedMessages) {
      res.status(400).json({
        error: validation.error,
        statusCode: 400,
      });
      return;
    }

    // Validate optional systemPrompt if provided
    let systemPrompt: string | undefined;

    if (body.systemPrompt !== undefined) {
      if (typeof body.systemPrompt !== 'string') {
        res.status(400).json({
          error: 'System prompt must be a string',
          statusCode: 400,
        });
        return;
      }
      systemPrompt = body.systemPrompt;
    }

    // Validate optional model if provided (opus/fable and non-chat models are blocked)
    let model: string | undefined;

    if (body.model !== undefined) {
      if (typeof body.model !== 'string' || !isModelAllowed(body.model)) {
        res.status(400).json({
          error: 'This model is not allowed',
          statusCode: 400,
        });
        return;
      }
      model = body.model;
    }

    try {
      const response = await sendChatMessage({
        messages: validation.validatedMessages,
        systemPrompt,
        model,
      });

      res.json({ message: response });
    } catch (error) {
      // Handle known AI provider errors
      if (error instanceof GroqApiError || error instanceof CliProxyApiError) {
        // Log the error for debugging but send sanitized message to client
        console.error(`${error.name}: ${error.message}`, {
          statusCode: error.statusCode,
          isTimeout: error.isTimeout,
        });

        res.status(error.statusCode).json({
          error: error.message,
          statusCode: error.statusCode,
        });
        return;
      }

      // Handle unexpected errors - don't expose internal details
      console.error('Unexpected error in chat endpoint:', error);

      res.status(500).json({
        error: 'An unexpected error occurred. Please try again.',
        statusCode: 500,
      });
    }
  });

  return router;
}
