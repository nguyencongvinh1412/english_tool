/**
 * Text-to-Speech
 * Synthesizes speech with a self-hosted Kokoro server (OpenAI-compatible /v1/audio/speech)
 * and caches every clip on disk, so each sentence is generated only once.
 */
import { createHash } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config, upstreamAccessHeaders } from '../config.js';
import { HttpError } from '../http/errors.js';
import { bucketHas, bucketPut, isBucket } from './storage.js';

/** Kokoro voices offered to the app: American and British English, and Japanese; female and male */
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
  'jf_alpha',
  'jf_gongitsune',
  'jf_nezumi',
  'jf_tebukuro',
  'jm_kumo',
] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

/** Headers for the voice server: tunnel credentials and/or a bearer token */
const ttsHeaders = (): Record<string, string> => ({
  ...upstreamAccessHeaders(),
  ...(config.TTS_API_TOKEN ? { Authorization: `Bearer ${config.TTS_API_TOKEN}` } : {}),
});

/** Bucket key of a clip (bucket driver) */
export const clipKey = (name: string): string => `tts/${name}`;

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
 * Asks Kokoro for one clip
 */
async function synthesize(text: string, voice: TtsVoice, speed: number): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(`${config.TTS_BASE_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ttsHeaders() },
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
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Writes a clip atomically to the disk cache
 */
async function writeToDisk(file: string, audio: Buffer): Promise<void> {
  await mkdir(config.TTS_CACHE_DIR, { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, audio);
  await rename(temp, file);
}

/** Clips known to be in the bucket, so repeat requests skip the existence check */
const knownInBucket = new Set<string>();
const MAX_KNOWN = 20_000;

/**
 * Whether a clip is already cached (in the bucket, or on disk for local development)
 */
async function isCached(name: string): Promise<boolean> {
  if (!isBucket()) return exists(clipPath(name));
  if (knownInBucket.has(name)) return true;
  const found = await bucketHas(clipKey(name));
  if (found) {
    if (knownInBucket.size >= MAX_KNOWN) knownInBucket.clear();
    knownInBucket.add(name);
  }
  return found;
}

/**
 * Returns the cache file name for a clip, generating it first if needed
 */
export async function ensureClip(text: string, voice: TtsVoice, speed: number): Promise<string> {
  const name = clipName(text, voice, speed);
  if (await isCached(name)) return name;

  let job = inFlight.get(name);
  if (!job) {
    job = withSlot(async () => {
      const audio = await synthesize(text, voice, speed);
      if (isBucket()) {
        await bucketPut(clipKey(name), audio, 'audio/mpeg');
        knownInBucket.add(name);
      } else {
        await writeToDisk(clipPath(name), audio);
      }
    }).finally(() => inFlight.delete(name));
    inFlight.set(name, job);
  }
  await job;
  return name;
}

/** How long a wake-up attempt may take: a sleeping Space needs about a minute to start */
const WAKE_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 3_000;

export type TtsState = 'available' | 'waking' | 'unavailable';

let state: { value: TtsState; at: number } | null = null;
let waking: Promise<void> | null = null;

/**
 * Starts waking the voice server in the background (a sleeping Hugging Face Space starts on the first request)
 */
function wake(): void {
  if (waking) return;
  waking = fetch(`${config.TTS_BASE_URL}/v1/audio/voices`, { headers: ttsHeaders(), signal: AbortSignal.timeout(WAKE_TIMEOUT_MS) })
    .then((response) => {
      state = { value: response.ok ? 'available' : 'unavailable', at: Date.now() };
    })
    .catch(() => {
      state = { value: 'unavailable', at: Date.now() };
    })
    .finally(() => {
      waking = null;
    });
}

/**
 * State of the voice server. A quick probe decides; when it does not answer, a background wake-up starts and the
 * state is "waking" until it finishes, so callers can use browser voices meanwhile and switch back later.
 */
export async function ttsStatus(): Promise<TtsState> {
  if (!config.TTS_BASE_URL) return 'unavailable';
  if (waking) return 'waking';
  if (state && Date.now() - state.at < STATUS_CACHE_MS) return state.value;

  try {
    const response = await fetch(`${config.TTS_BASE_URL}/v1/audio/voices`, { headers: ttsHeaders(), signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    state = { value: response.ok ? 'available' : 'unavailable', at: Date.now() };
    return state.value;
  } catch {
    wake();
    return 'waking';
  }
}

/**
 * Whether the voice server answers right now
 */
export async function ttsAvailable(): Promise<boolean> {
  return (await ttsStatus()) === 'available';
}
