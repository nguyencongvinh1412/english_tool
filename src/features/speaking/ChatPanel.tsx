/**
 * ChatPanel
 * Shared chat UI for conversation and scenarios: message bubbles, voice + typed input,
 * AI replies read aloud
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Button, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useSpeechRecognition, useTextToSpeech } from '@/hooks';
import type { ChatMessage } from '@/types/api';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { RecordButton } from './RecordButton';
import './speaking.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSend: (text: string) => Promise<void> | void;
  /** Quick replies shown above the input */
  suggestions?: string[];
  suggestionsLabel?: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, isLoading, error, onSend, suggestions, suggestionsLabel }) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [spoken, setSpoken] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const spokenCount = useRef(messages.length);

  const { isListening, transcript, interimTranscript, error: speechError, isSupported, startListening, stopListening, resetTranscript } =
    useSpeechRecognition();
  const { speak } = useTextToSpeech();

  // Keep the newest message in view
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  // Read each new AI reply aloud
  useEffect(() => {
    if (messages.length > spokenCount.current) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant') speak(last.content);
    }
    spokenCount.current = messages.length;
  }, [messages, speak]);

  // When recording stops, hold the transcript for review before sending
  useEffect(() => {
    if (!isListening && transcript) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- result of the external speech API
      setSpoken(transcript);
      resetTranscript();
    }
  }, [isListening, transcript, resetTranscript]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;
      await onSend(trimmed);
    },
    [onSend, isLoading]
  );

  const submitDraft = (event: React.FormEvent): void => {
    event.preventDefault();
    const text = draft;
    setDraft('');
    void send(text);
  };

  return (
    <div className="chat">
      <div className="chat__log" ref={scrollRef} aria-live="polite">
        {messages.length === 0 && !isLoading && (
          <p className="chat__empty">
            <Icon name="chat" size={28} />
            {t.chat.empty}
          </p>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`bubble bubble--${message.role}`}>
            <span className="bubble__role">{message.role === 'user' ? t.chat.you : t.chat.ai}</span>
            <p className="bubble__text" lang="en">
              <InlineMarkdown text={message.content} />
            </p>
            {message.role === 'assistant' && (
              <button type="button" className="bubble__speak" onClick={() => speak(message.content)} aria-label={t.chat.listen} title={t.chat.listen}>
                <Icon name="headphones" size={16} />
              </button>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="bubble bubble--assistant bubble--typing">
            <span className="bubble__role">{t.chat.ai}</span>
            <span className="typing" aria-label={t.chat.thinking}>
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="chat__suggestions">
          <span className="chat__suggestions-label">{suggestionsLabel}</span>
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="chip" onClick={() => void send(suggestion)} disabled={isLoading} lang="en">
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="chat__composer">
        {isSupported ? (
          <div className="chat__voice">
            <RecordButton
              size="md"
              isRecording={isListening}
              onStart={() => {
                setSpoken('');
                startListening();
              }}
              onStop={stopListening}
              startLabel={t.chat.speak}
              stopLabel={t.chat.stop}
              disabled={isLoading}
            />

            {isListening && (transcript || interimTranscript) && (
              <p className="speak-live" lang="en">
                {transcript}
                {interimTranscript && <span className="speak-live__interim"> {interimTranscript}</span>}
              </p>
            )}

            {!isListening && spoken && (
              <div className="chat__spoken">
                <p lang="en">{spoken}</p>
                <div className="chat__spoken-actions">
                  <Button size="sm" icon="check" disabled={isLoading} onClick={() => {
                    const text = spoken;
                    setSpoken('');
                    void send(text);
                  }}>
                    {t.chat.sendSpoken}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSpoken('')}>
                    {t.chat.clear}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Banner tone="warning">{t.chat.voiceUnsupported}</Banner>
        )}

        {isSupported && <div className="chat__divider">{t.chat.or}</div>}

        <form className="chat__form" onSubmit={submitDraft}>
          <input
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.chat.typePlaceholder}
            aria-label={t.chat.typePlaceholder}
            disabled={isLoading}
            maxLength={2000}
            lang="en"
          />
          <Button type="submit" icon="chevronRight" disabled={isLoading || !draft.trim()}>
            {t.chat.send}
          </Button>
        </form>
      </div>

      {(error || speechError) && <Banner tone="danger">{error ?? speechError}</Banner>}
    </div>
  );
};
