/**
 * Pronunciation Practice Phrases Database
 * Contains practice phrases organized by category and difficulty level
 */

/** Difficulty levels for practice phrases */
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Categories of practice phrases */
export const CATEGORIES = [
  'Greetings',
  'Conversation',
  'Tongue Twisters',
  'Common Phrases',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Structure for a practice phrase */
export interface Phrase {
  /** Unique identifier for the phrase */
  id: string;
  /** The text content to practice */
  text: string;
  /** Category of the phrase */
  category: Category;
  /** Difficulty level */
  difficulty: Difficulty;
}

/**
 * Practice phrases database
 * Organized by difficulty with various categories for comprehensive practice
 */
export const PHRASES: Phrase[] = [
  // Easy - Greetings
  {
    id: 'greeting-1',
    text: 'Hello, how are you today?',
    category: 'Greetings',
    difficulty: 'easy',
  },
  {
    id: 'greeting-2',
    text: 'Good morning! Nice to meet you.',
    category: 'Greetings',
    difficulty: 'easy',
  },
  {
    id: 'greeting-3',
    text: 'Have a great day!',
    category: 'Greetings',
    difficulty: 'easy',
  },

  // Easy - Common Phrases
  {
    id: 'common-1',
    text: 'Thank you very much.',
    category: 'Common Phrases',
    difficulty: 'easy',
  },
  {
    id: 'common-2',
    text: 'Could you help me, please?',
    category: 'Common Phrases',
    difficulty: 'easy',
  },

  // Medium - Conversation
  {
    id: 'convo-1',
    text: 'I would like to schedule an appointment for tomorrow.',
    category: 'Conversation',
    difficulty: 'medium',
  },
  {
    id: 'convo-2',
    text: 'What time does the meeting start?',
    category: 'Conversation',
    difficulty: 'medium',
  },
  {
    id: 'convo-3',
    text: 'I think we should consider other options.',
    category: 'Conversation',
    difficulty: 'medium',
  },

  // Medium - Common Phrases
  {
    id: 'common-3',
    text: 'I apologize for the inconvenience.',
    category: 'Common Phrases',
    difficulty: 'medium',
  },
  {
    id: 'common-4',
    text: 'Let me think about it and get back to you.',
    category: 'Common Phrases',
    difficulty: 'medium',
  },

  // Hard - Tongue Twisters
  {
    id: 'twister-1',
    text: 'She sells seashells by the seashore.',
    category: 'Tongue Twisters',
    difficulty: 'hard',
  },
  {
    id: 'twister-2',
    text: 'Peter Piper picked a peck of pickled peppers.',
    category: 'Tongue Twisters',
    difficulty: 'hard',
  },
  {
    id: 'twister-3',
    text: 'How much wood would a woodchuck chuck if a woodchuck could chuck wood?',
    category: 'Tongue Twisters',
    difficulty: 'hard',
  },

  // Hard - Conversation
  {
    id: 'convo-4',
    text: 'I thoroughly appreciate your thorough analysis of the situation.',
    category: 'Conversation',
    difficulty: 'hard',
  },
  {
    id: 'convo-5',
    text: 'The sixth sheik\'s sixth sheep is sick.',
    category: 'Tongue Twisters',
    difficulty: 'hard',
  },
];

/**
 * Get phrases filtered by difficulty
 * @param difficulty - The difficulty level to filter by
 * @returns Array of phrases matching the difficulty
 */
export function getPhrasesByDifficulty(difficulty: Difficulty): Phrase[] {
  return PHRASES.filter((phrase) => phrase.difficulty === difficulty);
}

/**
 * Get a random phrase for a given difficulty
 * @param difficulty - The difficulty level
 * @returns A random phrase matching the difficulty
 */
export function getRandomPhrase(difficulty: Difficulty): Phrase {
  const filtered = getPhrasesByDifficulty(difficulty);
  const randomIndex = Math.floor(Math.random() * filtered.length);
  return filtered[randomIndex];
}
