/**
 * ConversationPage Component
 * Practice English conversations with AI tutor
 * Integrates speech recognition, Claude AI, and typed input
 */

import type React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSpeechRecognition, useClaude, useTextToSpeech } from '@/hooks';
import { RecordingControls } from '@/components/RecordingControls';
import { MessageList } from '@/components/MessageList';
import { ChatInput } from '@/components/ChatInput';
import { TopicSelector } from '@/components/TopicSelector';
import {
  CONVERSATION_SYSTEM_PROMPT,
  DEFAULT_TOPIC,
  type ConversationTopic,
} from '@/constants/prompts';

/** Error messages */
const BROWSER_NOT_SUPPORTED_MESSAGE =
  'Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.';

/**
 * Generates the system prompt with topic context
 * @param topic - Selected conversation topic
 * @returns System prompt with topic instruction
 */
function getSystemPromptWithTopic(topic: ConversationTopic): string {
  if (topic === 'Free Conversation') {
    return CONVERSATION_SYSTEM_PROMPT;
  }
  return `${CONVERSATION_SYSTEM_PROMPT}\n\nThe current conversation topic is: ${topic}. Guide the conversation naturally around this topic while remaining flexible to the student's interests.`;
}

/**
 * Conversation practice page with AI tutor
 * Supports both speech input and typed messages
 *
 * @returns ConversationPage JSX element
 */
