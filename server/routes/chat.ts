/**
 * Chat Routes
 * Handles chat message endpoints for AI communication
 * Uses CLIProxyAPI when configured, falling back to Groq when the proxy is unavailable
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { GroqApiError, type ChatMessage } from '../services/groq.js';
import { isCliProxyConfigured, listAllowedModels, getDefaultModel, CliProxyApiError } from '../services/cliproxy.js';
import { sendWithFallback } from '../services/ai.js';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { assertQuota, getAllowedModels, recordUsage, resolveModel } from '../services/aiAccess.js';
import { chatContextSchema, chatSystemPrompt } from '../content/chatPrompts.js';

/** Usage feature key for free-form chat requests */
const CHAT_FEATURE = 'chat';

/** Sends via CLIProxyAPI with Groq fallback (shared with server-side AI features) */
const sendChatMessage = sendWithFallback;

/** Messages kept from a conversation; the client sends only the most recent ones */
const MAX_MESSAGES = 30;
/** Characters per message and per request, so one request cannot carry a huge document */
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOTAL_CHARS = 20000;

const chatBodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) }))
    .min(1)
    .max(MAX_MESSAGES)
    .refine((messages) => messages.reduce((sum, m) => sum + m.content.length, 0) <= MAX_TOTAL_CHARS, 'The conversation is too long')
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message must come from the user'),
  /** Which activity the chat belongs to; the server builds the system prompt from it */
  context: chatContextSchema,
  model: z.string().max(100).optional(),
});

/**
 * Creates the chat router with POST endpoint
 * @returns Express Router with chat routes configured
 */
export function createChatRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  /**
   * GET /models - List models the signed-in user may choose from
   *
   * @route GET /api/chat/models
   * @returns {Object} { models: string[], defaultModel: string | null }
   *   Only models the user is assigned AND the proxy currently offers.
   *   Empty list when CLIProxyAPI is not configured or unreachable (Groq is used)
   */
  router.get('/models', async (req: Request, res: Response): Promise<void> => {
    if (!isCliProxyConfigured()) {
      res.json({ models: [], defaultModel: null });
      return;
    }

    const user = currentUser(req);

    try {
      const proxyModels = await listAllowedModels();
      const assigned = getAllowedModels(user);
      const models = assigned === null ? proxyModels : assigned.filter((m) => proxyModels.includes(m));
      const preferred = assigned === null ? getDefaultModel() : models[0];

      res.json({ models, defaultModel: models.includes(preferred) ? preferred : (models[0] ?? null) });
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
   * @body {Array} request.messages - Recent chat messages (the last one from the user)
   * @body {Object} request.context - Activity: conversation (topic), scenario (roles), pronunciation or dictation
   * @body {string} [request.model] - Optional CLIProxyAPI model ID
   * @returns {Object} { message: string } - Claude's response
   * @throws {400} If request validation fails
   * @throws {408} If request times out
   * @throws {500} If internal error occurs
   */
  router.post('/', limitAiRequests, async (req: Request, res: Response): Promise<void> => {
    const body = chatBodySchema.parse(req.body);

    // Enforce the user's model allowlist (opus/fable are always blocked) and daily quota
    const user = currentUser(req);
    const model = resolveModel(user, body.model);
    await assertQuota(user);
    const messages: ChatMessage[] = body.messages;
    const systemPrompt = chatSystemPrompt(body.context, user.uiLocale);

    try {
      const response = await sendChatMessage({
        messages,
        systemPrompt,
        model,
      });

      await recordUsage(user, CHAT_FEATURE);
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
