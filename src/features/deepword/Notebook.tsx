/**
 * Notebook
 * The words a learner studied in depth, with their stage; filter by stage or search by word.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Banner, Button, EmptyState, Skeleton, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { meaningOf, type EnWord } from '@/shared/enVocabApi';
import { ASPECTS, deepWordApi, type Aspect, type DeepProgress } from '@/shared/deepWordApi';
import './deepword.css';

export const Notebook: React.FC<{ onBack: () => void; onOpenWord: (itemId: string) => void }> = ({ onBack, onOpenWord }) => {
  const { t } = useI18n();
  const n = t.deepWord.notebook;
  const [stage, setStage] = useState<number | undefined>();
  const [weak, setWeak] = useState<Aspect | undefined>();
  const [query, setQuery] = useState('');
  const [words, setWords] = useState<(EnWord & { progress: DeepProgress })[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      deepWordApi
        .notebook(stage, query.trim() || undefined, weak)
        .then((r) => setWords(r.words))
        .catch(setError);
    }, 200);
    return () => clearTimeout(handle);
  }, [stage, query, weak]);

  return (
    <div className="dw">
      <div className="dw__row dw__row--between">
        <h2 className="dw__title">{n.title}</h2>
        <div className="dw__row">
          <a className="btn btn--ghost btn--md" href={deepWordApi.exportUrl} download>
            <span>{n.exportCsv}</span>
          </a>
          <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
            {n.back}
          </Button>
        </div>
      </div>
      <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={n.search} aria-label={n.search} />
      <div className="dw__filters" role="group" aria-label={n.title}>
        <button type="button" className="dw__chip" aria-pressed={stage === undefined} onClick={() => setStage(undefined)}>
          {n.all}
        </button>
        {t.deepWord.stageNames.map((name, i) => (
          <button key={name} type="button" className="dw__chip" aria-pressed={stage === i + 1} onClick={() => setStage(i + 1)}>
            {name}
          </button>
        ))}
      </div>
      <div className="dw__filters" role="group" aria-label={n.weakTitle}>
        <span className="dw__muted">{n.weakTitle}:</span>
        <button type="button" className="dw__chip" aria-pressed={weak === undefined} onClick={() => setWeak(undefined)}>
          {n.weakAny}
        </button>
        {ASPECTS.map((aspect) => (
          <button key={aspect} type="button" className="dw__chip" aria-pressed={weak === aspect} onClick={() => setWeak(aspect)}>
            {t.deepWord.aspects[aspect]}
          </button>
        ))}
      </div>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {!words ? (
        <Skeleton height={120} label={t.common.loading} />
      ) : words.length === 0 ? (
        <EmptyState icon="book" title={n.title}>
          {n.empty}
        </EmptyState>
      ) : (
        <ul className="dw__list">
          {words.map((w) => (
            <li key={w.id} className="dw__item">
              <button type="button" className="dw__item-main dw__chip" style={{ textAlign: 'left', borderRadius: 12 }} onClick={() => onOpenWord(w.id)}>
                <strong lang="en">{w.term}</strong> <span className="dw__muted">{meaningOf(w)}</span>
              </button>
              <span className="dw__stage-badge">
                {w.progress.stage}/5 · {t.deepWord.stageNames[w.progress.stage - 1]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
