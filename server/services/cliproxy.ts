/**
 * CLIProxyAPI Service
 * Handles communication with a self-hosted CLIProxyAPI instance
 * via its OpenAI-compatible /v1/chat/completions endpoint
 */
import { upstreamAccessHeaders } from '../config.js';

/** Default model - fast enough for conversational practice */
const DEFAULT_MODEL = 'claude-haiku-5-5';

/** Request timeout in milliseconds (proxy runs behind a tunnel, allow extra latency) */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Maximum tokens in response
 * Higher than the other providers because reasoning tokens count toward this limit;
 * at 1024, thinking models can use the whole budget and return empty content
 */
const MAX_TOKENS = 4096;

/**
 * Reasoning effort for thinking models
 * "low" keeps replies fast; "none" is rejected by some models (e.g. claude-sonnet-5-5)
 */
const REASONING_EFFORT = 'low';

/** Timeout for listing models in milliseconds */
const MODELS_TIMEOUT_MS = 5000;

/**
 * Model ID patterns that must never be used
 * - opus / fable: too expensive for casual English practice
 * - image / codex-auto-review: not conversational chat models
 */
const BLOCKED_MODEL_PATTERNS = [/opus/i, /fable/i, /image/i, /^codex-auto-review$/i];

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
/** Text or image part of a multimodal message (OpenAI format) */
export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: MessageRole;
  /** Plain text, or text and image parts for vision-capable models */
  content: string | ContentPart[];
}

/**
 * Request payload for CLIProxyAPI chat
 */
export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  /** Model ID override; falls back to CLIPROXY_MODEL or DEFAULT_MODEL */
  model?: string;
  /** Overrides the default request timeout, for long outputs like essay scoring */
  timeoutMs?: number;
  /** Output limit; scoring in Vietnamese needs more than the default */
  maxTokens?: number;
}

/**
 * Shape of an OpenAI-compatible chat completion response
 */
interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Shape of an OpenAI-compatible model list response
 */
interface ModelListResponse {
  data?: Array<{ id?: string }>;
}

/**
 * Custom error for CLIProxyAPI failures
 */
export class CliProxyApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly isTimeout: boolean = false,
    /** Proxy could not be reached or failed upstream - safe to fall back to another provider */
    public readonly isUnavailable: boolean = false
  ) {
    super(message);
    this.name = 'CliProxyApiError';
  }
}

/**
 * Checks whether CLIProxyAPI is configured via environment variables
 * @returns True if both base URL and API key are set
 */
export function isCliProxyConfigured(): boolean {
  return Boolean(process.env.CLIPROXY_BASE_URL && process.env.CLIPROXY_API_KEY);
}

/**
 * Checks whether a model may be used by this tool
 * @param modelId - Model ID to check
 * @returns True if the model is not blocked
 */
export function isModelAllowed(modelId: string): boolean {
  return !BLOCKED_MODEL_PATTERNS.some((pattern) => pattern.test(modelId));
}

/**
 * Returns the default model, ensuring it is not a blocked model
 * @returns Default model ID
 */
export function getDefaultModel(): string {
  const configuredModel = process.env.CLIPROXY_MODEL;

  if (configuredModel && isModelAllowed(configuredModel)) {
    return configuredModel;
  }

  return DEFAULT_MODEL;
}

/**
 * Builds a CLIProxyAPI URL from the configured base URL
 * @param path - Endpoint path, e.g. /v1/chat/completions
 * @returns Full endpoint URL
 */
function buildEndpointUrl(path: string): string {
  const baseUrl = process.env.CLIPROXY_BASE_URL!.replace(/\/+$/, '');
  return `${baseUrl}${path}`;
}

/**
 * Lists the models available on CLIProxyAPI, excluding blocked models
 *
 * @returns Promise resolving to sorted allowed model IDs
 * @throws {CliProxyApiError} If the proxy is not configured or unreachable
 */
export async function listAllowedModels(): Promise<string[]> {
  if (!isCliProxyConfigured()) {
    throw new CliProxyApiError('CLIProxyAPI is not configured', 500, false, true);
  }

  try {
    const response = await fetch(buildEndpointUrl('/v1/models'), {
      headers: { Authorization: `Bearer ${process.env.CLIPROXY_API_KEY}`, ...upstreamAccessHeaders() },
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new CliProxyApiError('Failed to list models', 502, false, true);
    }

    const data = (await response.json()) as ModelListResponse;
    const modelIds = (data.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => typeof id === 'string' && isModelAllowed(id));

    return [...new Set(modelIds)].sort();
  } catch (error) {
    if (error instanceof CliProxyApiError) {
      throw error;
    }

    console.error('CLIProxyAPI unreachable:', error);
    throw new CliProxyApiError('AI proxy is unreachable', 503, false, true);
  }
}

/**
 * Sends a chat message to CLIProxyAPI and returns the response
 *
 * @param request - Chat request containing messages and optional system prompt
 * @returns Promise resolving to the assistant's response content
 * @throws {CliProxyApiError} If API call fails or times out
 */
export async function sendChatMessage(request: ChatRequest): Promise<string> {
  if (!isCliProxyConfigured()) {
    throw new CliProxyApiError('CLIProxyAPI is not configured', 500, false, true);
  }

  const model = request.model ?? getDefaultModel();

  if (!isModelAllowed(model)) {
    throw new CliProxyApiError(`Model "${model}" is not allowed`, 400);
  }

  const systemPrompt = request.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  let response: Response;

  try {
    response = await fetch(buildEndpointUrl('/v1/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CLIPROXY_API_KEY}`,
        ...upstreamAccessHeaders(),
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? MAX_TOKENS,
        reasoning_effort: REASONING_EFFORT,
        messages: [
          { role: 'system', content: systemPrompt },
          ...request.messages,
        ],
      }),
      signal: AbortSignal.timeout(request.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Timeout from AbortSignal.timeout
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new CliProxyApiError('Request timed out. Please try again.', 408, true, true);
    }

    // Network failure - tunnel down or local machine offline
    console.error('CLIProxyAPI unreachable:', error);
    throw new CliProxyApiError('AI proxy is unreachable', 503, false, true);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error('CLIProxyAPI Error Details:', {
      status: response.status,
      body: errorBody.slice(0, 500),
    });

    if (response.status === 401 || response.status === 403) {
      throw new CliProxyApiError('Authentication failed. Check CLIPROXY_API_KEY.', 401);
    }

    if (response.status === 429) {
      throw new CliProxyApiError(
        'Service is temporarily busy. Please try again in a moment.',
        429,
        false,
        true
      );
    }

    // 5xx from proxy or tunnel (e.g. Cloudflare 502/530 when origin is offline)
    const isUnavailable = response.status >= 500;
    throw new CliProxyApiError(
      'Failed to get response from AI service',
      isUnavailable ? 502 : response.status,
      false,
      isUnavailable
    );
  }

  const data = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new CliProxyApiError('No text content in AI response', 500);
  }

  return text;
}
