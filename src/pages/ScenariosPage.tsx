/**
 * ScenariosPage Component
 * Practice English in real-life dialogue scenarios with AI role-playing
 * Integrates speech recognition, Claude AI, and scenario-based conversations
 */

import type React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSpeechRecognition, useClaude, useTextToSpeech } from '@/hooks';
import { SCENARIOS, type Scenario } from '@/constants/scenarios';
import { ScenarioCard } from '@/components/ScenarioCard';
import { ScenarioContext } from '@/components/ScenarioContext';
import { SuggestedPrompts } from '@/components/SuggestedPrompts';
import { RecordingControls } from '@/components/RecordingControls';
import { MessageList } from '@/components/MessageList';
import { ChatInput } from '@/components/ChatInput';

/** Error message for unsupported browsers */
const BROWSER_NOT_SUPPORTED_MESSAGE =
  'Your browser does not support speech recognition. Please use Chrome, Edge, or Safari. You can still type your messages below.';

/**
 * Generates a system prompt for the AI based on the selected scenario
 * Instructs the AI to stay in character and provide appropriate feedback
 *
 * @param scenario - The active scenario
 * @returns System prompt string for Claude
 */
function getScenarioSystemPrompt(scenario: Scenario): string {
  return `You are playing the role of a ${scenario.aiRole} in a dialogue practice scenario.

Context: ${scenario.context}
The user is playing the role of: ${scenario.userRole}

Guidelines:
1. Stay in character as the ${scenario.aiRole}
2. Keep responses natural and conversational
3. After 2-3 exchanges, provide brief feedback on the user's English
4. Be encouraging and helpful
5. Use vocabulary appropriate for ${scenario.difficulty} level learners
6. If the user makes grammar or vocabulary mistakes, gently correct them in context
7. Respond naturally to the conversation while helping the user practice`;
}

/**
 * Scenarios practice page with AI role-playing
 * Users select a scenario and practice real-world conversations
 *
 * @returns ScenariosPage JSX element
 */
export const ScenariosPage: React.FC = () => {
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
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

  // Claude AI hook with scenario-aware system prompt
  const {
    messages,
    isLoading,
    error: claudeError,
    sendUserMessage,
    clearMessages,
  } = useClaude({
    initialSystemPrompt: activeScenario ? getScenarioSystemPrompt(activeScenario) : undefined,
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
   * Handle scenario selection from the grid
   */
  const handleSelectScenario = useCallback(
    (scenario: Scenario) => {
      setActiveScenario(scenario);
      clearMessages();
      resetTranscript();
      setPendingTranscript('');
    },
    [clearMessages, resetTranscript]
  );

  /**
   * Handle going back to scenario selection
   */
  const handleBack = useCallback(() => {
    setActiveScenario(null);
    clearMessages();
    resetTranscript();
    setPendingTranscript('');
  }, [clearMessages, resetTranscript]);

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
   * Send the pending spoken transcript
   */
  const handleSendTranscript = useCallback(async () => {
    if (pendingTranscript.trim()) {
      await sendUserMessage(pendingTranscript.trim());
      setPendingTranscript('');
      resetTranscript();
    }
  }, [pendingTranscript, sendUserMessage, resetTranscript]);

  /**
   * Send a typed message
   */
  const handleTypedMessage = useCallback(
    async (message: string) => {
      await sendUserMessage(message);
    },
    [sendUserMessage]
  );

  /**
   * Handle selecting a suggested prompt
   */
  const handlePromptSelect = useCallback(
    async (prompt: string) => {
      await sendUserMessage(prompt);
    },
    [sendUserMessage]
  );

  /**
   * Clear pending transcript
   */
  const handleClearPendingTranscript = useCallback(() => {
    setPendingTranscript('');
  }, []);

  // Combine errors for display
  const currentError = speechError || claudeError;
  const hasPendingTranscript = pendingTranscript.trim().length > 0;

  // Scenario selection view
  if (!activeScenario) {
    return (
      <div className="page scenarios-page">
        <header className="page-header">
          <h1 className="page-title">Dialogue Scenarios</h1>
          <p className="page-description">
            Choose a scenario to practice real-world English conversations with AI role-playing.
          </p>
        </header>

        <section className="scenarios-grid">
          {SCENARIOS.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              onSelect={handleSelectScenario}
            />
          ))}
        </section>
      </div>
    );
  }

  // Active scenario view
  return (
    <div className="page scenarios-page scenarios-page--active">
      <ScenarioContext scenario={activeScenario} onBack={handleBack} />

      {/* Error Display */}
      {currentError && (
        <div className="chat-error" role="alert">
          <span className="chat-error__message">{currentError}</span>
        </div>
      )}

      {/* Suggested Prompts */}
      <SuggestedPrompts
        prompts={activeScenario.suggestedPrompts}
        onSelect={handlePromptSelect}
      />

      {/* Conversation Section */}
      <section className="conversation-section">
        <div className="conversation-container" ref={messageListRef}>
          <MessageList messages={messages} isLoading={isLoading} onSpeakMessage={speak} />
        </div>

        {/* Input Section */}
        <div className="input-section">
          {/* Browser not supported warning */}
          {!isSupported && (
            <div className="browser-not-supported browser-not-supported--inline">
              <p className="browser-not-supported__message">{BROWSER_NOT_SUPPORTED_MESSAGE}</p>
            </div>
          )}

          {/* Voice Input - only show if supported */}
          {isSupported && (
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
                      onClick={handleSendTranscript}
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
          )}

          {/* Divider - only show if speech is supported */}
          {isSupported && (
            <div className="divider">
              <span className="divider__text">or type</span>
            </div>
          )}

          {/* Typed Input */}
          <ChatInput
            onSend={handleTypedMessage}
            disabled={isLoading}
            placeholder="Type your message..."
          />
        </div>
      </section>
    </div>
  );
};
