/**
 * ReviewChat
 * A small chat under a part of the answer review: the learner asks the AI to explain answers that are not clear.
 * The AI gets the text of that part (passage, questions, the learner's answers, correct answers and explanations).
 * Nothing is saved: the conversation lives in this component and is gone on reload.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Icon, Spinner } from '@/design';
import { useCurrentUser } from '@/app/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { tasksLeft } from '@/shared/billingApi';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { sendMessage } from '@/services/api';
import type { ChatMessage } from '@/types/api';

/** Marks the chat itself, so its text is left out of what the AI is given */
const CHAT_ATTR = 'data-review-chat';
/** Same limit as the server (REVIEW_MATERIAL_MAX); the part of a long passage past it is cut */
const MATERIAL_MAX = 14000;
/** Turns sent along with a question */
const HISTORY = 10;

/** The visible text of a review part, without the chat and with blank lines squeezed */
function reviewMaterial(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(`[${CHAT_ATTR}], audio, script, style`).forEach((node) => node.remove());
  // A detached copy has no layout, so line breaks come from the block structure
  const text = copy.innerText || copy.textContent || '';
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MATERIAL_MAX);
}

/** The reply as paragraphs and bullets with **bold** */
const Reply: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/\n{2,}/).map((block, i) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const bullets = lines.filter((line) => /^[-•*]\s/.test(line));
      const prose = lines.filter((line) => !/^[-•*]\s/.test(line));
      return (
        <div key={i}>
          {prose.length > 0 && (
            <p>
              <InlineMarkdown text={prose.join(' ')} />
            </p>
          )}
          {bullets.length > 0 && (
            <ul>
              {bullets.map((line, j) => (
                <li key={j}>
                  <InlineMarkdown text={line.replace(/^[-•*]\s+/, '')} />
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    })}
  </>
);

export const ReviewChat: React.FC<{ getRoot: () => HTMLElement | null }> = ({ getRoot }) => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const copy = t.ielts.askAi;
  const creditsOut = (tasksLeft(user.credits, 'chat') ?? 1) < 1;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (raw: string): Promise<void> => {
    const content = raw.trim();
    const root = getRoot();
    if (!content || busy || creditsOut || !root) return;
    const history: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(history);
    setDraft('');
    setError(null);
    setBusy(true);
    try {
      const reply = await sendMessage(history.slice(-HISTORY), { mode: 'review', material: reviewMaterial(root) });
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="rchat rchat--closed" {...{ [CHAT_ATTR]: '' }}>
        <Button variant="secondary" size="sm" icon="sparkles" onClick={() => setOpen(true)}>
          {copy.open}
        </Button>
      </div>
    );
  }

  return (
    <section className="rchat" aria-label={copy.title} {...{ [CHAT_ATTR]: '' }}>
      <header className="rchat__head">
        <h4>
          <Icon name="sparkles" size={16} /> {copy.title}
        </h4>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setMessages([]); setError(null); }}>
            {copy.clear}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {copy.close}
        </Button>
      </header>
      <p className="rchat__hint">{copy.hint}</p>

      {messages.length > 0 && (
        <div className="rchat__log" ref={logRef} aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`rchat__msg rchat__msg--${m.role}`}>
              <strong>{m.role === 'user' ? copy.you : copy.ai}</strong>
              {m.role === 'user' ? <p>{m.content}</p> : <Reply text={m.content} />}
            </div>
          ))}
          {busy && (
            <div className="rchat__msg rchat__msg--assistant">
              <Spinner size={14} /> {copy.thinking}
            </div>
          )}
        </div>
      )}

      {messages.length === 0 && !creditsOut && (
        <div className="rchat__chips">
          {copy.suggestions.map((text) => (
            <button key={text} type="button" className="rchat__chip" disabled={busy} onClick={() => void send(text)}>
              {text}
            </button>
          ))}
        </div>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      <form
        className="rchat__form"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <input
          className="rchat__input"
          value={draft}
          maxLength={1000}
          placeholder={creditsOut ? copy.locked : copy.placeholder}
          aria-label={copy.title}
          disabled={creditsOut}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" icon="arrowUp" disabled={busy || creditsOut || !draft.trim()}>
          {copy.send}
        </Button>
      </form>
    </section>
  );
};

/** One part of the answer review, with the chat that explains it underneath */
export const ReviewGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="ielts-review-group">
      {children}
      <ReviewChat getRoot={() => ref.current} />
    </div>
  );
};
