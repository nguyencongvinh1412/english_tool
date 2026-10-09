/**
 * Multi-voice script playback with the Web Speech API
 * Picks distinct English voices per speaker gender; falls back to pitch changes
 * when the device has only one English voice
 */

export interface ScriptLine {
  speaker: 'A' | 'B';
  text: string;
}

export type Gender = 'female' | 'male';

/** Voice name fragments that usually indicate gender on macOS, Windows, Chrome and Android */
/** Word boundaries matter: "male" must not match "female" */
const FEMALE_HINTS = /\b(female|samantha|karen|moira|tessa|fiona|victoria|zira|aria|jenny|susan|serena)\b|google us english/i;
const MALE_HINTS = /\b(male|daniel|alex|fred|tom|oliver|david|mark|guy|george|arthur)\b/i;

/** Pause between lines (ms) */
const LINE_PAUSE_MS = 450;

/**
 * English voices currently available (may be empty until voiceschanged fires)
 */
function englishVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'));
}

/**
 * Best voice for a gender, avoiding a voice already used by the other speaker
 */
function pickVoice(gender: Gender, avoid?: SpeechSynthesisVoice): SpeechSynthesisVoice | undefined {
  const voices = englishVoices();
  const hints = gender === 'female' ? FEMALE_HINTS : MALE_HINTS;
  const opposite = gender === 'female' ? MALE_HINTS : FEMALE_HINTS;
  const matches = (voice: SpeechSynthesisVoice, pattern: RegExp) => pattern.test(voice.name);

  return (
    voices.find((v) => v !== avoid && matches(v, hints) && !matches(v, opposite) && v.lang === 'en-US') ??
    voices.find((v) => v !== avoid && matches(v, hints) && !matches(v, opposite)) ??
    voices.find((v) => v !== avoid) ??
    voices[0]
  );
}

/**
 * Waits until the browser has loaded its voice list (Chrome loads it asynchronously)
 */
function voicesReady(): Promise<void> {
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve();
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, 1500);
  });
}

/**
 * Speaks a script line by line with one voice per speaker
 *
 * @param lines - Script to read
 * @param genders - Gender per speaker key
 * @param rate - Speech rate (1 = normal)
 * @param onLine - Called with the index of the line being spoken (-1 when finished)
 * @returns Function that stops playback
 */
export function speakScript(
  lines: ScriptLine[],
  genders: { A: Gender; B?: Gender },
  rate: number,
  onLine: (index: number) => void
): () => void {
  let stopped = false;
  const synth = window.speechSynthesis;

  const run = async () => {
    await voicesReady();
    const voiceA = pickVoice(genders.A);
    const voiceB = genders.B ? pickVoice(genders.B, voiceA) : undefined;
    // Same voice for both speakers: separate them by pitch instead
    const sameVoice = !voiceB || voiceB === voiceA;

    for (let i = 0; i < lines.length && !stopped; i++) {
      onLine(i);
      const line = lines[i];
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.lang = 'en-US';
      utterance.rate = rate;
      utterance.voice = (line.speaker === 'B' ? voiceB : voiceA) ?? null;
      utterance.pitch = sameVoice && line.speaker === 'B' ? (genders.B === 'male' ? 0.75 : 1.25) : 1;

      await new Promise<void>((resolve) => {
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        synth.speak(utterance);
      });
      if (!stopped) await new Promise((r) => setTimeout(r, LINE_PAUSE_MS));
    }
    if (!stopped) onLine(-1);
  };

  synth.cancel();
  void run();

  return () => {
    stopped = true;
    synth.cancel();
    onLine(-1);
  };
}

/**
 * Speaks one sentence with a neutral voice (questions in speaking tests)
 */
export function speakOnce(text: string, rate = 0.9): void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = rate;
  utterance.voice = pickVoice('female') ?? null;
  synth.speak(utterance);
}

export const isSpeechSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;
