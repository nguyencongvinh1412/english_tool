/**
 * ReviewChat
 * A chat beside the answer review: a small button at the bottom right opens a panel along the right edge where the
 * learner asks the AI to explain answers that are not clear, with pictures if needed. The AI gets the text of the part
 * of the review the learner picks (by default the one on screen): passage, questions, answers and explanations.
 * Nothing is saved: the conversation lives in this component and is gone on reload.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Banner, Icon, Spinner } from '@/design';
import { useCurrentUser } from '@/app/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { tasksLeft } from '@/shared/billingApi';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { reviewChatApi, type ReviewChatMessage } from '@/shared/reviewChatApi';
import { imageToDataUrl } from '@/features/grammar/resizeImage';
import type { Messages } from '@/i18n/en';
import './ReviewChat.css';

/** Marks the chat itself, so its text is left out of what the AI is given */
const CHAT_ATTR = 'data-review-chat';
/** Same limit as the server (REVIEW_MATERIAL_MAX); the part of a long passage past it is cut */
const MATERIAL_MAX = 14000;
/** Turns sent along with a question */
const HISTORY = 10;
/** Pictures per message; the request body is limited to 1 MB */
const MAX_IMAGES = 2;

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

export interface ReviewPart {
  id: string;
  label: string;
  el: HTMLElement | null;
}
export type ReviewRegistry = React.MutableRefObject<Map<string, ReviewPart>>;

/** One part of the answer review (a passage, a task); it registers itself so the chat can read it */
export const ReviewGroup: React.FC<{ id: string; label: string; registry: ReviewRegistry; children: React.ReactNode }> = ({ id, label, registry, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parts = registry.current;
    parts.set(id, { id, label, el: ref.current });
    return () => {
      parts.delete(id);
    };
  }, [id, label, registry]);
  return (
    <div ref={ref} className="ielts-review-group">
      {children}
    </div>
  );
};

/** The part whose block crosses the upper third of the screen, else the first one below it */
function partOnScreen(parts: ReviewPart[]): string | null {
  const line = window.innerHeight * 0.35;
  let below: { id: string; top: number } | null = null;
  for (const part of parts) {
    const rect = part.el?.getBoundingClientRect();
    if (!rect) continue;
    if (rect.top <= line && rect.bottom > line) return part.id;
    if (rect.top > line && (!below || rect.top < below.top)) below = { id: part.id, top: rect.top };
  }
  return below?.id ?? parts.at(-1)?.id ?? null;
}

/** Texts that differ by where the chat sits (exam review, speaking feedback) */
export type ReviewChatCopy = Partial<Pick<Messages['ielts']['askAi'], 'hint' | 'placeholder' | 'suggestions'>>;