export const ConversationPage: React.FC = () => {
  const [topic, setTopic] = useState<ConversationTopic>(DEFAULT_TOPIC);
  const [pendingTranscript, setPendingTranscript] = useState<string>('');
  const messageListRef = useRef<HTMLDivElement>(null);

  // Speech recognition hook
  const {
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  // Claude AI hook with topic-aware system prompt
  const { messages, isLoading, error: claudeError, sendUserMessage, clearMessages } = useClaude({
    initialSystemPrompt: getSystemPromptWithTopic(topic),
  });

  // Text-to-speech hook for AI responses
  const { speak } = useTextToSpeech();

  /**
   * Auto-scroll to bottom when new messages arrive
   */
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  /**
   * Update pending transcript when recording stops
   * Captures the final transcript for user review before sending
   * Note: setState in effect is intentional here - syncing with external Web Speech API state
   */
  useEffect(() => {
    if (!isListening && transcript) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing with external API state
      setPendingTranscript(transcript);
      resetTranscript();
    }
  }, [isListening, transcript, resetTranscript]);

  /**
   * Handle starting speech recording
   */
  const handleStartRecording = useCallback(() => {
    setPendingTranscript('');
    startListening();
  }, [startListening]);

  /**
   * Handle stopping speech recording
   */
  const handleStopRecording = useCallback(() => {
    stopListening();
  }, [stopListening]);

  /**
   * Send the pending spoken transcript to Claude
   */
  const handleSendSpokenMessage = useCallback(async () => {
    if (!pendingTranscript.trim()) return;
    await sendUserMessage(pendingTranscript);
    setPendingTranscript('');
  }, [pendingTranscript, sendUserMessage]);

  /**
   * Send a typed message to Claude
   */
  const handleSendTypedMessage = useCallback(
    async (message: string) => {
      await sendUserMessage(message);
    },
    [sendUserMessage]
  );

  /**
   * Clear pending transcript
   */
  const handleClearPendingTranscript = useCallback(() => {
    setPendingTranscript('');
  }, []);

  /**
   * Start a new conversation - clears all messages
   */
  const handleNewConversation = useCallback(() => {
    clearMessages();
    setPendingTranscript('');
    resetTranscript();
  }, [clearMessages, resetTranscript]);

  /**
   * Handle topic change - starts a new conversation
   */
  const handleTopicChange = useCallback(
    (newTopic: ConversationTopic) => {
      setTopic(newTopic);
      // Clear conversation when topic changes
      clearMessages();
      setPendingTranscript('');
      resetTranscript();
    },
    [clearMessages, resetTranscript]
  );

  // Combine errors for display
  const currentError = speechError || claudeError;
  const hasPendingTranscript = pendingTranscript.trim().length > 0;
  const hasConversation = messages.length > 0;

  // Browser support check - show fallback with typing only
  if (!isSupported) {
    return (
      <div className="page conversation-page">
        <header className="page-header page-header--with-controls">
          <div className="page-header__content">
            <h1 className="page-title">Conversation Practice</h1>
            <p className="page-description">
              Practice English conversations with AI assistance and get real-time feedback.
            </p>
          </div>
          <div className="page-header__controls">
            <TopicSelector selectedTopic={topic} onSelect={handleTopicChange} disabled={isLoading} />
            {hasConversation && (
              <button
                type="button"
                className="new-conversation-btn"
                onClick={handleNewConversation}
                disabled={isLoading}
              >
                New Conversation
              </button>
            )}
          </div>
        </header>

        <section className="browser-not-supported">
          <div className="browser-not-supported__content">
            <svg
              className="browser-not-supported__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="browser-not-supported__message">{BROWSER_NOT_SUPPORTED_MESSAGE}</p>
          </div>
        </section>

        {/* Fallback to typed input only */}
        <section className="conversation-section">
          <div className="conversation-container" ref={messageListRef}>
            <MessageList messages={messages} isLoading={isLoading} onSpeakMessage={speak} />
          </div>

          <div className="input-section">
            <ChatInput
              onSend={handleSendTypedMessage}
              disabled={isLoading}
              placeholder="Type your message..."
            />
          </div>

          {currentError && (
            <div className="chat-error" role="alert">
              <span className="chat-error__message">{currentError}</span>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page conversation-page">
      <header className="page-header page-header--with-controls">
        <div className="page-header__content">
          <h1 className="page-title">Conversation Practice</h1>
          <p className="page-description">
            Practice English conversations with AI assistance and get real-time feedback on your
            speaking.
          </p>
        </div>
        <div className="page-header__controls">
          <TopicSelector selectedTopic={topic} onSelect={handleTopicChange} disabled={isLoading} />
          {hasConversation && (
            <button
              type="button"
              className="new-conversation-btn"
              onClick={handleNewConversation}
              disabled={isLoading}
            >
              New Conversation
            </button>
          )}
        </div>
      </header>

      <section className="conversation-section">
        {/* Message List */}
        <div className="conversation-container" ref={messageListRef}>
          <MessageList messages={messages} isLoading={isLoading} onSpeakMessage={speak} />
        </div>

        {/* Input Section */}
        <div className="input-section">
          {/* Voice Input */}
          <div className="voice-input">
            <RecordingControls
              isRecording={isListening}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
              disabled={isLoading}
            />

            {/* Show interim transcript while recording */}
            {isListening && (transcript || interimTranscript) && (
              <div className="voice-input__transcript">
                <span className="voice-input__transcript-text">
                  {transcript}
                  {interimTranscript && (
                    <span className="voice-input__transcript-interim">{interimTranscript}</span>
                  )}
                </span>
              </div>
            )}

            {/* Show pending transcript after recording stops */}
            {!isListening && hasPendingTranscript && (
              <div className="voice-input__pending">
                <p className="voice-input__pending-text">{pendingTranscript}</p>
                <div className="voice-input__pending-actions">
                  <button
                    type="button"
                    className="voice-input__send-btn"
                    onClick={handleSendSpokenMessage}
                    disabled={isLoading}
                  >
                    Send
                  </button>
                  <button
                    type="button"
                    className="voice-input__clear-btn"
                    onClick={handleClearPendingTranscript}
                    disabled={isLoading}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="divider">
            <span className="divider__text">or</span>
          </div>

          {/* Typed Input */}
          <ChatInput
            onSend={handleSendTypedMessage}
            disabled={isLoading}
            placeholder="Type your message..."
          />
        </div>

        {/* Error Display */}
        {currentError && (
          <div className="chat-error" role="alert">
            <span className="chat-error__message">{currentError}</span>
          </div>
        )}
      </section>
    </div>
  );
};
