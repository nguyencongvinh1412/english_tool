/**
 * EnVocabPage
 * English vocabulary: decks (core CEFR, TOEIC, IELTS academic) with spaced repetition, today's mixed
 * review, the match game, the learner's saved words and statistics
 */
import { useStageName } from '@/features/roadmap/useStageName';
import { WordStatusBadge } from './WordStatusBadge';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Banner, Button, Card, Icon, MasteryBar, Skeleton, Tabs, Tag } from '@/design';
import { ROUTES } from '@/app/routes';
import { hasRoadmap, roadmapApi, type Stage } from '@/shared/roadmapApi';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { enVocabApi, meaningOf, type EnDeck, type EnDeckGroup } from '@/shared/enVocabApi';
import { Session } from './EnVocabSession';
import { MatchGame } from './MatchGame';
import { WordBankTab } from './WordBankTab';
import { VocabStatsTab } from './VocabStatsTab';
import { WordDetails } from './WordDetails';
import { DeepTab, type DeepView } from '@/features/deepword/DeepTab';
import { DeepSession } from '@/features/deepword/DeepSession';
import { DeepReview } from '@/features/deepword/DeepReview';
import { WordPage } from '@/features/deepword/WordPage';
import { Notebook } from '@/features/deepword/Notebook';
import './vocab.css';

