/**
 * Speech playback
 * Natural voices from the server (Kokoro, cached clips) with a fallback to the
 * browser's Web Speech API when the voice service is unavailable.
 */
import { apiFetch } from './http';

export interface ScriptLine {
  speaker: 'A' | 'B' | 'C';
  text: string;
}

export type Gender = 'female' | 'male';
export type Genders = { A: Gender; B?: Gender; C?: Gender };

/** Pause between lines (ms) */
const LINE_PAUSE_MS = 450;
/** Re-check an unavailable voice service after this long */
const STATUS_RETRY_MS = 60_000;
/** Longest text the server accepts per clip; longer text is split into sentences */
const MAX_CLIP_CHARS = 600;
/** The TTS batch endpoint accepts at most 60 lines per request */
const MAX_BATCH_LINES = 60;

/** Server voices per gender, in the order speakers receive them */
const SERVER_VOICES: Record<Gender, string[]> = {
  female: ['af_heart', 'bf_emma', 'af_bella', 'bf_alice', 'af_nicole'],
  male: ['am_michael', 'bm_george', 'am_adam', 'bm_lewis', 'am_puck'],
};

/**
 * Distinct server voices for each speaker
 */
export function voicesFor(genders: Genders): Record<'A' | 'B' | 'C', string> {
  const used: Record<Gender, number> = { female: 0, male: 0 };
  const take = (gender: Gender) => SERVER_VOICES[gender][used[gender]++ % SERVER_VOICES[gender].length];
  const a = take(genders.A);
  const b = take(genders.B ?? (genders.A === 'female' ? 'male' : 'female'));
  const c = take(genders.C ?? genders.A);
  return { A: a, B: b, C: c };
}

let status: { available: boolean; checkedAt: number; pending?: Promise<boolean> } | null = null;

/**
 * Whether the server voice service is up (cached; rechecked periodically when down)
 */
async function serverVoicesAvailable(): Promise<boolean> {
  if (status?.pending) return status.pending;
  if (status && (status.available || Date.now() - status.checkedAt < STATUS_RETRY_MS)) return status.available;

  const pending = apiFetch<{ available: boolean }>('/api/tts/status')
    .then((r) => r.available)
    .catch(() => false)
    .then((available) => {
      status = { available, checkedAt: Date.now() };
      return available;
    });
  status = { available: false, checkedAt: Date.now(), pending };
  return pending;
}

/**
 * Splits long text into sentences that fit one clip
 */
export function splitSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.flatMap((s) => (s.length <= MAX_CLIP_CHARS ? [s] : (s.match(new RegExp(`.{1,${MAX_CLIP_CHARS}}(\\s|$)`, 'g')) ?? [s])));
}

/**
 * Clip URLs for lines (generated on the server if needed)
 */
async function fetchClips(lines: ScriptLine[], genders: Genders): Promise<string[]> {
  const voices = voicesFor(genders);
  const clips: string[] = [];
  for (let start = 0; start < lines.length; start += MAX_BATCH_LINES) {
    const { clips: batch } = await apiFetch<{ clips: string[] }>('/api/tts/batch', {
      method: 'POST',
      json: { lines: lines.slice(start, start + MAX_BATCH_LINES).map((line) => ({ text: line.text, voice: voices[line.speaker] })) },
    });
    clips.push(...batch);
  }
  return clips;
}

/**
 * Warms the server cache for a script so playback starts instantly later
 */
export function prefetchScript(lines: ScriptLine[], genders: Genders): void {
  if (lines.length === 0) return;
  void serverVoicesAvailable().then((available) => {
    if (available) void fetchClips(lines, genders).catch(() => {});
  });
}

/* ---------- Browser fallback ---------- */

/** Word boundaries matter: "male" must not match "female" */
const FEMALE_HINTS = /\b(female|samantha|karen|moira|tessa|fiona|victoria|zira|aria|jenny|susan|serena)\b|google us english/i;
const MALE_HINTS = /\b(male|daniel|alex|fred|tom|oliver|david|mark|guy|george|arthur)\b/i;

