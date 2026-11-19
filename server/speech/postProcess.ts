/**
 * Turns the model's raw JSON into what the learner sees
 * - drops issues without evidence (a word nobody said or read)
 * - measures fluency from word timings in code, so the numbers are stable
 */
import type { AssessInput, RawAssessment, SpeechAssessment, SpeechIssue } from './types.js';

/** Most issues shown for one clip */
export const MAX_ISSUES = 8;
/** Read mode: below this share of the sentence's words heard, the learner read something else */
export const MIN_READ_COVERAGE = 0.5;
/** A "heard as" longer than this is a transcript, not a mispronounced word */
const MAX_HEARD_WORDS = 3;
/**
 * Word timings that run past the end of the clip by more than this cannot be right (seen in about 1 of 8 runs:
 * the model stretched words across the silences, hiding the pauses), so no fluency numbers are given for that clip
 */
export const TIMING_TOLERANCE_SEC = 0.1;
/** A silence between words at least this long counts as a long pause */
export const LONG_PAUSE_SEC = 0.7;
const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'ah', 'hmm', 'uhm', 'mm']);

/** Lower-case words without punctuation */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/** Filler words, plus "you know" as one filler */
export function countFillers(words: string[]): number {
  let count = 0;
  for (let i = 0; i < words.length; i++) {
    if (FILLERS.has(words[i])) count++;
    else if (words[i] === 'you' && words[i + 1] === 'know') {
      count++;
      i++;
    }
  }
  return count;
}

function keepIssues(raw: RawAssessment, input: AssessInput): SpeechIssue[] {
  if (input.mode === 'transcribe') return [];
  const allowed = new Set(tokens(input.mode === 'read' ? (input.reference ?? '') : raw.transcript));
  const seen = new Set<string>();
  const kept: SpeechIssue[] = [];
  for (const issue of raw.issues) {
    const word = tokens(issue.word)[0];
    if (!word || !allowed.has(word) || seen.has(word)) continue;
    const heard = issue.heardAs ? tokens(issue.heardAs) : [];
    // "heard as" the same word is not a problem; a whole phrase is not about one word
    if ((heard.join(' ') === word && !issue.sound) || heard.length > MAX_HEARD_WORDS) continue;
    seen.add(word);
    kept.push({ word: issue.word, ...(issue.heardAs && { heardAs: issue.heardAs }), ...(issue.sound && { sound: issue.sound }), tip: issue.tip });
    if (kept.length === MAX_ISSUES) break;
  }
  return kept;
}

function fluency(raw: RawAssessment, durationSec: number): SpeechAssessment['fluency'] {
  const timed = raw.words
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start)
    .sort((a, b) => a.start - b.start);
  if (timed.some((w) => w.end > durationSec + TIMING_TOLERANCE_SEC)) return undefined;
  const spoken = tokens(raw.transcript);
  const fillers = countFillers(spoken);
  const realWords = spoken.length - fillers;

  let longPauses = 0;
  for (let i = 1; i < timed.length; i++) if (timed[i].start - timed[i - 1].end >= LONG_PAUSE_SEC) longPauses++;

  // Speaking time: first to last word when timings exist, else the whole clip
  const span = timed.length >= 2 ? timed[timed.length - 1].end - timed[0].start : durationSec;
  const wpm = span > 0 ? Math.round(realWords / (span / 60)) : 0;
  return { durationSec: Math.round(durationSec * 10) / 10, wpm, longPauses, fillers };
}

const band = (n: number): number => Math.min(9, Math.max(0, Math.round(n * 2) / 2));

/** Read mode: the learner read a different sentence, so word-level notes would be meaningless */
export function isOffScript(reference: string, transcript: string): boolean {
  const expected = tokens(reference);
  if (!expected.length) return false;
  const heard = new Set(tokens(transcript));
  return expected.filter((word) => heard.has(word)).length / expected.length < MIN_READ_COVERAGE;
}

/**
 * @param raw - Parsed model reply
 * @param input - What was assessed
 * @param engine - Model that answered and whether it checks pronunciation well
 */
export function postProcess(raw: RawAssessment, input: AssessInput, engine: { model: string; accuracy: 'full' | 'basic' }): SpeechAssessment {
  if (input.mode === 'read' && isOffScript(input.reference ?? '', raw.transcript)) {
    return { transcript: raw.transcript, issues: [], overall: { pronunciation: 'needs_work' }, offScript: true, engineModel: engine.model, accuracy: engine.accuracy };
  }
  const result: SpeechAssessment = {
    transcript: raw.transcript,
    issues: keepIssues(raw, input),
    engineModel: engine.model,
    accuracy: engine.accuracy,
  };
  if (input.mode !== 'transcribe' && raw.overall) result.overall = raw.overall;
  if (input.mode === 'answer') {
    const measured = fluency(raw, input.durationSec);
    if (measured) result.fluency = measured;
    const hint = raw.bandHint;
    if (hint && Number.isFinite(hint.pronunciation) && Number.isFinite(hint.fluency)) {
      result.bandHint = { pronunciation: band(hint.pronunciation), fluency: band(hint.fluency) };
    }
  }
  return result;
}
