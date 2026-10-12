/**
 * VocabPage
 * Japanese kanji and vocabulary decks (N5-N1) with spaced-repetition review and a browsable list
 */
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, PageHeader, ProgressBar, Segmented, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { speakOnce } from '@/shared/speech';
import { JaText } from '@/shared/ja/JaText';
import { ensureJapaneseFont } from '@/shared/ja/furigana';
import { JLPT_CONTENT_LEVELS, type JlptLevel } from '@/shared/contentApi';
import { formatKun, GRADES, spokenReading, vocabApi, type Deck, type DataSource, type Grade, type SessionCard, type VocabItem, type VocabKind } from '@/shared/vocabApi';
import { useJaLevel } from './useJaPractice';
import './vocab.css';

/** A learning card due within this many minutes comes back in the same session */
const REQUEUE_MINUTES = 20;

/**
 * "1 phút", "10 phút", "1 ngày", "4 ngày", "2 tháng"
 */
function useDuration() {
  const { t } = useI18n();
  return (minutes: number) => {
    if (minutes < 60) return t.vocab.minutes(Math.max(1, minutes));
    if (minutes < 60 * 24) return t.vocab.hours(Math.round(minutes / 60));
    const days = Math.round(minutes / (60 * 24));
    if (days < 31) return t.vocab.days(days);
    if (days < 365) return t.vocab.months(Math.round(days / 30));
    return t.vocab.years(Math.round((days / 365) * 10) / 10);
  };
}

/**
 * Reading, Sino-Vietnamese, meanings and example of a card
 */
const CardDetails: React.FC<{ item: VocabItem }> = ({ item }) => {
  const { t, locale } = useI18n();
  const meaning = locale === 'vi' && item.meaningVi ? item.meaningVi : item.meaningsEn.join(', ');
  return (
    <div className="vocab-back">
      {item.kind === 'word' && item.reading && item.reading !== item.term && (
        <p className="vocab-back__reading" lang="ja">
          {item.reading}
        </p>
      )}
      {item.hanViet && <p className="vocab-back__hanviet">{item.hanViet.toUpperCase()}</p>}
      <p className="vocab-back__meaning">{meaning}</p>
      {locale === 'vi' && item.meaningVi && (
        <p className="vocab-back__english" lang="en">
          {item.meaningsEn.join(', ')}
        </p>
      )}
      {item.kind === 'kanji' && (
        <dl className="vocab-back__readings">
          {item.readingsOn.length > 0 && (
            <>
              <dt>{t.vocab.on}</dt>
              <dd lang="ja">{item.readingsOn.join('、')}</dd>
            </>
          )}
          {item.readingsKun.length > 0 && (
            <>
              <dt>{t.vocab.kun}</dt>
              <dd lang="ja">{item.readingsKun.map(formatKun).join('、')}</dd>
            </>
          )}
          {item.strokes && (
            <>
              <dt>{t.vocab.strokes}</dt>
              <dd>{item.strokes}</dd>
            </>
          )}
        </dl>
      )}
      {item.example && (
        <p className="vocab-back__example">
          <JaText text={item.example} /> {item.exampleVi && <span className="vocab-back__example-vi">— {item.exampleVi}</span>}
        </p>
      )}
    </div>
  );
};

/**
 * One review session: show the front, reveal, grade; learning cards come back within the session
 */
