/**
 * EnVocabPage
 * English vocabulary decks (core CEFR, TOEIC, IELTS academic) with spaced repetition.
 * Questions get harder as a word is remembered: meaning → word → listening → fill in the example.
 */
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, PageHeader, ProgressBar, Spinner, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { speakOnce } from '@/shared/speech';
import { vocabApi, type Grade } from '@/shared/vocabApi';
import {
  choiceMeanings,
  enVocabApi,
  formInExample,
  meaningOf,
  questionMode,
  sameWord,
  type EnCard,
  type EnDeck,
  type EnDeckGroup,
  type EnWord,
  type QuestionMode,
} from '@/shared/enVocabApi';
import './vocab.css';

/** A card due within this many minutes comes back in the same session */
const REQUEUE_MINUTES = 20;
const GROUPS: EnDeckGroup[] = ['core', 'toeic', 'ielts'];

interface QueuedCard extends EnCard {
  /** Answered wrong in this session: asked the easy way again */
  relearning?: boolean;
}

/**
 * Word, pronunciation, meanings, collocations and example
 */
const WordDetails: React.FC<{ word: EnWord }> = ({ word }) => {
  const { t, locale } = useI18n();
  return (
    <div className="vocab-back en-word">
      <p className="en-word__head">
        <span className="en-word__term" lang="en">
          {word.term}
        </span>
        <button type="button" className="vocab-card__speak en-word__speak" onClick={() => speakOnce(word.term)} aria-label={t.chat.listen}>
          <Icon name="headphones" size={18} />
        </button>
      </p>
      <p className="en-word__meta">
        {word.ipa && <span className="en-word__ipa">/{word.ipa}/</span>}
        {word.pos && <span>{t.enVocab.pos[word.pos as keyof typeof t.enVocab.pos] ?? word.pos}</span>}
        {word.cefr && <Badge tone="reading">{word.cefr}</Badge>}
      </p>
      {word.meaningVi && <p className="vocab-back__meaning">{word.meaningVi}</p>}
      {word.meaningsEn[0] && (
        <p className={word.meaningVi ? 'vocab-back__english' : 'vocab-back__meaning'} lang="en">
          {word.meaningsEn[0]}
        </p>
      )}
      {word.collocations.length > 0 && (
        <p className="en-word__collocations" lang="en">
          {word.collocations.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </p>
      )}
      {word.example && (
        <p className="vocab-back__example">
          <span lang="en">{word.example}</span>
          {word.exampleVi && locale === 'vi' && <span className="vocab-back__example-vi"> — {word.exampleVi}</span>}
        </p>
      )}
    </div>
  );
};

/** Small string hash for a stable shuffle */
const hash = (text: string) => [...text].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);

/**
 * One question; reports whether the answer was right
 */
