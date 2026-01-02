/**
 * PronunciationPage Component
 * Main page for pronunciation practice feature
 * Users can practice phrases, get speech recognition feedback, and AI coaching
 */

import type React from 'react';
import { useState, useCallback, useMemo } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useClaude } from '@/hooks/useClaude';
import { RecordingControls } from '@/components/RecordingControls';
import { PhraseDisplay } from '@/components/PhraseDisplay';
import { ComparisonDisplay } from '@/components/ComparisonDisplay';
import {
  DIFFICULTIES,
  getRandomPhrase,
  type Difficulty,
  type Phrase,
} from '@/constants/phrases';
import { compareTexts, type ComparisonResult } from '@/utils/textComparison';

/**
 * System prompt for pronunciation AI feedback
 * Instructs Claude to provide helpful pronunciation coaching
 */
const PRONUNCIATION_PROMPT = `You are a friendly English pronunciation coach.
The user is practicing speaking English phrases.

Based on the target phrase and their spoken transcript, provide brief, encouraging feedback:
1. Acknowledge what they said well
2. For any missed or mispronounced words, suggest how to pronounce them correctly
3. Keep feedback concise (2-3 sentences max)
4. Be encouraging and supportive

Focus on pronunciation tips, not grammar.`;

/**
 * Pronunciation practice page
 * Allows users to practice speaking phrases at various difficulty levels
 * Provides word-by-word comparison and optional AI feedback
 *
 * @returns PronunciationPage JSX element
 */
export const PronunciationPage: React.FC = () => {
  // State management
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [currentPhrase, setCurrentPhrase] = useState<Phrase | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

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

  // Claude AI hook for feedback
  const {
    messages,
    isLoading: isAiLoading,
    error: aiError,
    sendUserMessage,
    clearMessages,
  } = useClaude({ initialSystemPrompt: PRONUNCIATION_PROMPT });

  // Get the latest AI feedback message
  const aiFeedback = useMemo(() => {
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    return assistantMessages.length > 0
      ? assistantMessages[assistantMessages.length - 1].content
      : null;
  }, [messages]);

  /**
   * Handle difficulty selection change
   */
  const handleDifficultyChange = useCallback((newDifficulty: Difficulty) => {
    setDifficulty(newDifficulty);
    setCurrentPhrase(null);
    setComparison(null);
    setShowFeedback(false);
  }, []);

  /**
   * Load a new random phrase for the current difficulty
   */
  const handleNextPhrase = useCallback(() => {
    const newPhrase = getRandomPhrase(difficulty);
    setCurrentPhrase(newPhrase);
    setComparison(null);
    setShowFeedback(false);
    resetTranscript();
    clearMessages();
  }, [difficulty, resetTranscript, clearMessages]);

  /**
   * Handle recording start
   */
  const handleStartRecording = useCallback(() => {
    resetTranscript();
    setComparison(null);
    setShowFeedback(false);
    clearMessages();
    startListening();
  }, [startListening, resetTranscript, clearMessages]);

  /**
   * Handle recording stop and perform comparison
   */
  const handleStopRecording = useCallback(() => {
    stopListening();

    // Give a small delay for final transcript to process
    setTimeout(() => {
      if (currentPhrase && transcript) {
        const result = compareTexts(currentPhrase.text, transcript);
        setComparison(result);
      }
    }, 300);
  }, [stopListening, currentPhrase, transcript]);

  /**
   * Request AI feedback on the pronunciation attempt
   */
  const handleGetAiFeedback = useCallback(async () => {
    if (!currentPhrase || !transcript) return;

    setShowFeedback(true);
    const missedWords = comparison?.targetWords
      .filter((w) => !w.matched)
      .map((w) => w.word)
      .join(', ');

    const feedbackRequest = `Target phrase: "${currentPhrase.text}"
User said: "${transcript}"
${missedWords ? `Missed words: ${missedWords}` : 'All words matched!'}

Please provide brief pronunciation feedback.`;

    await sendUserMessage(feedbackRequest);
  }, [currentPhrase, transcript, comparison, sendUserMessage]);

  // Show browser not supported message
  if (!isSupported) {
    return (
      <div className="page pronunciation-page">
        <header className="page-header">
          <h1 className="page-title">Pronunciation Practice</h1>
        </header>
        <div className="browser-not-supported">
          <div className="browser-not-supported__content">
            <p className="browser-not-supported__message">
              Your browser does not support speech recognition. Please use
              Chrome, Edge, or Safari for this feature.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page pronunciation-page">
      <header className="page-header">
        <h1 className="page-title">Pronunciation Practice</h1>
        <p className="page-description">
          Select a difficulty level and practice speaking English phrases.
        </p>
      </header>

      {/* Difficulty Selector */}
      <section className="difficulty-selector">
        {DIFFICULTIES.map((level) => (
          <button
            key={level}
            type="button"
            className={`difficulty-selector__btn ${
              difficulty === level ? 'difficulty-selector__btn--active' : ''
            } difficulty-selector__btn--${level}`}
            onClick={() => handleDifficultyChange(level)}
          >
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </section>

      {/* Get New Phrase Button */}
      <div className="phrase-actions">
        <button
          type="button"
          className="next-phrase-btn"
          onClick={handleNextPhrase}
        >
          {currentPhrase ? 'Next Phrase' : 'Get Phrase'}
        </button>
      </div>

      {/* Current Phrase Display */}
      {currentPhrase && (
        <section className="practice-section">
          <PhraseDisplay phrase={currentPhrase} />

          {/* Recording Controls */}
          <div className="recording-section">
            <RecordingControls
              isRecording={isListening}
              onStart={handleStartRecording}
              onStop={handleStopRecording}
            />
          </div>

          {/* Speech Error */}
          {speechError && (
            <div className="recording-error">
              <span className="recording-error__message">{speechError}</span>
            </div>
          )}

          {/* User Transcript */}
          {(transcript || interimTranscript) && (
            <div className="user-transcript">
              <span className="user-transcript__label">You said:</span>
              <p className="user-transcript__text">
                <span className="final-transcript">{transcript}</span>
                {interimTranscript && (
                  <span className="interim-transcript">
                    {' '}
                    {interimTranscript}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Comparison Results */}
          {comparison && !isListening && (
            <div className="comparison-section">
              <ComparisonDisplay result={comparison} />

              {/* AI Feedback Button */}
              {!showFeedback && (
                <button
                  type="button"
                  className="ai-feedback-btn"
                  onClick={handleGetAiFeedback}
                  disabled={isAiLoading}
                >
                  Get AI Feedback
                </button>
              )}
            </div>
          )}

          {/* AI Feedback Panel */}
          {showFeedback && (
            <div className="ai-feedback-panel">
              <h3 className="ai-feedback-panel__title">AI Coach Feedback</h3>
              {isAiLoading ? (
                <div className="typing-indicator">
                  <span className="typing-indicator__dot" />
                  <span className="typing-indicator__dot" />
                  <span className="typing-indicator__dot" />
                  <span className="typing-indicator__text">Analyzing...</span>
                </div>
              ) : aiFeedback ? (
                <p className="ai-feedback-panel__content">{aiFeedback}</p>
              ) : null}
              {aiError && (
                <div className="chat-error">
                  <span className="chat-error__message">{aiError}</span>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Empty State */}
      {!currentPhrase && (
        <div className="content-placeholder">
          <div className="placeholder-box">
            <p className="placeholder-text">
              Click "Get Phrase" to start practicing!
            </p>
            <p className="placeholder-hint">
              Select your difficulty level above, then speak the phrase to
              practice your pronunciation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
