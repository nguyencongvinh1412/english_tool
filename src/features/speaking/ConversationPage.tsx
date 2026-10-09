/**
 * ConversationPage
 * Free-form chat with an AI tutor on a chosen topic
 */
import type React from 'react';
import { useCallback, useState } from 'react';
import { Button, PageHeader, Select } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useClaude } from '@/hooks';
import { CONVERSATION_SYSTEM_PROMPT, DEFAULT_TOPIC, TOPICS, type ConversationTopic } from '@/constants/prompts';
import { ChatPanel } from './ChatPanel';
import { useSessionRecorder } from './useSessionRecorder';

/**
 * System prompt with the topic woven in
 */
function promptFor(topic: ConversationTopic): string {
  if (topic === 'Free Conversation') return CONVERSATION_SYSTEM_PROMPT;
  return `${CONVERSATION_SYSTEM_PROMPT}\n\nThe current conversation topic is: ${topic}. Guide the conversation naturally around this topic while remaining flexible to the student's interests.`;
}

export const ConversationPage: React.FC = () => {
  const { t } = useI18n();
  const [topic, setTopic] = useState<ConversationTopic>(DEFAULT_TOPIC);
  const [sessionId, setSessionId] = useState(0);
  const { messages, isLoading, error, sendUserMessage, clearMessages } = useClaude({ initialSystemPrompt: promptFor(topic) });

  useSessionRecorder(messages, {
    key: `${topic}:${sessionId}`,
    activity: 'conversation',
    contentRef: topic,
    title: topic,
  });

  const restart = useCallback(
    (nextTopic: ConversationTopic = topic) => {
      setTopic(nextTopic);
      setSessionId((id) => id + 1);
      clearMessages();
    },
    [topic, clearMessages]
  );

  return (
    <div className="speak">
      <PageHeader
        eyebrow={t.nav.speaking}
        title={t.conversation.title}
        description={t.conversation.description}
        actions={
          <>
            <label className="topic-picker">
              <span className="visually-hidden">{t.chat.topic}</span>
              <Select value={topic} onChange={(event) => restart(event.target.value as ConversationTopic)} disabled={isLoading}>
                {TOPICS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </label>
            {messages.length > 0 && (
              <Button variant="secondary" icon="plus" onClick={() => restart()} disabled={isLoading}>
                {t.chat.newConversation}
              </Button>
            )}
          </>
        }
      />

      <ChatPanel messages={messages} isLoading={isLoading} error={error} onSend={sendUserMessage} />
    </div>
  );
};
