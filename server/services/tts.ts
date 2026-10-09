/**
 * Text-to-Speech
 * Synthesizes speech with a self-hosted Kokoro server (OpenAI-compatible /v1/audio/speech)
 * and caches every clip on disk, so each sentence is generated only once.
 */
import { createHash } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { HttpError } from '../http/errors.js';

/** Kokoro voices offered to the app: American and British, female and male */
export const TTS_VOICES = [
  'af_heart',
  'af_bella',
  'af_nicole',
  'bf_emma',
  'bf_alice',
  'am_michael',
  'am_adam',
  'am_puck',
  'bm_george',
  'bm_lewis',
] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

/** Clip file names are a hex hash plus extension */
export const CLIP_FILE_PATTERN = /^[a-f0-9]{64}\.mp3$/;

/** Bumping this invalidates the cache when synthesis settings change */
const CACHE_VERSION = 'kokoro-v1';
const SYNTH_TIMEOUT_MS = 60_000;
const STATUS_CACHE_MS = 30_000;
/** Concurrent syntheses; Kokoro on CPU slows down sharply beyond a couple */
const MAX_CONCURRENT = 2;

let active = 0;
const waiting: (() => void)[] = [];
/** Clips being generated right now, so concurrent requests for the same text share one job */
const inFlight = new Map<string, Promise<void>>();

/**
 * Runs a task once a synthesis slot is free
 */
async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/**
 * Cache file name for a clip
 */
export function clipName(text: string, voice: TtsVoice, speed: number): string {
  return `${createHash('sha256').update(`${CACHE_VERSION}|${voice}|${speed}|${text}`).digest('hex')}.mp3`;
}

/**
 * Absolute path of a cached clip
 */
export function clipPath(name: string): string {
  return path.resolve(config.TTS_CACHE_DIR, name);
}

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

/**
 * Generates one clip with Kokoro and writes it atomically to the cache
 */
async function synthesize(text: string, voice: TtsVoice, speed: number, file: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${config.TTS_BASE_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'kokoro', input: text, voice, speed, response_format: 'mp3' }),
      signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(503, 'The voice service is not available.', 'tts_unavailable');
  }

  if (!response.ok) {
    console.error('TTS error', response.status, (await response.text().catch(() => '')).slice(0, 300));
    throw new HttpError(502, 'Could not generate audio.', 'tts_failed');
  }

  const audio = Buffer.from(await response.arrayBuffer());
  await mkdir(config.TTS_CACHE_DIR, { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, audio);
  await rename(temp, file);
}

/**
 * Returns the cache file name for a clip, generating it first if needed
 */
export async function ensureClip(text: string, voice: TtsVoice, speed: number): Promise<string> {
  const name = clipName(text, voice, speed);
  const file = clipPath(name);
  if (await exists(file)) return name;

  let job = inFlight.get(name);
  if (!job) {
    job = withSlot(() => synthesize(text, voice, speed, file)).finally(() => inFlight.delete(name));
    inFlight.set(name, job);
  }
  await job;
  return name;
}

let statusCache: { available: boolean; at: number } | null = null;

/**
 * Whether the Kokoro server answers, cached briefly
 */
export async function ttsAvailable(): Promise<boolean> {
  if (!config.TTS_BASE_URL) return false;
  if (statusCache && Date.now() - statusCache.at < STATUS_CACHE_MS) return statusCache.available;

  let available = false;
  try {
    const response = await fetch(`${config.TTS_BASE_URL}/v1/audio/voices`, { signal: AbortSignal.timeout(3000) });
    available = response.ok;
  } catch {
    available = false;
  }
  statusCache = { available, at: Date.now() };
  return available;
}
