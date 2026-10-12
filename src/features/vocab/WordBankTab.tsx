/**
 * WordBankTab
 * The learner's saved English words: add a word by looking it up, review them, practise and remove
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, EmptyState, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { contentApi, type WordDefinition } from '@/shared/contentApi';
import { enVocabApi, meaningOf, type SavedWord } from '@/shared/enVocabApi';
import { DefinitionSheet } from './DefinitionSheet';
import { SentencePractice, WordDetails } from './WordDetails';

export const WordBankTab: React.FC<{ onReview: () => void }> = ({ onReview }) => {
  const { t, formatDate } = useI18n();
  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [due, setDue] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<{ word: string; state: WordDefinition | 'loading' | { error: unknown } } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await enVocabApi.bank();
      setWords(data.words);
      setDue(data.due);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const lookUp = async (event: React.FormEvent) => {
    event.preventDefault();
    const word = query.trim();
    if (!word) return;
    setLookup({ word, state: 'loading' });
    try {
      const { definition } = await contentApi.define(word, '');
      setLookup({ word, state: definition });
    } catch (err) {
      setLookup({ word, state: { error: err } });
    }
  };

  const remove = async (itemId: string) => {
    await enVocabApi.remove(itemId);
    setWords((list) => list?.filter((w) => w.id !== itemId) ?? null);
  };

  return (
    <div className="word-bank">
      <p className="en-group__intro">{t.wordBank.bankIntro}</p>
      <Card padding="md">
        <form className="en-type word-bank__add" onSubmit={lookUp}>
          <input
            className="input"
            aria-label={t.wordBank.addLabel}
            placeholder={t.wordBank.addPlaceholder}
            value={query}
            maxLength={60}
            lang="en"
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" icon="sparkles" disabled={!query.trim()}>
            {t.wordBank.lookUp}
          </Button>
        </form>
      </Card>

      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {!words ? (
        error === null && <Spinner size={28} label={t.common.loading} />
      ) : words.length === 0 ? (
        <EmptyState icon="book" title={t.wordBank.tabs.bank}>
          {t.wordBank.bankEmpty}
        </EmptyState>
      ) : (
        <>
          <div>
            <Button icon="bolt" onClick={onReview}>
              {t.wordBank.reviewBank(due)}
            </Button>
          </div>
          <ul className="vocab-list__items">
            {words.map((word) => (
              <li key={word.id} className={`vocab-row vocab-row--${word.status}`}>
                <button type="button" className="vocab-row__head en-row__head" onClick={() => setOpen(open === word.id ? null : word.id)} aria-expanded={open === word.id}>
                  <span className="en-row__term" lang="en">
                    {word.term}
                  </span>
                  <span className="vocab-row__meaning">{meaningOf(word)}</span>
                  <Badge tone={word.status === 'mastered' ? 'success' : word.status === 'learning' ? 'warning' : 'neutral'}>{t.vocab.status[word.status]}</Badge>
                </button>
                {open === word.id && (
                  <div className="word-bank__detail">
                    <WordDetails word={word} />
                    {word.context && (
                      <p className="word-bank__context" lang="en">
                        “{word.context}”
                      </p>
                    )}
                    <p className="word-bank__meta">
                      {t.wordBank.sources[word.source]} · {formatDate(word.savedAt)}
                    </p>
                    <SentencePractice word={word} />
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => void remove(word.id)}>
                      {t.wordBank.remove}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {lookup && (
        <DefinitionSheet
          key={lookup.word}
          word={lookup.word}
          state={lookup.state}
          source="manual"
          onClose={() => {
            setLookup(null);
            setQuery('');
            void load();
          }}
        />
      )}
    </div>
  );
};
