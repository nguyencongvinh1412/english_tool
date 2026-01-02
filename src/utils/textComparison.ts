/**
 * Text Comparison Utility
 * Provides functionality for comparing user speech against target phrases
 * Used in pronunciation practice to calculate accuracy and provide feedback
 */

/** Result of matching a single word */
export interface WordMatch {
  /** The word from the target phrase */
  word: string;
  /** Whether this word was matched in the user's speech */
  matched: boolean;
}

/** Result of comparing target text with user text */
export interface ComparisonResult {
  /** Similarity percentage (0-100) */
  similarity: number;
  /** Array of target words with match status */
  targetWords: WordMatch[];
  /** Array of words from user's speech */
  userWords: string[];
}

/**
 * Normalize text for comparison
 * Converts to lowercase and removes punctuation
 * @param text - The text to normalize
 * @returns Normalized text string
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()\-[\]{}]/g, '')
    .trim();
}

/**
 * Split text into words array
 * @param text - The text to split
 * @returns Array of individual words
 */
function getWords(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Compare target text with user speech
 * Calculates similarity percentage and identifies matched/missed words
 *
 * @param targetText - The expected phrase
 * @param userText - What the user actually said
 * @returns Comparison result with similarity score and word-by-word analysis
 *
 * @example
 * ```ts
 * const result = compareTexts(
 *   "Hello, how are you?",
 *   "Hello how are you"
 * );
 * // result.similarity = 100
 * // All words matched
 * ```
 */
export function compareTexts(
  targetText: string,
  userText: string
): ComparisonResult {
  const targetWordsArray = getWords(targetText);
  const userWordsArray = getWords(userText);

  // Create a set of user words for faster lookup
  const userWordsSet = new Set(userWordsArray);

  // Match each target word against user words
  const targetWords: WordMatch[] = targetWordsArray.map((word) => ({
    word,
    matched: userWordsSet.has(word),
  }));

  // Calculate similarity as percentage of matched words
  const matchedCount = targetWords.filter((w) => w.matched).length;
  const totalTargetWords = targetWordsArray.length;

  // Avoid division by zero
  const similarity =
    totalTargetWords > 0
      ? Math.round((matchedCount / totalTargetWords) * 100)
      : 0;

  return {
    similarity,
    targetWords,
    userWords: userWordsArray,
  };
}

/** Threshold values for feedback messages */
const EXCELLENT_THRESHOLD = 90;
const GOOD_THRESHOLD = 70;
const FAIR_THRESHOLD = 50;

/**
 * Get an encouraging feedback message based on similarity score
 * @param similarity - The similarity percentage (0-100)
 * @returns An encouraging feedback message
 */
export function getSimilarityFeedback(similarity: number): string {
  if (similarity >= EXCELLENT_THRESHOLD) {
    return 'Excellent! Your pronunciation is nearly perfect!';
  }
  if (similarity >= GOOD_THRESHOLD) {
    return 'Good job! Most words were pronounced correctly.';
  }
  if (similarity >= FAIR_THRESHOLD) {
    return 'Not bad! Keep practicing to improve.';
  }
  return 'Keep practicing! Try speaking more slowly and clearly.';
}
