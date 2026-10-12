/**
 * EnVocabPage
 * English vocabulary: decks (core CEFR, TOEIC, IELTS academic) with spaced repetition, today's mixed
 * review, the match game, the learner's saved words and statistics
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, PageHeader, ProgressBar, Spinner, Tabs } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { enVocabApi, meaningOf, type EnDeck, type EnDeckGroup } from '@/shared/enVocabApi';
import { Session } from './EnVocabSession';
import { MatchGame } from './MatchGame';
import { WordBankTab } from './WordBankTab';
import { VocabStatsTab } from './VocabStatsTab';
import { WordDetails } from './WordDetails';
import './vocab.css';

const GROUPS: EnDeckGroup[] = ['core', 'toeic', 'ielts'];
type Tab = 'decks' | 'bank' | 'stats';

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
  const [tab, setTab] = useState<Tab>('decks');
  const [decks, setDecks] = useState<EnDeck[] | null>(null);
  const [dueTotal, setDueTotal] = useState(0);
  const [view, setView] = useState<{ type: 'review'; deckId: string; title: string } | { type: 'list'; deck: EnDeck } | { type: 'match' } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    enVocabApi
      .decks()
      .then((data) => {
        setDecks(data.decks);
        setDueTotal(data.dueTotal);
      })
      .catch(setError);
  }, [reload]);

  const back = useCallback(() => {
    setView(null);
    setReload((n) => n + 1);
  }, []);

  const deckTitle = (deck: EnDeck) => `${t.enVocab.groups[deck.group]} ${deck.label}`;

  if (view?.type === 'review') return <Session deckId={view.deckId} title={view.title} onDone={back} />;
  if (view?.type === 'list') return <DeckList deck={view.deck} onBack={back} />;

  return (
    <div className="vocab">
      <PageHeader eyebrow="Vocabulary" title={t.skills.activities.enVocab.title} description={t.enVocab.intro} />
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      <div className="en-actions">
        <Card padding="lg" className="en-action en-action--daily">
          <Icon name="bolt" size={26} />
          <div>
            <h2 className="en-action__title">{t.wordBank.dailyTitle}</h2>
            <p className="en-action__body">{t.wordBank.dailyBody(dueTotal)}</p>
          </div>
          <Button onClick={() => setView({ type: 'review', deckId: 'en-daily', title: t.wordBank.dailyTitle })} disabled={dueTotal === 0}>
            {t.wordBank.dailyStart}
          </Button>
        </Card>
        <Card padding="lg" className="en-action">
          <Icon name="sparkles" size={26} />
          <div>
            <h2 className="en-action__title">{t.wordBank.matchTitle}</h2>
            <p className="en-action__body">{t.wordBank.matchBody}</p>
          </div>
          <Button variant="secondary" onClick={() => setView({ type: 'match' })}>
            {t.wordBank.matchStart}
          </Button>
        </Card>
      </div>
      {view?.type === 'match' && <MatchGame onClose={back} />}

      <Tabs<Tab>
        label={t.skills.activities.enVocab.title}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'decks', label: t.wordBank.tabs.decks },
          { id: 'bank', label: t.wordBank.tabs.bank },
          { id: 'stats', label: t.wordBank.tabs.stats },
        ]}
      />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'bank' && <WordBankTab onReview={() => setView({ type: 'review', deckId: 'en-bank', title: t.wordBank.tabs.bank })} />}
        {tab === 'stats' && <VocabStatsTab />}
        {tab === 'decks' &&
          (!decks ? (
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
                            <h3 className="vocab-deck__title">{deckTitle(deck)}</h3>
                            <p className="vocab-deck__meta">{t.vocab.deckMeta(deck.total, deck.seen, deck.mastered)}</p>
                          </div>
                        </div>
                        <ProgressBar value={deck.total ? (deck.seen / deck.total) * 100 : 0} tone="reading" size="sm" label={t.vocab.progress} />
                        <div className="vocab-deck__counts">
                          <Badge tone={deck.due > 0 ? 'warning' : 'neutral'}>{t.vocab.due(deck.due)}</Badge>
                          <Badge tone="brand">{t.vocab.newToday(deck.newAvailable)}</Badge>
                        </div>
                        <div className="vocab-deck__actions">
                          <Button
                            icon="bolt"
                            onClick={() => setView({ type: 'review', deckId: deck.id, title: deckTitle(deck) })}
                            disabled={deck.due + deck.newAvailable === 0}
                          >
                            {deck.due > 0 ? t.vocab.review : t.vocab.learn}
                          </Button>
                          <Button variant="ghost" onClick={() => setView({ type: 'list', deck })}>
                            {t.vocab.browse}
                          </Button>
                        </div>
                      </Card>
                    ))}
                </div>
              </section>
            ))
          ))}
      </div>

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
