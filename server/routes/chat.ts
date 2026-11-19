/**
 * Chat Routes
 * Handles chat message endpoints for AI communication
 * Uses CLIProxyAPI when configured, falling back to Groq when the proxy is unavailable
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { GroqApiError, type ChatMessage } from '../services/groq.js';
import { isCliProxyConfigured, listAllowedModels, getDefaultModel, CliProxyApiError } from '../services/cliproxy.js';
import { runAI, sendWithFallback } from '../services/ai.js';
import type { ChatMessage as RichMessage } from '../services/cliproxy.js';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { assertQuota, effectiveModels, recordUsage, resolveModel } from '../services/aiAccess.js';
import { getAiMode, keyFor, providerOf } from '../services/aiProvider.js';
import { config } from '../config.js';
import { chatContextSchema, chatSystemPrompt, REVIEW_MATERIAL_MAX, splitSuggestions, wantsSuggestions } from '../content/chatPrompts.js';
import { inputTokens } from '../billing/pricing.js';

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

/** Pictures arrive shrunk by the browser as data URLs; the request body is limited to 1 MB in all */
const MAX_REVIEW_IMAGES = 2;
const reviewImage = z.string().max(400_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
const reviewBodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS), images: z.array(reviewImage).max(MAX_REVIEW_IMAGES).optional() }))
    .min(1)
    .max(MAX_MESSAGES)
    .refine((messages) => messages.reduce((sum, m) => sum + m.content.length, 0) <= MAX_TOTAL_CHARS, 'The conversation is too long')
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message must come from the user'),
  /** The text of the part of the answer review the learner asks about */
  material: z.string().trim().min(20).max(REVIEW_MATERIAL_MAX),
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
    const user = currentUser(req);

    // Official APIs: the models the user may use whose provider has a key
    if ((await getAiMode()) === 'official') {
      const candidates = (await effectiveModels(user)) ?? config.LEARNER_MODELS;
      const models: string[] = [];
      for (const model of candidates) {
        const provider = providerOf(model);
        if (provider && (await keyFor(provider))) models.push(model);
      }
      res.json({ models, defaultModel: models[0] ?? null });
      return;
    }

    if (!isCliProxyConfigured()) {
      res.json({ models: [], defaultModel: null });
      return;
    }

    try {
      const proxyModels = await listAllowedModels();
      const assigned = await effectiveModels(user);
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
   * @returns {Object} { message: string, suggestions?: string[] } - Claude's response; conversation and scenario
   *   replies also carry up to three sample answers to the tutor's question
   * @throws {400} If request validation fails
   * @throws {408} If request times out
   * @throws {500} If internal error occurs
   */
  /**
   * POST /review - Ask the AI to explain a part of an exercise's answer review (pictures may be attached)
   *
   * @route POST /api/chat/review
   * @body {Object} request - messages (the last from the user, with optional pictures) and the text of that part
   * @returns {Object} { message: string }
   */
  router.post('/review', limitAiRequests, async (req: Request, res: Response): Promise<void> => {
    const body = reviewBodySchema.parse(req.body);
    const user = currentUser(req);
    // Pictures count only on the newest message that has them, which keeps requests small
    const newestWithPictures = body.messages.reduce((found, m, index) => (m.images?.length ? index : found), -1);
    const messages: RichMessage[] = body.messages.map(({ role, content, images }, index): RichMessage => {
      if (role === 'user' && index === newestWithPictures && images?.length) {
        return { role, content: [{ type: 'text', text: content }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))] };
      }
      return { role, content: images?.length ? `${content} [picture sent earlier]` : content };
    });
    const reply = await runAI(user, {
      feature: 'review-chat',
      model: body.model,
      timeoutMs: 120_000,
      system: chatSystemPrompt({ mode: 'review', material: body.material }, user.uiLocale),
      messages,
    });
    if (!reply.trim()) throw new HttpError(502, 'The AI returned no answer. Please try again.', 'ai_unavailable');
    res.json({ message: reply.trim() });
  });

  router.post('/', limitAiRequests, async (req: Request, res: Response): Promise<void> => {
    const body = chatBodySchema.parse(req.body);

    // Enforce the user's model allowlist (opus/fable are always blocked) and daily quota
    const user = currentUser(req);
    const model = await resolveModel(user, body.model);
    await assertQuota(user, CHAT_FEATURE);
    const messages: ChatMessage[] = body.messages;
    const systemPrompt = chatSystemPrompt(body.context, user.uiLocale);

    try {
      const response = await sendChatMessage({
        messages,
        systemPrompt,
        model,
      });

      await recordUsage(user, CHAT_FEATURE, { model, inputTokens: inputTokens(systemPrompt, messages), reply: response });
      // Sample answers come back separately so they are neither shown in the bubble nor read aloud
      if (wantsSuggestions(body.context)) {
        res.json(splitSuggestions(response));
        return;
      }
      res.json({ message: response });
    } catch (error) {
      // Our own errors (no key for the model, plan limits) carry their status and code
      if (error instanceof HttpError) throw error;

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
