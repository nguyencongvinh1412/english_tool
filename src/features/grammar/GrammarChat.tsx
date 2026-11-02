/**
 * GrammarChat
 * Side panel beside a grammar point: discuss the point with the AI teacher. Typing "@" opens a list of grammar
 * points (filtered as you type, loaded a page at a time) to bring into the conversation.
 */
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Banner, Button, Icon, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { grammarApi, type GrammarMap } from '@/shared/grammarApi';
import { imageToDataUrl } from './resizeImage';
import { isTextFile, readTextFile, type TextAttachment } from './textFile';
import { loadGrammarMap, mentionAt, searchPoints, type MentionToken } from './grammarMentions';

/** Points shown per page of the mention list */
const PAGE_SIZE = 6;
/** Pictures per message; the request body is limited to 1 MB */
const MAX_IMAGES = 2;
const MAX_FILES = 2;
/** Messages sent to the AI; older ones are dropped */
const HISTORY = 12;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Titles mentioned with "@" in a user message, to highlight them */
  mentioned?: string[];
  /** Pictures attached to a user message (JPEG data URLs) */
  images?: string[];
  /** Text files attached to a user message */
  files?: TextAttachment[];
}

/**
 * Message text with the "@Title" mentions highlighted
 */
const WithMentions: React.FC<{ text: string; titles: string[] }> = ({ text, titles }) => {
  if (titles.length === 0) return <>{text}</>;
  const escaped = titles.map((title) => `@${title}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return (
    <>
      {text.split(new RegExp(`(${escaped.join('|')})`)).map((part, index) =>
        titles.some((title) => part === `@${title}`) ? (
          <span key={index} className="gchat-mention">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
};

/**
 * Assistant text: paragraphs, "-" bullets and **bold**
 */
const Reply: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/\n{2,}/).map((block, i) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
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

export const GrammarChat: React.FC<{ pointId: string }> = ({ pointId }) => {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [map, setMap] = useState<GrammarMap | null>(null);
  /** Points mentioned so far in the draft: id -> title shown after the "@" */
  const [mentions, setMentions] = useState<Record<string, string>>({});
  const [token, setToken] = useState<MentionToken | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [active, setActive] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [files, setFiles] = useState<TextAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let alive = true;
    loadGrammarMap()
      .then((loaded) => alive && setMap(loaded))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, busy]);

  const matches = useMemo(() => (map && token ? searchPoints(map, token.query, pointId) : []), [map, token, pointId]);
  const visible = matches.slice(0, shown);

  // A new search starts from the first page and the first result
  useEffect(() => {
    setShown(PAGE_SIZE);
    setActive(0);
  }, [token?.query]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, shown]);

  const syncToken = (value: string, caret: number) => setToken(mentionAt(value, caret));

  const pick = (id: string, title: string) => {
    if (!token) return;
    const caret = inputRef.current?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, token.start)}@${title} ${draft.slice(caret)}`;
    setDraft(next);
    setMentions((current) => ({ ...current, [id]: title }));
    setToken(null);
    const position = token.start + title.length + 2;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(position, position);
    });
  };

  /** Adds pictures and text files (chosen, pasted or dropped); pictures are shrunk first */
  const attach = async (picked: File[]) => {
    const pictures = picked.filter((file) => file.type.startsWith('image/')).slice(0, MAX_IMAGES - images.length);
    const texts = picked.filter(isTextFile).slice(0, MAX_FILES - files.length);
    if (picked.length === 0) return;
    setError(null);
    setImageError(false);
    try {
      if (pictures.length + texts.length === 0) throw new Error('Unsupported');
      const [urls, read] = await Promise.all([Promise.all(pictures.map(imageToDataUrl)), Promise.all(texts.map(readTextFile))]);
      setImages((current) => [...current, ...urls].slice(0, MAX_IMAGES));
      setFiles((current) => [...current, ...read].slice(0, MAX_FILES));
    } catch {
      setImageError(true);
    }
  };

  const send = useCallback(
    async (raw: string) => {
      const attached = images;
      const attachedFiles = files;
      const content = raw.trim() || (attached.length + attachedFiles.length > 0 ? t.grammar.chat.imageOnly : '');
      if (!content || busy) return;
      // Only the points still written in the message count
      const used = Object.entries(mentions).filter(([, title]) => content.includes(`@${title}`));
      const history: ChatMessage[] = [...messages, { role: 'user', content, mentioned: used.map(([, title]) => title), images: attached, files: attachedFiles }];
      setMessages(history);
      setDraft('');
      setMentions({});
      setImages([]);
      setFiles([]);
      setToken(null);
      setError(null);
      setBusy(true);
      try {
        const { reply } = await grammarApi.chat(
          history.slice(-HISTORY).map(({ role, content: text, images: pictures, files: texts }) => ({ role, content: text, images: pictures, files: texts })),
          pointId,
          used.map(([id]) => id)
        );
        setMessages((current) => [...current, { role: 'assistant', content: reply }]);
      } catch (failure) {
        setError(failure);
      } finally {
        setBusy(false);
      }
    },
    [busy, images, files, mentions, messages, pointId, t]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (token && visible.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((index) => (index + step + visible.length) % visible.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const chosen = visible[active];
        if (chosen) pick(chosen.id, chosen.title[locale]);
        return;
      }
    }
    if (token && event.key === 'Escape') {
      event.preventDefault();
      setToken(null);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  return (
    <>
      <button type="button" className="gchat-fab" onClick={() => setOpen(true)} aria-label={t.grammar.chat.open}>
        <Icon name="chat" size={20} /> <span>{t.grammar.chat.open}</span>
      </button>

      <aside className={`gchat ${open ? 'gchat--open' : ''}`} aria-label={t.grammar.chat.title}>
        <header className="gchat__head">
          <h2>
            <Icon name="sparkles" size={18} /> {t.grammar.chat.title}
          </h2>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              icon="plus"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
            >
              {t.grammar.chat.clear}
            </Button>
          )}
          <Button variant="ghost" size="sm" icon="x" className="gchat__close" aria-label={t.grammar.chat.close} onClick={() => setOpen(false)} />
        </header>

        <div className="gchat__log" ref={logRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="gchat__empty">
              <p>{t.grammar.chat.intro}</p>
              <div className="gchat__suggestions">
                {t.grammar.chat.suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" className="grammar-chip" onClick={() => void send(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className={`gchat__msg gchat__msg--${message.role}`}>
              {message.images && message.images.length > 0 && (
                <div className="gchat__pics">
                  {message.images.map((url, i) => (
                    <img key={i} src={url} alt="" />
                  ))}
                </div>
              )}
              {message.files && message.files.length > 0 && (
                <div className="gchat__pics">
                  {message.files.map((file, i) => (
                    <span key={i} className="gchat-file">
                      <Icon name="file" size={14} /> {file.name}
                    </span>
                  ))}
                </div>
              )}
              {message.role === 'user' ? <WithMentions text={message.content} titles={message.mentioned ?? []} /> : <Reply text={message.content} />}
            </div>
          ))}
          {busy && (
            <div className="gchat__msg gchat__msg--assistant">
              <Spinner size={18} />
            </div>
          )}
          {imageError && <Banner tone="danger">{t.grammar.chat.imageFailed}</Banner>}
          {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
        </div>

        <div className="gchat__composer">
          {token && (
            <div className="gchat-pop" role="listbox" aria-label={t.grammar.chat.mentionTitle}>
              {!map ? (
                <div className="gchat-pop__empty">
                  <Spinner size={16} />
                </div>
              ) : visible.length === 0 ? (
                <div className="gchat-pop__empty">{t.grammar.chat.noMatch}</div>
              ) : (
                <ul ref={listRef}>
                  {visible.map((point, index) => (
                    <li
                      key={point.id}
                      role="option"
                      aria-selected={index === active}
                      className={`gchat-pop__item ${index === active ? 'gchat-pop__item--active' : ''}`}
                      // Mouse down, not click, so the textarea keeps focus and its caret
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(point.id, point.title[locale]);
                      }}
                      onMouseEnter={() => setActive(index)}
                    >
                      <Icon name="graph" size={15} />
                      <span className="gchat-pop__title">{point.title[locale]}</span>
                      <Badge tone="reading">{point.cefr}</Badge>
                    </li>
                  ))}
                  {matches.length > shown && (
                    <li className="gchat-pop__more">
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setShown((n) => n + PAGE_SIZE);
                        }}
                      >
                        {t.grammar.chat.more(matches.length - shown)}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
          <div
            className={`gchat__box ${dragging ? 'gchat__box--drag' : ''}`}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('Files')) event.preventDefault();
            }}
            onDragEnter={(event) => {
              if (event.dataTransfer.types.includes('Files')) setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void attach([...event.dataTransfer.files]);
            }}
          >
            {(images.length > 0 || files.length > 0) && (
              <div className="gchat__thumbs">
                {images.map((url, index) => (
                  <div key={`i${index}`} className="gchat__thumb">
                    <img src={url} alt="" />
                    <button type="button" aria-label={t.grammar.chat.removeImage} onClick={() => setImages((current) => current.filter((_, i) => i !== index))}>
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
                {files.map((file, index) => (
                  <div key={`f${index}`} className="gchat__thumb gchat__thumb--file">
                    <Icon name="file" size={14} />
                    <span>{file.name}</span>
                    <button type="button" aria-label={t.grammar.chat.removeImage} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              className="gchat__input"
              rows={3}
              value={draft}
              maxLength={1200}
              placeholder={t.grammar.chat.placeholder}
              aria-label={t.grammar.chat.title}
              onChange={(event) => {
                setDraft(event.target.value);
                syncToken(event.target.value, event.target.selectionStart);
              }}
              onClick={(event) => syncToken(draft, event.currentTarget.selectionStart)}
              onKeyUp={(event) => {
                if (event.key.startsWith('Arrow') && !token) syncToken(draft, event.currentTarget.selectionStart);
              }}
              onPaste={(event) => {
                const pasted = [...event.clipboardData.files];
                if (pasted.length > 0) {
                  event.preventDefault();
                  void attach(pasted);
                }
              }}
              onBlur={() => setToken(null)}
              onKeyDown={onKeyDown}
            />
            <div className="gchat__bar">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,text/*,.md,.csv,.json,.srt,.vtt"
                multiple
                hidden
                onChange={(event) => {
                  void attach([...(event.target.files ?? [])]);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                className="gchat__icon-btn"
                aria-label={t.grammar.chat.attach}
                title={t.grammar.chat.attach}
                disabled={images.length >= MAX_IMAGES && files.length >= MAX_FILES}
                onClick={() => fileRef.current?.click()}
              >
                <Icon name="paperclip" size={18} />
              </button>
              <button
                type="button"
                className="gchat__send"
                aria-label={t.grammar.chat.send}
                title={t.grammar.chat.send}
                disabled={busy || (!draft.trim() && images.length + files.length === 0)}
                onClick={() => void send(draft)}
              >
                {busy ? <Spinner size={16} /> : <Icon name="arrowUp" size={18} />}
              </button>
            </div>
            {dragging && <div className="gchat__drop">{t.grammar.chat.drop}</div>}
          </div>
        </div>
      </aside>
    </>
  );
};