function pickBrowserVoice(gender: Gender, avoid?: SpeechSynthesisVoice): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  const hints = gender === 'female' ? FEMALE_HINTS : MALE_HINTS;
  const opposite = gender === 'female' ? MALE_HINTS : FEMALE_HINTS;
  return voices.find((v) => v !== avoid && hints.test(v.name) && !opposite.test(v.name)) ?? voices.find((v) => v !== avoid) ?? voices[0];
}

/**
 * Speaks lines with the browser voices; resolves when done or stopped
 */
async function playWithBrowser(
  lines: ScriptLine[],
  genders: Genders,
  rate: number,
  onLine: (i: number) => void,
  isStopped: () => boolean
): Promise<void> {
  const synth = window.speechSynthesis;
  if (synth.getVoices().length === 0) {
    await new Promise((resolve) => {
      synth.addEventListener('voiceschanged', resolve, { once: true });
      setTimeout(resolve, 1500);
    });
  }
  const voiceA = pickBrowserVoice(genders.A);
  const voiceB = pickBrowserVoice(genders.B ?? 'male', voiceA);

  for (let i = 0; i < lines.length && !isStopped(); i++) {
    onLine(i);
    const utterance = new SpeechSynthesisUtterance(lines[i].text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    utterance.voice = (lines[i].speaker === 'A' ? voiceA : voiceB) ?? null;
    if (lines[i].speaker === 'C') utterance.pitch = 1.15;
    await new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
    if (!isStopped()) await new Promise((r) => setTimeout(r, LINE_PAUSE_MS));
  }
}

/* ---------- Public API ---------- */

/**
 * Plays a script line by line, one voice per speaker
 *
 * @param lines - Script to read
 * @param genders - Gender per speaker key
 * @param rate - Playback speed (1 = normal)
 * @param onLine - Index of the line being spoken; -1 when finished or stopped
 * @returns Function that stops playback
 */
export function speakScript(lines: ScriptLine[], genders: Genders, rate: number, onLine: (index: number) => void): () => void {
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  const isStopped = () => stopped;

  const run = async () => {
    // Stream: fetch line i+1 while line i plays, so playback starts after the first clip
    const clipFor: Promise<string>[] = [];
    const request = (i: number) => {
      clipFor[i] ??= fetchClips([lines[i]], genders).then((urls) => urls[0]);
      return clipFor[i];
    };

    let firstClip: string | null = null;
    if (await serverVoicesAvailable()) {
      try {
        firstClip = await request(0);
      } catch {
        firstClip = null;
      }
    }
    if (stopped) return;

    if (!firstClip) {
      if ('speechSynthesis' in window) await playWithBrowser(lines, genders, rate, onLine, isStopped);
      if (!stopped) onLine(-1);
      return;
    }

    for (let i = 0; i < lines.length && !stopped; i++) {
      if (i + 1 < lines.length) void request(i + 1).catch(() => {});
      let url: string;
      try {
        url = await request(i);
      } catch {
        // One failed clip: skip it rather than abandon the whole script
        continue;
      }
      if (stopped) break;
      onLine(i);
      const current = new Audio(url);
      current.playbackRate = rate;
      audio = current;
      await new Promise<void>((resolve) => {
        current.onended = () => resolve();
        current.onerror = () => resolve();
        current.onpause = () => resolve();
        current.play().catch(() => resolve());
      });
      if (!stopped) await new Promise((r) => setTimeout(r, LINE_PAUSE_MS));
    }
    if (!stopped) onLine(-1);
  };

  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  void run();

  return () => {
    if (stopped) return;
    stopped = true;
    audio?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    onLine(-1);
  };
}

/** The single stop function for one-off speech, so a new sentence cuts off the previous one */
let stopOnce: (() => void) | null = null;

/**
 * Speaks one piece of text with the default voice (questions, model sentences, chat replies)
 * @returns Function that stops playback
 */
export function speakOnce(text: string, rate = 1, onDone?: () => void): () => void {
  stopOnce?.();
  const lines = splitSentences(text).map((sentence) => ({ speaker: 'A' as const, text: sentence }));
  const stop = speakScript(lines, { A: 'female' }, rate, (index) => {
    if (index === -1) onDone?.();
  });
  stopOnce = stop;
  return stop;
}

/** Audio can play either through server clips or the browser voice */
export const isSpeechSupported = (): boolean => typeof window !== 'undefined' && ('Audio' in window || 'speechSynthesis' in window);
