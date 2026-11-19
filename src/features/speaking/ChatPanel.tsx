/**
 * ChatPanel
 * Shared chat UI for conversation and scenarios: message bubbles, voice + typed input,
 * AI replies read aloud.
 * English voice input is recorded and turned into text by the server (accurate with accents);
 * Japanese, or a browser that cannot record, uses the browser's own speech recognition.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Button, Icon, Spinner, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useSpeechRecognition, useTextToSpeech } from '@/hooks';
import { useAudioCapture, type CaptureResult } from '@/hooks/useAudioCapture';
import type { ChatMessage } from '@/types/api';
import { errorMessage } from '@/shared/http';
import { assessSpeech, isSpeechUnavailable } from '@/shared/speechApi';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { JaText } from '@/shared/ja/JaText';
import { plainText } from '@/shared/ja/text';
import { RecordButton } from './RecordButton';
import { micErrorText } from './micError';
import './speaking.css';

/** One spoken turn in a chat is short */
const MAX_TURN_SEC = 45;

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSend: (text: string) => Promise<void> | void;
  /** Quick replies shown above the input */
  suggestions?: string[];
  suggestionsLabel?: string;
  /** Japanese: furigana in replies, ja-JP voice input, and only the Japanese part is read aloud */
  language?: 'en' | 'ja';
}

/** Japanese replies end with a "Feedback:" section in Vietnamese or English, which is not read aloud */
const spokenPart = (content: string, language: 'en' | 'ja') => (language === 'ja' ? content.split(/\n?\s*\**Feedback\**\s*:/i)[0] : content);

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, isLoading, error, onSend, suggestions, suggestionsLabel, language = 'en' }) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const [spoken, setSpoken] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const spokenCount = useRef(messages.length);
  // Sample answers stay hidden until asked for, so the learner tries first; each new reply hides them again
  const [hintsFor, setHintsFor] = useState<number | null>(null);
  const lastMessage = messages.at(-1);
  const sampleAnswers = lastMessage?.role === 'assistant' && !isLoading ? (lastMessage.suggestions ?? []) : [];
  const hintsOpen = hintsFor === messages.length;

  const browser = useSpeechRecognition(language);
  const { transcript, interimTranscript, resetTranscript } = browser;
  const { speak } = useTextToSpeech();

  // English: record, then the server turns the recording into text
  const [checking, setChecking] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const attempt = useRef(0);
  const onTake = useCallback(
    ({ wav, fallbackText }: CaptureResult) => {
      const id = ++attempt.current;
      setChecking(true);
      setVoiceNote(null);
      assessSpeech(wav, { mode: 'transcribe' })
        .then((result) => {
          if (id === attempt.current) setSpoken(result.transcript);
        })
        .catch((failure: unknown) => {
          if (id !== attempt.current) return;
          // The server check is down: keep what the browser heard, if anything
          const heard = fallbackText();
          if (heard) setSpoken(heard);
          else setVoiceNote(isSpeechUnavailable(failure) ? t.speechCheck.unavailableNoText : errorMessage(failure, t));
        })
        .finally(() => {
          if (id === attempt.current) setChecking(false);
        });
    },
    [t]
  );
  const capture = useAudioCapture({ maxSec: MAX_TURN_SEC, livePreview: true, onComplete: onTake });
  const serverVoice = language === 'en' && capture.isSupported;

  const isSupported = serverVoice || browser.isSupported;
  const isListening = serverVoice ? capture.status === 'recording' || capture.status === 'starting' : browser.isListening;
  const liveText = serverVoice ? capture.liveText : `${transcript} ${interimTranscript}`.trim();
  const speechError = serverVoice ? (capture.errorKind ? micErrorText(capture.errorKind, t) : voiceNote) : browser.error;
  const startListening = serverVoice ? () => void capture.start() : browser.startListening;
  const stopListening = serverVoice ? capture.stop : browser.stopListening;

  // Keep the newest message in view
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  // Read each new AI reply aloud
  useEffect(() => {
    if (messages.length > spokenCount.current) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant') speak(spokenPart(last.content, language));
    }
    spokenCount.current = messages.length;
  }, [messages, speak, language]);

  // Browser recognition: when recording stops, hold the transcript for review before sending
  useEffect(() => {
    if (!browser.isListening && transcript) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- result of the external speech API
      setSpoken(transcript);
      resetTranscript();
    }
  }, [browser.isListening, transcript, resetTranscript]);

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
            <p className="bubble__text" lang={language === 'ja' ? undefined : 'en'}>
              <InlineMarkdown text={message.content} japanese={language === 'ja'} />
            </p>
            {message.role === 'assistant' && (
              <button type="button" className="bubble__speak" onClick={() => speak(spokenPart(message.content, language))} aria-label={t.chat.listen} title={t.chat.listen}>
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

      {sampleAnswers.length > 0 && (
        <div className="chat-hints">
          <Button
            variant="ghost"
            size="sm"
            icon="sparkles"
            aria-expanded={hintsOpen}
            onClick={() => setHintsFor(hintsOpen ? null : messages.length)}
          >
            {hintsOpen ? t.chat.hints.hide : t.chat.hints.show}
          </Button>
          {hintsOpen && (
            <div className="chat-hints__panel reveal">
              <p className="chat-hints__note">{t.chat.hints.note}</p>
              <ul className="chat-hints__list">
                {sampleAnswers.map((answer, index) => (
                  <li key={`${index}-${answer}`} className="chat-hint">
                    <span className="chat-hint__level">{t.chat.hints.levels[index] ?? ''}</span>
                    <button
                      type="button"
                      className="chat-hint__text"
                      lang="en"
                      title={t.chat.hints.use}
                      disabled={isLoading}
                      onClick={() => {
                        setDraft(answer);
                        inputRef.current?.focus();
                      }}
                    >
                      {answer}
                    </button>
                    <button type="button" className="chat-hint__listen" onClick={() => speak(answer)} aria-label={t.chat.hints.listen} title={t.chat.hints.listen}>
                      <Icon name="headphones" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {sampleAnswers.length === 0 && suggestions && suggestions.length > 0 && (
        <div className="chat__suggestions">
          <span className="chat__suggestions-label">{suggestionsLabel}</span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chip"
              onClick={() => void send(language === 'ja' ? plainText(suggestion) : suggestion)}
              disabled={isLoading}
              lang={language}
            >
              {language === 'ja' ? <JaText text={suggestion} /> : suggestion}
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
              disabled={isLoading || checking}
              level={serverVoice ? capture.level : undefined}
            />

            {isListening && liveText && (
              <p className="speak-live" lang="en">
                {liveText}
              </p>
            )}

            {checking && (
              <p className="speak-timer">
                <Spinner size={14} /> {t.chat.transcribing}
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
          <TextInput
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t.chat.typePlaceholder}
            aria-label={t.chat.typePlaceholder}
            disabled={isLoading}
            maxLength={2000}
            lang={language}
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
