/**
 * Dictation Checking Utility
 * Compares typed text against a target sentence word by word, in order,
 * the same way DailyDictation does: words are revealed up to the first mistake
 */

/** Display status of a single target word */
export type DictationWordStatus = 'correct' | 'wrong' | 'hidden';

/** A target word with its display status */
export interface DictationWord {
  /** Original word including punctuation, e.g. "morning," */
  text: string;
  /** Whether the word is revealed, marked wrong, or still hidden */
  status: DictationWordStatus;
}

/** Result of checking typed text against a target sentence */
export interface DictationCheckResult {
  /** Target words with display status */
  words: DictationWord[];
  /** Number of words typed correctly from the start */
  correctCount: number;
  /** Whether the whole sentence was typed correctly */
  isComplete: boolean;
}

/** A word token with its original and normalized forms */
interface Token {
  text: string;
  normalized: string;
}

/**
 * Normalize a word for comparison
 * Ignores case, punctuation, and apostrophes (so "dont" matches "don't")
 * @param word - The word to normalize
 * @returns Normalized word
 */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Split text into word tokens, dropping punctuation-only tokens like "—"
 * @param text - The text to split
 * @returns Array of tokens
 */
function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .map((word) => ({ text: word, normalized: normalizeWord(word) }))
    .filter((token) => token.normalized.length > 0);
}

/**
 * Check typed text against the target sentence
 * Words matching in order are revealed; the first mismatch is marked wrong;
 * everything after it stays hidden
 *
 * @param target - The sentence being dictated
 * @param typed - What the user typed
 * @returns Word-by-word check result
 *
 * @example
 * ```ts
 * checkDictation('I wake up at seven.', 'i wake op');
 * // words: I(correct) wake(correct) up(wrong) at(hidden) seven.(hidden)
 * ```
 */
export function checkDictation(target: string, typed: string): DictationCheckResult {
  const targetTokens = tokenize(target);
  const typedTokens = tokenize(typed);

  let correctCount = 0;
  while (
    correctCount < targetTokens.length &&
    correctCount < typedTokens.length &&
    targetTokens[correctCount].normalized === typedTokens[correctCount].normalized
  ) {
    correctCount++;
  }

  const hasMistake = correctCount < typedTokens.length;

  const words: DictationWord[] = targetTokens.map((token, index) => {
    if (index < correctCount) {
      return { text: token.text, status: 'correct' };
    }
    if (index === correctCount && hasMistake) {
      return { text: token.text, status: 'wrong' };
    }
    return { text: token.text, status: 'hidden' };
  });

  return {
    words,
    correctCount,
    // Extra words typed after a fully correct sentence are ignored
    isComplete: targetTokens.length > 0 && correctCount === targetTokens.length,
  };
}

/**
 * Build the input text after revealing the next word as a hint
 * Keeps the correctly typed prefix and appends the next target word
 *
 * @param target - The sentence being dictated
 * @param typed - What the user typed
 * @returns New input text with one more correct word
 */
export function revealNextWord(target: string, typed: string): string {
  const targetTokens = tokenize(target);
  const { correctCount } = checkDictation(target, typed);
  const revealCount = Math.min(correctCount + 1, targetTokens.length);

  return `${targetTokens
    .slice(0, revealCount)
    .map((token) => token.text)
    .join(' ')} `;
}

/**
 * Mask a word with asterisks, one per letter or digit
 * @param word - The word to mask
 * @returns Masked word, e.g. "morning," -> "*******"
 */
export function maskWord(word: string): string {
  return '*'.repeat(normalizeWord(word).length);
}