const GROUPS: EnDeckGroup[] = ['core', 'toeic', 'ielts'];
type Tab = 'decks' | 'bank' | 'stats' | 'deep';

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
              {item.ipa && <span className="en-row__ipa">/{item.ipa}/</span>}
              <span className="vocab-row__meaning">{meaningOf(item)}</span>
              <WordStatusBadge status={item.status} />
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
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'deep' ? 'deep' : 'decks');
  const [deepView, setDeepView] = useState<DeepView>(params.get('tab') !== 'deep' ? { type: 'overview' } : params.get('start') === '1' ? { type: 'session' } : params.get('review') === '1' ? { type: 'review' } : { type: 'overview' });
  const [decks, setDecks] = useState<EnDeck[] | null>(null);
  const [dueTotal, setDueTotal] = useState(0);
  const [view, setView] = useState<{ type: 'review'; deckId: string; title: string } | { type: 'list'; deck: EnDeck } | { type: 'match' } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  /** Levels of the roadmap's stages, to mark the decks it asks for */
  const [roadmapLevels, setRoadmapLevels] = useState<string[]>([]);
  /** The stage the learner is in now: its level and name */
  const [currentStage, setCurrentStage] = useState<Stage | null>(null);
  const stageName = useStageName();
  const stage = currentStage ? { level: currentStage.level, name: stageName(currentStage) } : null;

  useEffect(() => {
    enVocabApi
      .decks()
      .then((data) => {
        setDecks(data.decks);
        setDueTotal(data.dueTotal);
      })
      .catch(setError);
  }, [reload]);

  useEffect(() => {
    roadmapApi
      .get()
      .then((data) => {
        setRoadmapLevels(hasRoadmap(data) ? [...new Set(data.roadmap.stages.map((s) => s.level))] : []);
        const current = hasRoadmap(data) ? data.roadmap.stages[data.progress.current] : null;
        setCurrentStage(current && current.kind === 'level' ? current : null);
      })
      .catch(() => {});
  }, []);

  const back = useCallback(() => {
    setView(null);
    setReload((n) => n + 1);
  }, []);

  const deckTitle = (deck: EnDeck) => `${t.enVocab.groups[deck.group]} ${deck.label}`;
  const reviewDaily = () => setView({ type: 'review', deckId: 'en-daily', title: t.wordBank.dailyTitle });
  const minutes = Math.min(10, Math.max(3, Math.ceil(dueTotal / 4)));
  /** New words still available today in the deck of the stage's level */
  const roadmapNew = stage ? (decks?.find((d) => d.group === 'core' && d.label === stage.level)?.newAvailable ?? null) : null;

  if (view?.type === 'review') return <Session deckId={view.deckId} title={view.title} onDone={back} />;
  if (view?.type === 'list') return <DeckList deck={view.deck} onBack={back} />;
  if (tab === 'deep' && deepView.type === 'review') {
    return <DeepReview onExit={() => setDeepView({ type: 'overview' })} onOpenWord={(itemId) => setDeepView({ type: 'word', itemId })} />;
  }
  if (tab === 'deep' && deepView.type === 'session') {
    return <DeepSession itemId={deepView.itemId} onExit={() => setDeepView({ type: 'overview' })} onOpenWord={(itemId) => setDeepView({ type: 'word', itemId })} />;
  }

  return (
    <div className="vocab">
      <header className="plan__head">
        <Link to={ROUTES.PRACTICE} className="plan__back" aria-label={t.nav.practice}>
          <Icon name="arrowLeft" size={20} />
        </Link>
        <h1>{t.enVocab.pageTitle}</h1>
      </header>
      {error !== null && <Banner tone="warning">{errorMessage(error, t)}</Banner>}

      <Tabs<Tab>
        label={t.skills.activities.enVocab.title}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'decks', label: t.wordBank.tabs.decks },
          { id: 'bank', label: t.wordBank.tabs.bank },
          { id: 'stats', label: t.wordBank.tabs.stats },
          { id: 'deep', label: t.deepWord.tab },
        ]}
      />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`} className="vocab__panel">
        {tab === 'bank' && <WordBankTab onReview={() => setView({ type: 'review', deckId: 'en-bank', title: t.wordBank.tabs.bank })} />}
        {tab === 'deep' && deepView.type === 'word' && (
          <WordPage key={deepView.itemId} itemId={deepView.itemId} onBack={() => setDeepView({ type: 'overview' })} onStudy={(itemId) => setDeepView({ type: 'session', itemId })} onOpenWord={(itemId) => setDeepView({ type: 'word', itemId })} />
        )}
        {tab === 'deep' && deepView.type === 'notebook' && <Notebook onBack={() => setDeepView({ type: 'overview' })} onOpenWord={(itemId) => setDeepView({ type: 'word', itemId })} />}
        {tab === 'deep' && (deepView.type === 'overview' || deepView.type === 'setup') && <DeepTab view={deepView} onView={setDeepView} />}
        {tab === 'stats' && <VocabStatsTab onReviewHard={() => setView({ type: 'review', deckId: 'en-hard', title: t.wordBank.statsHard })} />}
        {tab === 'decks' && (
          <>
            <Card padding="md" className="vocab-today">
              <div className="vocab-today__text">
                <span className="vocab-today__label">{t.enVocab.todayLabel}</span>
                <strong className="vocab-today__title">{dueTotal > 0 ? t.enVocab.todayLine(dueTotal, minutes) : t.enVocab.todayNone}</strong>
                {dueTotal === 0 && <span className="vocab-today__note">{t.enVocab.todayNoneBody}</span>}
                {roadmapNew !== null && stage && <span className="vocab-today__note">{t.enVocab.fromRoadmapLine(roadmapNew, stage.name)}</span>}
              </div>
              {dueTotal > 0 && (
                <Button size="lg" onClick={reviewDaily} className="vocab-today__cta">
                  {t.enVocab.reviewToday(dueTotal)}
                </Button>
              )}
            </Card>

            {!decks ? (
              <Skeleton height={120} label={t.common.loading} />
            ) : (
              GROUPS.map((group) => (
                <section key={group} className="en-group">
                  <h2 className="en-group__title">{t.enVocab.groups[group]}</h2>
                  <p className="en-group__intro">{t.enVocab.groupIntros[group]}</p>
                  <div className="vocab-decks">
                    {decks
                      .filter((deck) => deck.group === group)
                      .map((deck) => (
                        <Card key={deck.id} padding="md" className="vocab-deck">
                          <div className="vocab-deck__head">
                            <div>
                              <h3 className="vocab-deck__title">{deckTitle(deck)}</h3>
                              <p className="vocab-deck__meta">{deck.total === 0 ? t.enVocab.deckEmpty : deck.seen === 0 ? t.enVocab.deckNew(deck.total) : t.enVocab.deckLine(deck.mastered, deck.total)}</p>
                            </div>
                            {deck.group === 'core' && roadmapLevels.includes(deck.label) && <Tag tone="brand">{t.enVocab.fromRoadmap}</Tag>}
                          </div>
                          <MasteryBar
                            mastered={deck.mastered}
                            good={deck.good}
                            learning={Math.max(0, deck.seen - deck.mastered - deck.good)}
                            fresh={Math.max(0, deck.total - deck.seen)}
                            labels={t.enVocab.mastery}
                          />
                          <div className="vocab-deck__counts">
                            <Badge tone={deck.due > 0 ? 'warning' : 'neutral'}>{t.vocab.due(deck.due)}</Badge>
                            <Badge tone="brand">{t.vocab.newToday(deck.newAvailable)}</Badge>
                          </div>
                          <div className="vocab-deck__actions">
                            <Button variant="secondary" icon="bolt" onClick={() => setView({ type: 'review', deckId: deck.id, title: deckTitle(deck) })} disabled={deck.due + deck.newAvailable === 0}>
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
            )}

            <Card padding="md" className="vocab-match">
              <div>
                <h2 className="en-action__title">{t.wordBank.matchTitle}</h2>
                <p className="en-action__body">{t.wordBank.matchBody}</p>
              </div>
              <Button variant="secondary" onClick={() => setView({ type: 'match' })}>
                {t.wordBank.matchStart}
              </Button>
            </Card>
            {view?.type === 'match' && <MatchGame onClose={back} />}
          </>
        )}
      </div>

      {tab === 'decks' && dueTotal > 0 && (
        <div className="vocab__cta">
          <Button size="lg" block onClick={reviewDaily}>
            {t.enVocab.reviewToday(dueTotal)}
          </Button>
        </div>
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
