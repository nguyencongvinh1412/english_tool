/**
 * AI Conversation Prompts and Topics
 * Conversation topic options (system prompts live on the server)
 */

/**
 * Available conversation topics for practice
 * Used in TopicSelector component
 */
export const TOPICS = [
  'Free Conversation',
  'Travel',
  'Work',
  'Daily Life',
  'Food',
  'Hobbies',
] as const;

/** Type for topic values */
export type ConversationTopic = (typeof TOPICS)[number];

/** Default topic when none selected */
export const DEFAULT_TOPIC: ConversationTopic = 'Free Conversation';
