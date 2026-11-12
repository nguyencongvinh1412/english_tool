/**
 * Topic word decks of the IELTS path: one deck per topic unit (20) of a vocabulary book, `en-topic-<n>`. The words
 * themselves are imported into the database (npm run book:topic-words); only the deck names live here.
 */
export interface TopicDeck {
  id: string;
  group: 'topic';
  label: string;
}

const TITLES = [
  'Growing up',
  'Mental and physical development',
  'Keeping fit',
  'Lifestyles',
  'Student life',
  'Effective communication',
  'On the move',
  'Through the ages',
  'The natural world',
  'Reaching for the skies',
  'Design and innovation',
  'Information technology',
  'The modern world',
  'Urbanisation',
  'The green revolution',
  'The energy crisis',
  'Talking business',
  'The law',
  'The media',
  'The arts',
];

export const TOPIC_DECKS: TopicDeck[] = TITLES.map((label, i) => ({ id: `en-topic-${i + 1}`, group: 'topic', label }));