const ReviewSession: React.FC<{ kind: VocabKind; level: JlptLevel; onDone: () => void }> = ({ kind, level, onDone }) => {
  const { t } = useI18n();
  const { record } = useProgress();
  const duration = useDuration();
  const [queue, setQueue] = useState<SessionCard[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [stats, setStats] = useState({ reviewed: 0, remembered: 0, total: 0 });
  const startedAt = useRef(Date.now());
  const recorded = useRef(false);

  useEffect(() => {
    vocabApi
      .session(kind, level)
      .then(({ cards }) => {
        setQueue(cards);
        setStats((s) => ({ ...s, total: cards.length }));
      })
      .catch(setError);
  }, [kind, level]);

  const current = queue?.[0];
  const finished = queue !== null && queue.length === 0;

  // Record the session once, when the queue empties
  useEffect(() => {
    if (!finished || recorded.current || stats.reviewed === 0) return;
    recorded.current = true;
    void record({
      activity: 'vocab',
      language: 'ja',
      contentRef: `${kind}-${level}`,
      title: `${kind === 'kanji' ? 'Kanji' : t.vocab.words} ${level}`,
      score: stats.remembered,
      maxScore: stats.reviewed,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
    }).catch(() => {});
  }, [finished, stats, record, kind, level, t]);

  const reveal = useCallback(() => {
    if (!current) return;
    setRevealed(true);
    speakOnce(spokenReading(current.item));
  }, [current]);

  const grade = useCallback(
    async (value: Grade) => {
      if (!current || busy) return;
      setBusy(true);
      setError(null);
      try {
        const result = await vocabApi.review(current.item.id, value);
        const minutes = (Date.parse(result.dueAt) - Date.now()) / 60_000;
        setStats((s) => ({ ...s, reviewed: s.reviewed + 1, remembered: s.remembered + (value === 'good' || value === 'easy' ? 1 : 0) }));
        setQueue((q) => {
          if (!q) return q;
          const rest = q.slice(1);
          if (minutes > REQUEUE_MINUTES) return rest;
          // Comes back a few cards later in this session
          const again = { ...current, isNew: false, previews: result.previews };
          const at = Math.min(rest.length, value === 'again' ? 3 : 6);
          return [...rest.slice(0, at), again, ...rest.slice(at)];
        });
        setRevealed(false);
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [current, busy]
  );

  // Keyboard: Space reveals, 1-4 grade
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        reveal();
      } else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        void grade(GRADES[Number(event.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, reveal, grade]);

  if (error !== null && !queue) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!queue) return <Spinner size={32} label={t.common.loading} />;

  if (finished) {
    return (
      <Card padding="lg" className="vocab-done reveal">
        <Icon name="check" size={40} />
        <h2>{stats.reviewed > 0 ? t.vocab.doneTitle : t.vocab.nothingDue}</h2>
        {stats.reviewed > 0 && <p>{t.vocab.doneBody(stats.reviewed, stats.remembered)}</p>}
        <Button icon="arrowLeft" onClick={onDone}>
          {t.vocab.backToDecks}
        </Button>
      </Card>
    );
  }

  const item = current!.item;
  return (
    <div className="vocab-session">
      <div className="vocab-session__top">
        <Button variant="ghost" size="sm" icon="x" onClick={onDone} aria-label={t.vocab.backToDecks} />
        <ProgressBar value={stats.total ? (Math.min(stats.reviewed, stats.total) / stats.total) * 100 : 0} tone="writing" size="sm" label={t.vocab.progress} />
        <span className="vocab-session__left">{t.vocab.left(queue.length)}</span>
      </div>

      <Card padding="lg" className={`vocab-card ${revealed ? 'vocab-card--revealed' : ''}`} key={`${item.id}-${stats.reviewed}`}>
        <div className="vocab-card__badges">
          <Badge tone="writing">{item.level}</Badge>
          {current!.isNew && <Badge tone="brand">{t.vocab.newCard}</Badge>}
        </div>
        <p className={`vocab-card__term vocab-card__term--${item.kind}`} lang="ja">
          {item.term}
        </p>
        {revealed ? (
          <>
            <button type="button" className="vocab-card__speak" onClick={() => speakOnce(spokenReading(item))} aria-label={t.chat.listen}>
              <Icon name="headphones" size={18} />
            </button>
            <CardDetails item={item} />
          </>
        ) : (
          <Button size="lg" onClick={reveal}>
            {t.vocab.show}
          </Button>
        )}
      </Card>

      {revealed && (
        <div className="vocab-grades">
          {GRADES.map((value, index) => (
            <button key={value} type="button" className={`vocab-grade vocab-grade--${value}`} onClick={() => void grade(value)} disabled={busy}>
              <span className="vocab-grade__label">{t.vocab.grades[value]}</span>
              <span className="vocab-grade__when">{duration(current!.previews[value])}</span>
              <kbd>{index + 1}</kbd>
            </button>
          ))}
        </div>
      )}
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      <p className="vocab-session__hint">{revealed ? t.vocab.gradeHint : t.vocab.revealHint}</p>
    </div>
  );
};

/**
 * Cards of a deck with their status
 */
const DeckList: React.FC<{ kind: VocabKind; level: JlptLevel; onBack: () => void }> = ({ kind, level, onBack }) => {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<Awaited<ReturnType<typeof vocabApi.items>>['items']>([]);
  const [next, setNext] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const page = await vocabApi.items(kind, level, offset);
      setItems((current) => (offset === 0 ? page.items : [...current, ...page.items]));
      setNext(page.nextOffset);
    } finally {
      setLoading(false);
    }
  }, [kind, level]);

  useEffect(() => {
    void load(0);
  }, [load]);

  return (
    <div className="vocab-list">
      <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
        {t.vocab.backToDecks}
      </Button>
      <ul className="vocab-list__items">
        {items.map((item) => (
          <li key={item.id} className={`vocab-row vocab-row--${item.status}`}>
            <button type="button" className="vocab-row__head" onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}>
              <span className="vocab-row__term" lang="ja">
                {item.term}
              </span>
              <span className="vocab-row__reading" lang="ja">
                {item.kind === 'word' ? item.reading : item.readingsOn[0]}
              </span>
              <span className="vocab-row__meaning">{locale === 'vi' && item.meaningVi ? item.meaningVi : item.meaningsEn.slice(0, 2).join(', ')}</span>
              <Badge tone={item.status === 'mastered' ? 'success' : item.status === 'learning' ? 'warning' : 'neutral'}>{t.vocab.status[item.status]}</Badge>
            </button>
            {open === item.id && <CardDetails item={item} />}
          </li>
        ))}
      </ul>
      {next !== null && (
        <Button variant="secondary" onClick={() => void load(next)} loading={loading}>
          {t.vocab.more}
        </Button>
      )}
    </div>
  );
};

