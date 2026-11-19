/**
 * Speech engine: one Gemini call per clip, through the same AI source as chat
 * (CLIProxyAPI, or the official Gemini API when an admin switched to it).
 * Models are fixed here on purpose: learners and admins do not choose them.
 */
import { HttpError } from '../http/errors.js';
import { CliProxyApiError, isCliProxyConfigured, sendChatMessage, type ChatTarget } from '../services/cliproxy.js';
import { getAiMode, officialTarget } from '../services/aiProvider.js';
import { speechSystemPrompt, speechUserText } from './prompt.js';
import { rawAssessmentSchema, type AssessInput, type RawAssessment } from './types.js';

/**
 * Tried in order. The 3.8 models catch far more pronunciation errors but the proxy often runs out of
 * capacity for them; gemini-3-flash is fast and always there but rarely hears pronunciation errors
 * (see docs/plans/speaking-audio/reports/00-spike.md).
 */
export const SPEECH_MODELS: Record<'assess' | 'transcribe', readonly string[]> = {
  assess: ['gemini-3.8-flash-high', 'gemini-3.8-flash-tiered', 'gemini-3-flash'],
  transcribe: ['gemini-3-flash'],
};
/** The 3.8 names are proxy aliases; the official Gemini API is only asked for a model it knows */
const OFFICIAL_MODELS: readonly string[] = ['gemini-3-flash'];
/** Answers from this model are flagged: its pronunciation checking is weak */
const BASIC_MODEL = 'gemini-3-flash';
/** A model that ran out of capacity is skipped for this long */
export const COOLDOWN_MS = 60_000;

const coolingUntil = new Map<string, number>();

/** Forget cooldowns (tests) */
export function resetSpeechCooldowns(): void {
  coolingUntil.clear();
}

export interface EngineResult {
  model: string;
  accuracy: 'full' | 'basic';
  raw: RawAssessment;
  /** The model's reply text, for usage accounting */
  reply: string;
}

/** The JSON object in a reply, tolerating markdown fences or a sentence around it */
export function parseReply(reply: string): RawAssessment | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = rawAssessmentSchema.safeParse(JSON.parse(reply.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Capacity, rate limit, missing model or upstream down: skip the model for a while.
 * Not a timeout: one slow long clip should not disable the model for everyone.
 */
const needsCooldown = (error: CliProxyApiError): boolean =>
  !error.isTimeout && (error.isUnavailable || error.statusCode === 404 || error.statusCode === 429);

/** Long clips need longer to process and more output (word timings) */
/** Capped below the ~100 s a Cloudflare tunnel allows */
const timeoutFor = (durationSec: number): number => Math.min(90_000, Math.round(30_000 + durationSec * 400));
const maxTokensFor = (input: AssessInput): number => (input.mode === 'answer' ? 16_000 : 4096);

async function targetFor(model: string, official: boolean): Promise<ChatTarget | undefined> {
  if (official) return officialTarget(model);
  if (!isCliProxyConfigured()) throw new HttpError(503, 'Speech checking is unavailable right now.', 'speech_unavailable');
  return undefined;
}

/**
 * Assesses one WAV clip
 * @throws HttpError 503 speech_unavailable when no model could answer
 */
export async function runSpeechEngine(input: AssessInput, wav: Buffer): Promise<EngineResult> {
  const official = (await getAiMode()) === 'official';
  const models = official ? OFFICIAL_MODELS : SPEECH_MODELS[input.mode === 'transcribe' ? 'transcribe' : 'assess'];
  const now = Date.now();
  const ready = models.filter((m) => (coolingUntil.get(m) ?? 0) <= now);
  // When every model is cooling down, still try the last (most available) one
  const queue = ready.length ? ready : models.slice(-1);
  const audio = wav.toString('base64');

  for (const model of queue) {
    let target: ChatTarget | undefined;
    try {
      target = await targetFor(model, official);
    } catch (error) {
      // Official mode without a Gemini key: no model can answer
      if (error instanceof HttpError) throw new HttpError(503, 'Speech checking is unavailable right now.', 'speech_unavailable');
      throw error;
    }

    try {
      const reply = await sendChatMessage(
        {
          model,
          systemPrompt: speechSystemPrompt(input.mode),
          messages: [{ role: 'user', content: [{ type: 'text', text: speechUserText(input) }, { type: 'input_audio', input_audio: { data: audio, format: 'wav' } }] }],
          timeoutMs: timeoutFor(input.durationSec),
          maxTokens: maxTokensFor(input),
        },
        target
      );
      const raw = parseReply(reply);
      if (!raw) {
        console.warn(`Speech model ${model} returned an unreadable reply (${reply.length} chars)`);
        continue;
      }
      return { model, accuracy: input.mode !== 'transcribe' && model === BASIC_MODEL ? 'basic' : 'full', raw, reply };
    } catch (error) {
      // Any provider error (incl. a model rejecting audio) moves on to the next model
      if (!(error instanceof CliProxyApiError)) throw error;
      console.warn(`Speech model ${model} failed (${error.statusCode}): ${error.message}`);
      if (needsCooldown(error)) coolingUntil.set(model, Date.now() + COOLDOWN_MS);
    }
  }
  throw new HttpError(503, 'Speech checking is unavailable right now.', 'speech_unavailable');
}
