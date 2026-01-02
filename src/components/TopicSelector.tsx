/**
 * TopicSelector Component
 * Dropdown selector for conversation topics
 */

import type React from 'react';
import type { ChangeEvent } from 'react';
import { TOPICS, type ConversationTopic } from '@/constants/prompts';

/** Props for the TopicSelector component */
interface TopicSelectorProps {
  /** Currently selected topic */
  selectedTopic: ConversationTopic;
  /** Callback when topic selection changes */
  onSelect: (topic: ConversationTopic) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * Dropdown component for selecting conversation topics
 * Uses TOPICS constant for available options
 *
 * @example
 * ```tsx
 * <TopicSelector
 *   selectedTopic="Travel"
 *   onSelect={(topic) => setTopic(topic)}
 * />
 * ```
 */
export const TopicSelector: React.FC<TopicSelectorProps> = ({
  selectedTopic,
  onSelect,
  disabled = false,
}) => {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onSelect(event.target.value as ConversationTopic);
  };

  return (
    <div className="topic-selector">
      <label htmlFor="topic-select" className="topic-selector__label">
        Topic:
      </label>
      <select
        id="topic-select"
        className="topic-selector__select"
        value={selectedTopic}
        onChange={handleChange}
        disabled={disabled}
        aria-label="Select conversation topic"
      >
        {TOPICS.map((topic) => (
          <option key={topic} value={topic}>
            {topic}
          </option>
        ))}
      </select>
    </div>
  );
};
