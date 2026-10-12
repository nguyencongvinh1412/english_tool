/**
 * MatchGame
 * Timed game: match six words with their meanings (Quizlet-style). The best time is kept in this browser.
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Card, Icon, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { enVocabApi } from '@/shared/enVocabApi';

const BEST_KEY = 'english-tool:match-best';
/** How long a wrong pair stays red */
const MISS_MS = 500;

type Pair = { id: string; term: string; meaning: string };
type Tile = { id: string; text: string; side: 'term' | 'meaning' };

function readBest(): number | null {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Seconds since a timestamp */
const secondsSince = (start: number) => (Date.now() - start) / 1000;

/** Shuffles a copy */
function shuffled<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const MatchGame: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useI18n();
  const { record } = useProgress();
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [columns, setColumns] = useState<{ terms: Tile[]; meanings: Tile[] }>({ terms: [], meanings: [] });
  const [selected, setSelected] = useState<Tile | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [miss, setMiss] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [finishedIn, setFinishedIn] = useState<number | null>(null);
  const [best, setBest] = useState<number | null>(readBest);
  const [error, setError] = useState<unknown>(null);

  const start = useCallback(async () => {
    setError(null);
    setPairs(null);
    try {
      const { pairs: loaded } = await enVocabApi.match();
      setPairs(loaded);
      setColumns({
        terms: shuffled(loaded.map((p) => ({ id: p.id, text: p.term, side: 'term' as const }))),
        meanings: shuffled(loaded.map((p) => ({ id: p.id, text: p.meaning, side: 'meaning' as const }))),
      });
      setMatched(new Set());
      setSelected(null);
      setMistakes(0);
      setFinishedIn(null);
      const t0 = Date.now();
      setStartedAt(t0);
      setNow(t0);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    // Load the first round once; later rounds start from the button
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
  }, [start]);

  // Clock while playing
  useEffect(() => {
    if (!pairs || finishedIn !== null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [pairs, finishedIn]);

  const choose = (tile: Tile) => {
    if (matched.has(tile.id) || finishedIn !== null) return;
    if (!selected || selected.side === tile.side) {
      setSelected(tile);
      return;
    }
    if (selected.id === tile.id) {
      const next = new Set(matched).add(tile.id);
      setMatched(next);
      setSelected(null);
      if (pairs && next.size === pairs.length) {
        const seconds = secondsSince(startedAt);
        setFinishedIn(seconds);
        if (!best || seconds < best) {
          setBest(seconds);
          try {
            localStorage.setItem(BEST_KEY, String(seconds));
          } catch {
            // Storage unavailable: the record lasts for this page only
          }
        }
        void record({
          activity: 'en-vocab',
          contentRef: 'match',
          title: t.wordBank.matchTitle,
          score: pairs.length,
          maxScore: pairs.length + mistakes,
          durationSec: Math.round(seconds),
        }).catch(() => {});
      }
    } else {
      setMistakes((n) => n + 1);
      setMiss([selected.id + selected.side, tile.id + tile.side]);
      setSelected(null);
      setTimeout(() => setMiss([]), MISS_MS);
    }
  };

  const seconds = ((finishedIn ?? (now - startedAt) / 1000) || 0).toFixed(1);
  const tile = (item: Tile) => {
    const state = matched.has(item.id) ? 'done' : miss.includes(item.id + item.side) ? 'miss' : selected === item ? 'selected' : '';
    return (
      <button
        key={item.id + item.side}
        type="button"
        className={`match-tile ${state ? `match-tile--${state}` : ''}`}
        onClick={() => choose(item)}
        disabled={state === 'done'}
        lang={item.side === 'term' ? 'en' : undefined}
      >
        {item.text}
      </button>
    );
  };

  return (
    <Card padding="lg" className="match">
      <div className="match__head">
        <h2 className="match__title">{t.wordBank.matchTitle}</h2>
        <span className="match__clock">{t.wordBank.matchTime(seconds)}</span>
        {best && <span className="match__best">{t.wordBank.matchBest(best.toFixed(1))}</span>}
        <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label={t.common.close} />
      </div>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {!pairs ? (
        error === null && <Spinner size={28} label={t.common.loading} />
      ) : finishedIn !== null ? (
        <div className="match__done">
          <Icon name="check" size={36} />
          <p>{t.wordBank.matchDone(finishedIn.toFixed(1), mistakes)}</p>
          <Button icon="bolt" onClick={() => void start()}>
            {t.wordBank.matchAgain}
          </Button>
        </div>
      ) : (
        <div className="match__board">
          <div className="match__column" aria-label={t.wordBank.matchWords}>
            {columns.terms.map(tile)}
          </div>
          <div className="match__column" aria-label={t.wordBank.matchMeanings}>
            {columns.meanings.map(tile)}
          </div>
        </div>
      )}
    </Card>
  );
};
