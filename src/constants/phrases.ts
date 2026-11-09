/**
 * Pronunciation Practice Phrases
 * Grouped by the sounds Vietnamese speakers most often find hard, at three difficulty levels.
 * Old phrase ids are kept where the text stayed, so earlier attempts still match.
 */

/** Difficulty levels for practice phrases (also used by dictation) */
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Sound groups; labels and tips live in i18n under pronunciation.focus */
export const SOUND_FOCUSES = ['final-consonants', 'th', 's-sh', 'ed-endings', 's-endings', 'clusters', 'vowels', 'stress-linking'] as const;
export type SoundFocus = (typeof SOUND_FOCUSES)[number];

/** Structure for a practice phrase */
export interface Phrase {
  /** Unique identifier, stored with each attempt */
  id: string;
  /** The text to read aloud */
  text: string;
  /** The sound this phrase trains */
  category: SoundFocus;
  difficulty: Difficulty;
}

type Row = [id: string, text: string];

/** focus → difficulty → phrases */
const BANK: Record<SoundFocus, Record<Difficulty, Row[]>> = {
  'final-consonants': {
    easy: [
      ['fc-e1', 'I need a big bag.'],
      ['fc-e2', "Let's eat out tonight."],
      ['fc-e3', 'Can you help me find it?'],
    ],
    medium: [
      ['fc-m1', 'I left my black jacket in the cab.'],
      ['fc-m2', 'She said she would call back next week.'],
      ['fc-m3', 'We had a good talk about the new job.'],
    ],
    hard: [
      ['fc-h1', 'The old bridge was closed last night, so I took a long walk around the lake.'],
      ['fc-h2', 'Mark asked if the bank could send the card by Friday.'],
    ],
  },
  th: {
    easy: [
      ['th-e1', 'Thank you for the gift.'],
      ['th-e2', 'This is my brother.'],
      ['th-e3', 'I think it is Thursday.'],
    ],
    medium: [
      ['th-m1', 'There are three things I want to do this month.'],
      ['th-m2', 'My mother and father both work in the north.'],
      ['th-m3', 'I thought the theatre was on Smith Street.'],
    ],
    hard: [
      ['convo-4', 'I thoroughly appreciate your thorough analysis of the situation.'],
      ['th-h2', 'Although the weather was warm, they walked through the path together.'],
    ],
  },
  's-sh': {
    easy: [
      ['ss-e1', 'She sells fresh fish.'],
      ['ss-e2', 'Please sit in this seat.'],
      ['ss-e3', 'I wish I could see the sea.'],
    ],
    medium: [
      ['ss-m1', 'The shop sells shoes, shirts and socks.'],
      ['ss-m2', 'She sent a short message to her sister.'],
      ['ss-m3', 'Should we share a taxi to the station?'],
    ],
    hard: [
      ['twister-1', 'She sells seashells by the seashore.'],
      ['convo-5', "The sixth sheik's sixth sheep is sick."],
      ['ss-h3', 'Sean showed us six short films on social issues.'],
    ],
  },
  'ed-endings': {
    easy: [
      ['ed-e1', 'I walked to work.'],
      ['ed-e2', 'We played a game.'],
      ['ed-e3', 'She wanted a cup of tea.'],
    ],
    medium: [
      ['ed-m1', 'I finished my report and emailed it to my boss.'],
      ['ed-m2', 'They moved to a new flat and painted the walls.'],
      ['ed-m3', 'He looked tired because he worked late.'],
    ],
    hard: [
      ['ed-h1', 'We booked the hotel, packed our bags and started the trip as planned.'],
      ['ed-h2', 'The manager decided that the delayed order needed to be checked again.'],
    ],
  },
  's-endings': {
    easy: [
      ['se-e1', 'She likes cats.'],
      ['se-e2', 'He works on Mondays.'],
      ['se-e3', "My friend's dogs are big."],
    ],
    medium: [
      ['se-m1', 'Prices rise when the costs of goods go up.'],
      ['se-m2', 'She watches films and reads books at weekends.'],
      ['se-m3', 'The boxes on the desks belong to the students.'],
    ],
    hard: [
      ['se-h1', 'The scientist tests the samples and lists the results in her reports.'],
      ['se-h2', 'Months of tasks and texts filled the desks of the clerks.'],
    ],
  },
  clusters: {
    easy: [
      ['cl-e1', 'Please stop the bus.'],
      ['cl-e2', 'I drink green tea.'],
      ['cl-e3', 'The street is crowded.'],
    ],
    medium: [
      ['cl-m1', 'Spring is a great time to travel.'],
      ['cl-m2', 'The students asked for a clear explanation.'],
      ['cl-m3', 'He sprained his wrist while playing sports.'],
    ],
    hard: [
      ['cl-h1', 'Strong strategic planning helps small businesses grow quickly.'],
      ['cl-h2', 'The twelfth script was stretched across the screen.'],
    ],
  },
  vowels: {
    easy: [
      ['vo-e1', 'Can I eat it?'],
      ['vo-e2', 'Look at the moon.'],
      ['vo-e3', 'Pull the door, do not push it.'],
    ],
    medium: [
      ['vo-m1', 'The ship will leave the port at noon.'],
      ['vo-m2', 'Would you like a cup of coffee or a cool drink?'],
      ['vo-m3', 'I need a new pair of boots and a hat.'],
    ],
    hard: [
      ['vo-h1', 'Each week, Jim keeps a list of the meals he eats.'],
      ['vo-h2', 'The cook took a good look at the food before the guests arrived.'],
    ],
  },
  'stress-linking': {
    easy: [
      ['sl-e1', 'Pick it up.'],
      ['sl-e2', 'What do you want?'],
      ['sl-e3', 'Come in and sit down.'],
    ],
    medium: [
      ['convo-1', 'I would like to schedule an appointment for tomorrow.'],
      ['common-4', 'Let me think about it and get back to you.'],
      ['sl-m3', 'Could you turn off the air conditioner, please?'],
    ],
    hard: [
      ['sl-h1', 'Photography and photographic equipment have become more affordable.'],
      ['sl-h2', 'It is important to take advantage of every opportunity that comes along.'],
    ],
  },
};