/**
 * Data sources, as the KANJIDIC2 licence asks for on screens showing its data
 */
const Attribution: React.FC<{ source: DataSource | null }> = ({ source }) => {
  const { t } = useI18n();
  return (
    <p className="vocab-attribution">
      {t.vocab.sources} KANJIDIC2 © EDRDG{source ? ` (${source.kanjidic})` : ''},{' '}
      <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer">
        CC BY-SA 4.0
      </a>
      ; JLPT: J. Waller / kanji-data (MIT); {t.vocab.words}: open-anki-jlpt-decks (MIT). {t.vocab.aiNote}
    </p>
  );
};

export const VocabPage: React.FC = () => {
  const { t } = useI18n();
  const { level: goal } = useJaLevel();
  const [level, setLevel] = useState<JlptLevel>(goal);
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);
  const [mode, setMode] = useState<{ type: 'review' | 'list'; kind: VocabKind } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);

  useEffect(ensureJapaneseFont, []);
  useEffect(() => {
    vocabApi
      .decks()
      .then((data) => {
        setDecks(data.decks);
        setSource(data.source);
      })
      .catch(setError);
  }, [reload]);

  const levelDecks = useMemo(() => decks?.filter((d) => d.level === level) ?? [], [decks, level]);
  const back = () => {
    setMode(null);
    setReload((n) => n + 1);
  };

  if (mode?.type === 'review') return <ReviewSession kind={mode.kind} level={level} onDone={back} />;
  if (mode?.type === 'list') return <DeckList kind={mode.kind} level={level} onBack={back} />;

  return (
    <div className="vocab">
      <PageHeader eyebrow="日本語" title={t.skills.activities.vocab.title} description={t.vocab.intro} />
      <Segmented<JlptLevel>
        label={t.dashboard.level}
        value={level}
        onChange={setLevel}
        options={JLPT_CONTENT_LEVELS.map((l) => ({ value: l, label: l, tone: 'writing' }))}
      />
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {!decks ? (
        <Spinner size={30} label={t.common.loading} />
      ) : (
        <div className="vocab-decks">
          {levelDecks.map((deck) => (
            <Card key={deck.kind} padding="lg" className="vocab-deck reveal">
              <div className="vocab-deck__head">
                <span className="vocab-deck__glyph" lang="ja">
                  {deck.kind === 'kanji' ? '字' : '語'}
                </span>
                <div>
                  <h2 className="vocab-deck__title">{deck.kind === 'kanji' ? 'Kanji' : t.vocab.words}</h2>
                  <p className="vocab-deck__meta">{t.vocab.deckMeta(deck.total, deck.seen, deck.mastered)}</p>
                </div>
              </div>
              <ProgressBar value={deck.total ? (deck.seen / deck.total) * 100 : 0} tone="writing" size="sm" label={t.vocab.progress} />
              <div className="vocab-deck__counts">
                <Badge tone={deck.due > 0 ? 'warning' : 'neutral'}>{t.vocab.due(deck.due)}</Badge>
                <Badge tone="brand">{t.vocab.newToday(deck.newAvailable)}</Badge>
              </div>
              <div className="vocab-deck__actions">
                <Button icon="bolt" onClick={() => setMode({ type: 'review', kind: deck.kind })} disabled={deck.due + deck.newAvailable === 0}>
                  {deck.due > 0 ? t.vocab.review : t.vocab.learn}
                </Button>
                <Button variant="ghost" onClick={() => setMode({ type: 'list', kind: deck.kind })}>
                  {t.vocab.browse}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Attribution source={source} />
    </div>
  );
};