const Question: React.FC<{ card: QueuedCard; mode: QuestionMode; onAnswer: (correct: boolean, given: string) => void }> = ({ card, mode, onAnswer }) => {
  const { t } = useI18n();
  const word = card.item;
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Choices in a fixed random order for this question
  const choices = useMemo(() => {
    const meanings = choiceMeanings(card);
    const list = mode === 'recognize' ? [meanings.answer, ...meanings.wrong] : [word.term, ...card.distractors.map((d) => d.term)];
    // Order changes from one review to the next but stays put while the question is shown
    return list.map((text, i) => ({ text, correct: i === 0 })).sort((a, b) => hash(`${word.id}:${card.reps}:${a.text}`) - hash(`${word.id}:${card.reps}:${b.text}`));
  }, [card, mode, word]);

  const clozeForm = mode === 'cloze' && word.example ? formInExample(word.example, word.term) : null;

  useEffect(() => {
    if (mode === 'listen') speakOnce(word.term);
    if (mode === 'listen' || mode === 'cloze') inputRef.current?.focus();
  }, [mode, word.term]);

  // Number keys pick a choice
  useEffect(() => {
    if (mode !== 'recognize' && mode !== 'recall') return;
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      if (index >= 0 && index < choices.length) onAnswer(choices[index].correct, choices[index].text);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, choices, onAnswer]);

  if (mode === 'recognize' || mode === 'recall') {
    return (
      <div className="en-question">
        <p className="en-question__ask">{mode === 'recognize' ? t.enVocab.askMeaning : t.enVocab.askWord}</p>
        {mode === 'recognize' ? (
          <p className="vocab-card__term vocab-card__term--word" lang="en">
            {word.term}
          </p>
        ) : (
          <p className="en-question__meaning">{meaningOf(word)}</p>
        )}
        {mode === 'recognize' && word.ipa && <p className="en-word__ipa">/{word.ipa}/</p>}
        <div className="en-choices">
          {choices.map((choice, i) => (
            <button key={i} type="button" className="en-choice" onClick={() => onAnswer(choice.correct, choice.text)} lang={mode === 'recall' ? 'en' : undefined}>
              <kbd>{i + 1}</kbd>
              <span>{choice.text}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const answer = clozeForm ?? word.term;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!typed.trim()) return;
    onAnswer(sameWord(typed, answer) || sameWord(typed, word.term), typed.trim());
  };

  return (
    <form className="en-question" onSubmit={submit}>
      <p className="en-question__ask">{mode === 'listen' ? t.enVocab.askListen : t.enVocab.askCloze}</p>
      {mode === 'listen' ? (
        <Button type="button" variant="secondary" icon="headphones" onClick={() => speakOnce(word.term)}>
          {t.enVocab.playAgain}
        </Button>
      ) : (
        <>
          <p className="en-question__sentence" lang="en">
            {word.example!.split(clozeForm ?? '\u0000').map((piece, i, all) => (
              <span key={i}>
                {piece}
                {i < all.length - 1 && <span className="en-blank">{'_'.repeat(Math.max(4, answer.length))}</span>}
              </span>
            ))}
          </p>
          <p className="en-question__hint">{meaningOf(word)}</p>
        </>
      )}
      <div className="en-type">
        <TextInput
          ref={inputRef}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label={t.enVocab.typeHere}
          placeholder={t.enVocab.typeHere}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          lang="en"
        />
        <Button type="submit" disabled={!typed.trim()}>
          {t.enVocab.check}
        </Button>
      </div>
    </form>
  );
};

/**
 * One session: new words are introduced, then every card is asked; answers grade the card
 */
const Session: React.FC<{ deck: EnDeck; onDone: () => void }> = ({ deck, onDone }) => {
  const { t } = useI18n();
  const { record } = useProgress();
  const [queue, setQueue] = useState<QueuedCard[] | null>(null);
  const [phase, setPhase] = useState<'intro' | 'question' | 'feedback'>('question');
  const [result, setResult] = useState<{ correct: boolean; given: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [stats, setStats] = useState({ answered: 0, correct: 0, total: 0 });
  const startedAt = useRef(Date.now());
  const recorded = useRef(false);
  const nextQueue = useRef<QueuedCard[]>([]);

  useEffect(() => {
    enVocabApi
      .session(deck.id)
      .then(({ cards }) => {
        setQueue(cards);
        setStats((s) => ({ ...s, total: cards.length }));
        setPhase(cards[0]?.isNew ? 'intro' : 'question');
      })
      .catch(setError);
  }, [deck.id]);

  const current = queue?.[0];
  const finished = queue !== null && queue.length === 0;
  const mode = current ? questionMode(current, Boolean(current.relearning)) : 'recognize';

  useEffect(() => {
    if (!finished || recorded.current || stats.answered === 0) return;
    recorded.current = true;
    void record({
      activity: 'en-vocab',
      contentRef: deck.id,
      title: `${t.enVocab.groups[deck.group]} ${deck.label}`,
      score: stats.correct,
      maxScore: stats.answered,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
    }).catch(() => {});
  }, [finished, stats, record, deck, t]);

  const answer = useCallback(
    async (correct: boolean, given: string) => {
      if (!current || busy) return;
      setBusy(true);
      setError(null);
      const grade: Grade = correct ? 'good' : 'again';
      try {
        const reviewed = await vocabApi.review(current.item.id, grade);
        const minutes = (Date.parse(reviewed.dueAt) - Date.now()) / 60_000;
        setStats((s) => ({ ...s, answered: s.answered + 1, correct: s.correct + (correct ? 1 : 0) }));
        // The card stays on screen for feedback; the queue moves on when the learner continues
        const rest = queue!.slice(1);
        if (minutes > REQUEUE_MINUTES) nextQueue.current = rest;
        else {
          const again: QueuedCard = { ...current, isNew: false, relearning: !correct, reps: correct ? current.reps + 1 : 0, previews: reviewed.previews };
          const at = Math.min(rest.length, correct ? 5 : 2);
          nextQueue.current = [...rest.slice(0, at), again, ...rest.slice(at)];
        }
        setResult({ correct, given });
        setPhase('feedback');
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [current, busy, queue]
  );

  const next = useCallback(() => {
    const rest = nextQueue.current;
    setResult(null);
    setQueue(rest);
    setPhase(rest[0]?.isNew ? 'intro' : 'question');
  }, []);

  // Enter moves on from the intro and the feedback
  useEffect(() => {
    if (phase === 'question') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (phase === 'intro') setPhase('question');
      else next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, next]);

  if (error !== null && !queue) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!queue) return <Spinner size={32} label={t.common.loading} />;

  if (finished) {
    return (
      <Card padding="lg" className="vocab-done reveal">
        <Icon name="check" size={40} />
        <h2>{stats.answered > 0 ? t.vocab.doneTitle : t.vocab.nothingDue}</h2>
        {stats.answered > 0 && <p>{t.enVocab.doneBody(stats.answered, stats.correct)}</p>}
        <Button icon="arrowLeft" onClick={onDone}>
          {t.vocab.backToDecks}
        </Button>
      </Card>
    );
  }

  const card = current!;
  const left = phase === 'feedback' ? nextQueue.current.length : queue.length;
  return (
    <div className="vocab-session">
      <div className="vocab-session__top">
        <Button variant="ghost" size="sm" icon="x" onClick={onDone} aria-label={t.vocab.backToDecks} />
        <ProgressBar value={stats.total ? (Math.min(stats.answered, stats.total) / stats.total) * 100 : 0} tone="reading" size="sm" label={t.vocab.progress} />
        <span className="vocab-session__left">{t.vocab.left(left)}</span>
      </div>

      <Card padding="lg" className="vocab-card en-card" key={`${card.item.id}-${stats.answered}-${phase}`}>
        <div className="vocab-card__badges">
          <Badge tone="reading">{`${t.enVocab.groups[deck.group]} ${deck.label}`}</Badge>
          {phase === 'intro' && <Badge tone="brand">{t.vocab.newCard}</Badge>}
        </div>

        {phase === 'intro' && (
          <>
            <WordDetails word={card.item} />
            <Button size="lg" onClick={() => setPhase('question')}>
              {t.enVocab.gotIt}
            </Button>
          </>
        )}

        {phase === 'question' && <Question key={card.item.id + stats.answered} card={card} mode={mode} onAnswer={(c, g) => void answer(c, g)} />}

        {phase === 'feedback' && result && (
          <>
            <p className={`en-result en-result--${result.correct ? 'right' : 'wrong'}`}>
              <Icon name={result.correct ? 'check' : 'x'} size={20} />
              {result.correct ? t.enVocab.right : t.enVocab.wrong(result.given)}
            </p>
            <WordDetails word={card.item} />
            <Button size="lg" icon="chevronRight" onClick={next}>
              {t.enVocab.continue}
            </Button>
          </>
        )}
      </Card>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      <p className="vocab-session__hint">
        {phase !== 'question' ? t.enVocab.enterHint : mode === 'recognize' || mode === 'recall' ? t.enVocab.questionHint : t.enVocab.typeHint}
      </p>
    </div>
  );
};

/**
 * Words of a deck with their status
 */
const DeckList: React.FC<{ deck: EnDeck; onBack: () => void }> = ({ deck, onBack }) => {
  const { t } = useI18n();
  const [items, setItems] = useState<Awaited<ReturnType<typeof enVocabApi.items>>['items']>([]);
  const [next, setNext] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const page = await enVocabApi.items(deck.id, offset);
        setItems((current) => (offset === 0 ? page.items : [...current, ...page.items]));
        setNext(page.nextOffset);
      } finally {
        setLoading(false);
      }
    },
    [deck.id]
  );

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
            <button type="button" className="vocab-row__head en-row__head" onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}>
              <span className="en-row__term" lang="en">
                {item.term}
              </span>
              <span className="vocab-row__meaning">{meaningOf(item)}</span>
              <Badge tone={item.status === 'mastered' ? 'success' : item.status === 'learning' ? 'warning' : 'neutral'}>{t.vocab.status[item.status]}</Badge>
            </button>
            {open === item.id && <WordDetails word={item} />}
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

export const EnVocabPage: React.FC = () => {
  const { t } = useI18n();
  const [decks, setDecks] = useState<EnDeck[] | null>(null);
  const [mode, setMode] = useState<{ type: 'review' | 'list'; deck: EnDeck } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    enVocabApi
      .decks()
      .then((data) => setDecks(data.decks))
      .catch(setError);
  }, [reload]);

  const back = () => {
    setMode(null);
    setReload((n) => n + 1);
  };

  if (mode?.type === 'review') return <Session deck={mode.deck} onDone={back} />;
  if (mode?.type === 'list') return <DeckList deck={mode.deck} onBack={back} />;

  const due = decks?.reduce((sum, d) => sum + d.due, 0) ?? 0;
  return (
    <div className="vocab">
      <PageHeader eyebrow="Vocabulary" title={t.skills.activities.enVocab.title} description={t.enVocab.intro} />
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {decks && due > 0 && <Banner tone="info">{t.enVocab.dueBanner(due)}</Banner>}
      {!decks ? (
        <Spinner size={30} label={t.common.loading} />
      ) : (
        GROUPS.map((group) => (
          <section key={group} className="en-group">
            <h2 className="en-group__title">{t.enVocab.groups[group]}</h2>
            <p className="en-group__intro">{t.enVocab.groupIntros[group]}</p>
            <div className="vocab-decks">
              {decks
                .filter((deck) => deck.group === group)
                .map((deck) => (
                  <Card key={deck.id} padding="lg" className="vocab-deck reveal">
                    <div className="vocab-deck__head">
                      <span className="vocab-deck__glyph en-deck__glyph">{deck.label}</span>
                      <div>
                        <h3 className="vocab-deck__title">{`${t.enVocab.groups[group]} ${deck.label}`}</h3>
                        <p className="vocab-deck__meta">{t.vocab.deckMeta(deck.total, deck.seen, deck.mastered)}</p>
                      </div>
                    </div>
                    <ProgressBar value={deck.total ? (deck.seen / deck.total) * 100 : 0} tone="reading" size="sm" label={t.vocab.progress} />
                    <div className="vocab-deck__counts">
                      <Badge tone={deck.due > 0 ? 'warning' : 'neutral'}>{t.vocab.due(deck.due)}</Badge>
                      <Badge tone="brand">{t.vocab.newToday(deck.newAvailable)}</Badge>
                    </div>
                    <div className="vocab-deck__actions">
                      <Button icon="bolt" onClick={() => setMode({ type: 'review', deck })} disabled={deck.due + deck.newAvailable === 0}>
                        {deck.due > 0 ? t.vocab.review : t.vocab.learn}
                      </Button>
                      <Button variant="ghost" onClick={() => setMode({ type: 'list', deck })}>
                        {t.vocab.browse}
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          </section>
        ))
      )}
      <p className="vocab-attribution">
        {t.vocab.sources} NGSL, TSL &amp; NAWL (Browne, Culligan &amp; Phillips,{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        ); CEFR-J Wordlist 1.5 (Tono, TUFS) &amp; Octanove C1/C2; CMU Pronouncing Dictionary; {t.enVocab.examples}: Tatoeba (CC BY 2.0 FR).{' '}
        {t.vocab.aiNote}
      </p>
    </div>
  );
};