/** All practice phrases */
export const PHRASES: Phrase[] = SOUND_FOCUSES.flatMap((category) =>
  DIFFICULTIES.flatMap((difficulty) => BANK[category][difficulty].map(([id, text]) => ({ id, text, category, difficulty })))
);

/**
 * Phrases for a level, optionally one sound group
 */
export function getPhrases(difficulty: Difficulty, focus: SoundFocus | 'all' = 'all'): Phrase[] {
  return PHRASES.filter((phrase) => phrase.difficulty === difficulty && (focus === 'all' || phrase.category === focus));
}

/**
 * Picks a phrase the learner has not had yet (shuffle-bag): once every phrase in the pool was seen, the pool starts
 * over, never with the phrase just shown
 * @param seen - Ids already shown, oldest first
 * @param random - Injected for tests
 * @returns The phrase, the updated seen list, and whether the pool had to start over
 */
export function pickPhrase(
  pool: Phrase[],
  seen: string[],
  current: string | null = null,
  random: () => number = Math.random
): { phrase: Phrase | null; seen: string[]; restarted: boolean } {
  if (pool.length === 0) return { phrase: null, seen, restarted: false };
  const poolIds = new Set(pool.map((phrase) => phrase.id));
  let fresh = pool.filter((phrase) => !seen.includes(phrase.id));
  let kept = seen;
  const restarted = fresh.length === 0;
  if (restarted) {
    // Whole pool done: forget this pool's history, keep other levels' history
    kept = seen.filter((id) => !poolIds.has(id));
    fresh = pool.length > 1 ? pool.filter((phrase) => phrase.id !== current) : pool;
  }
  const phrase = fresh[Math.floor(random() * fresh.length)];
  return { phrase, seen: [...kept.filter((id) => id !== phrase.id), phrase.id], restarted };
}
