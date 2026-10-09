/**
 * AI Service
 * One entry point for every server-side AI call: model allowlist, daily quota,
 * CLIProxyAPI with Groq fallback, usage accounting, and validated JSON replies
 */
import type { z } from 'zod';
import type { User } from '../db/schema.js';
import { HttpError } from '../http/errors.js';
import { assertQuota, recordUsage, resolveModel } from './aiAccess.js';
import {
  sendChatMessage as sendCliProxyMessage,
  isCliProxyConfigured,
  CliProxyApiError,
  type ChatMessage,
  type ChatRequest,
} from './cliproxy.js';
import { sendChatMessage as sendGroqMessage, GroqApiError } from './groq.js';

/**
 * Sends a chat request via CLIProxyAPI, falling back to Groq if the proxy is unavailable
 */
export async function sendWithFallback(request: ChatRequest): Promise<string> {
  if (!isCliProxyConfigured()) {
    return sendGroqMessage(request);
  }

  try {
    return await sendCliProxyMessage(request);
  } catch (error) {
    // Only fall back when the proxy itself is down (tunnel offline, machine asleep, upstream 5xx)
    if (!(error instanceof CliProxyApiError) || !error.isUnavailable || !process.env.GROQ_API_KEY) {
      throw error;
    }

    console.warn(`CLIProxyAPI unavailable (${error.message}), falling back to Groq`);
    return sendGroqMessage(request);
  }
}

export interface RunAIOptions {
  /** Usage bucket, e.g. "generate", "score-writing" */
  feature: string;
  system: string;
  messages: ChatMessage[];
  /** Model the client asked for; checked against the user's allowlist */
  model?: string;
  /** Request timeout; long outputs (scoring, generation) need more than chat */
  timeoutMs?: number;
}

/** Message CLIProxyAPI errors carry when the model returned no text */
const EMPTY_REPLY_MESSAGE = 'No text content in AI response';

/** Timeouts for long AI outputs */
export const GENERATE_TIMEOUT_MS = 75_000;
export const SCORING_TIMEOUT_MS = 120_000;

/**
 * Runs one AI request on behalf of a user
 * @throws HttpError 403 (model), 429 (quota), or the provider's status on failure
 */
export async function runAI(user: User, options: RunAIOptions): Promise<string> {
  const model = resolveModel(user, options.model);
  await assertQuota(user);

  try {
    const reply = await sendWithFallback({
      messages: options.messages,
      systemPrompt: options.system,
      model,
      timeoutMs: options.timeoutMs,
    });
    await recordUsage(user, options.feature);
    return reply;
  } catch (error) {
    // An empty reply is a bad answer, not an outage: let JSON callers ask again
    if (error instanceof CliProxyApiError && error.message === EMPTY_REPLY_MESSAGE) {
      await recordUsage(user, options.feature);
      return '';
    }
    if (error instanceof CliProxyApiError || error instanceof GroqApiError) {
      throw new HttpError(error.statusCode, error.message, 'ai_unavailable');
    }
    throw error;
  }
}

/**
 * Extracts the outermost JSON object from a reply that may include fences or prose
 */
export function extractJson(reply: string): unknown {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new SyntaxError('No JSON object in reply');
  }
  return JSON.parse(reply.slice(start, end + 1));
}

/**
 * Runs an AI request that must answer with JSON matching a schema.
 * On invalid output the model gets one correction attempt (counted as a second request).
 *
 * @throws HttpError 502 "ai_invalid_output" if both replies are invalid
 */
export async function runAIJson<S extends z.ZodType>(user: User, options: RunAIOptions, schema: S): Promise<z.infer<S>> {
  const firstReply = await runAI(user, options);
  const first = parseWith(schema, firstReply);
  if (first.ok) return first.data;

  const retryReply = await runAI(user, {
    ...options,
    messages: [
      ...options.messages,
      { role: 'assistant', content: firstReply.slice(0, 6000) },
      {
        role: 'user',
        content: `Your reply was not valid: ${first.problem}. Reply again with ONLY the corrected JSON object, no markdown.`,
      },
    ],
  });
  const retry = parseWith(schema, retryReply);
  if (retry.ok) return retry.data;

  console.error('AI returned invalid JSON twice:', retry.problem);
  throw new HttpError(502, 'The AI returned an invalid result. Please try again.', 'ai_invalid_output');
}

/**
 * Parses and validates a reply, describing the first problem for the retry prompt
 */
function parseWith<S extends z.ZodType>(
  schema: S,
  reply: string
): { ok: true; data: z.infer<S> } | { ok: false; problem: string } {
  let json: unknown;
  try {
    json = extractJson(reply);
  } catch {
    return { ok: false, problem: 'it was not a JSON object' };
  }

  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };

  const issue = result.error.issues[0];
  return { ok: false, problem: `${issue.path.join('.') || 'root'}: ${issue.message}` };
}