export const ReviewChat: React.FC<{ registry: ReviewRegistry; copy?: ReviewChatCopy }> = ({ registry, copy: override }) => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const copy = { ...t.ielts.askAi, ...override };
  const creditsOut = (tasksLeft(user.credits, 'chat') ?? 1) < 1;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ReviewChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The part the learner chose; null follows the part on screen */
  const [chosen, setChosen] = useState<string | null>(null);
  const [onScreen, setOnScreen] = useState<string | null>(null);
  const [parts, setParts] = useState<ReviewPart[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The page makes room for the panel while it is open (see .rchat-open in ielts.css)
  useEffect(() => {
    document.documentElement.classList.toggle('rchat-open', open);
    return () => document.documentElement.classList.remove('rchat-open');
  }, [open]);

  // While the panel is open, keep the list of parts and the one on screen up to date
  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      const list = [...registry.current.values()].filter((p) => p.el);
      setParts((current) => (current.length === list.length && current.every((p, i) => p.id === list[i].id) ? current : list));
      setOnScreen(partOnScreen(list));
    };
    refresh();
    window.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh);
    return () => {
      window.removeEventListener('scroll', refresh);
      window.removeEventListener('resize', refresh);
    };
  }, [open, registry]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const activeId = chosen && parts.some((p) => p.id === chosen) ? chosen : onScreen;
  const active = parts.find((p) => p.id === activeId) ?? null;

  const attach = async (picked: File[]): Promise<void> => {
    const pictures = picked.filter((file) => file.type.startsWith('image/')).slice(0, MAX_IMAGES - images.length);
    if (picked.length === 0) return;
    setImageError(false);
    try {
      if (pictures.length === 0) throw new Error('Unsupported');
      const urls = await Promise.all(pictures.map(imageToDataUrl));
      setImages((current) => [...current, ...urls].slice(0, MAX_IMAGES));
    } catch {
      setImageError(true);
    }
  };

  const send = async (raw: string): Promise<void> => {
    const attached = images;
    const content = raw.trim() || (attached.length > 0 ? copy.imageOnly : '');
    const element = active?.el;
    if (!content || busy || creditsOut || !element) return;
    const history: ReviewChatMessage[] = [...messages, { role: 'user', content, images: attached }];
    setMessages(history);
    setDraft('');
    setImages([]);
    setError(null);
    setBusy(true);
    try {
      const reply = await reviewChatApi.send(history.slice(-HISTORY), reviewMaterial(element));
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button type="button" className="rchat-fab" aria-label={copy.open} title={copy.open} onClick={() => setOpen(true)}>
          <Icon name="sparkles" size={24} />
        </button>
      )}
      {open && <div className="rchat-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`rchat ${open ? 'rchat--open' : ''}`} aria-label={copy.title} aria-hidden={!open}>
        <header className="rchat__head">
          <h2>
            <Icon name="sparkles" size={18} /> {copy.title}
          </h2>
          {messages.length > 0 && (
            <button type="button" className="rchat__text-btn" onClick={() => { setMessages([]); setError(null); }}>
              {copy.clear}
            </button>
          )}
          <button type="button" className="rchat__icon-btn" aria-label={copy.close} title={copy.close} onClick={() => setOpen(false)}>
            <Icon name="x" size={18} />
          </button>
        </header>

        <label className="rchat__part">
          <span>{copy.part}</span>
          <select value={activeId ?? ''} onChange={(event) => setChosen(event.target.value === onScreen ? null : event.target.value)}>
            {parts.map((part) => (
              <option key={part.id} value={part.id}>
                {part.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rchat__log" ref={logRef} aria-live="polite">
          {messages.length === 0 ? (
            <div className="rchat__empty">
              <p>{copy.hint}</p>
              {!creditsOut && (
                <div className="rchat__chips">
                  {copy.suggestions.map((text) => (
                    <button key={text} type="button" className="rchat__chip" disabled={busy || !active} onClick={() => void send(text)}>
                      {text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`rchat__msg rchat__msg--${m.role}`}>
                {m.images && m.images.length > 0 && (
                  <div className="rchat__pics">
                    {m.images.map((url, j) => (
                      <img key={j} src={url} alt="" />
                    ))}
                  </div>
                )}
                {m.role === 'user' ? <p>{m.content}</p> : <Reply text={m.content} />}
              </div>
            ))
          )}
          {busy && (
            <div className="rchat__msg rchat__msg--assistant">
              <Spinner size={14} /> {copy.thinking}
            </div>
          )}
        </div>

        {error && <Banner tone="danger">{error}</Banner>}
        {imageError && <Banner tone="danger">{copy.imageError}</Banner>}

        <div className="rchat__box">
          {images.length > 0 && (
            <div className="rchat__thumbs">
              {images.map((url, index) => (
                <div key={index} className="rchat__thumb">
                  <img src={url} alt="" />
                  <button type="button" aria-label={copy.removeImage} onClick={() => setImages((current) => current.filter((_, i) => i !== index))}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            className="rchat__input"
            rows={3}
            value={draft}
            maxLength={1500}
            placeholder={creditsOut ? copy.locked : copy.placeholder}
            disabled={creditsOut}
            aria-label={copy.title}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const pasted = [...event.clipboardData.files];
              if (pasted.length > 0) {
                event.preventDefault();
                void attach(pasted);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <div className="rchat__bar">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                void attach([...(event.target.files ?? [])]);
                event.target.value = '';
              }}
            />
            <button type="button" className="rchat__icon-btn" aria-label={copy.attach} title={copy.attach} disabled={images.length >= MAX_IMAGES || creditsOut} onClick={() => fileRef.current?.click()}>
              <Icon name="paperclip" size={18} />
            </button>
            <button
              type="button"
              className="rchat__send"
              aria-label={copy.send}
              title={copy.send}
              disabled={busy || creditsOut || !active || (!draft.trim() && images.length === 0)}
              onClick={() => void send(draft)}
            >
              {busy ? <Spinner size={16} /> : <Icon name="arrowUp" size={18} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
