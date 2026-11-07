/**
 * WordPage
 * Everything about one word studied in depth: how well it is known (form, meaning, use), its notes, the learner's own
 * sentences and the words they connected to it.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, Skeleton } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { meaningOf } from '@/shared/enVocabApi';
import { deepWordApi, type WordPageData } from '@/shared/deepWordApi';
import { DepthBars, StageLadder } from './DepthMeter';
import './deepword.css';

export const WordPage: React.FC<{ itemId: string; onBack: () => void; onStudy: (itemId: string) => void; onOpenWord: (itemId: string) => void }> = ({ itemId, onBack, onStudy, onOpenWord }) => {
  const { t, locale } = useI18n();
  const w = t.deepWord.word;
  const [data, setData] = useState<WordPageData | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    deepWordApi.word(itemId).then(setData).catch(setError);
  }, [itemId]);

  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' });

  if (error !== null) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!data) return <Skeleton height={200} label={t.common.loading} />;

  const { word, content, progress } = data;
  return (
    <div className="dw">
      <div>
        <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
          {w.back}
        </Button>
      </div>

      <Card padding="lg" className="dw__card">
        <div className="dw__row">
          <span className="dw__term" lang="en">
            {word.term}
            {word.ipa && <span className="dw__ipa">/{word.ipa}/</span>}
          </span>
          {word.pos && <Badge>{word.pos}</Badge>}
        </div>
        <p>{meaningOf(word)}</p>
        {progress ? (
          <>
            <StageLadder stage={progress.stage} />
            {progress.nextReviewAt && <p className="dw__muted">{w.nextReview(date(progress.nextReviewAt))}</p>}
          </>
        ) : (
          <div className="dw__row">
            <span className="dw__muted">{w.notStarted}</span>
            {data.queued ? <Badge>{w.queued}</Badge> : null}
            <Button onClick={() => onStudy(word.id)}>{w.study}</Button>
          </div>
        )}
      </Card>

      {progress && (
        <Card padding="lg" className="dw__card">
          <h2 className="dw__h">{w.depth}</h2>
          <DepthBars cells={progress.cells} />
        </Card>
      )}

      {content && (
        <Card padding="lg" className="dw__card">
          <h2 className="dw__h">{w.meaning}</h2>
          <p lang="en">{content.simpleDefinition}</p>
          {content.contrast.map((c) => (
            <p key={c.word}>
              <strong>
                {w.differs} <span lang="en">{c.word}</span>:
              </strong>{' '}
              {locale === 'vi' ? c.differenceVi : c.difference}
            </p>
          ))}
          <h2 className="dw__h">{w.use}</h2>
          <p lang="en">{content.coreUse}</p>
          <div className="dw__section">
            <strong>{w.collocations}</strong>
            {content.collocations.map((c) => (
              <div key={c.phrase} className="dw__colloc" lang="en">
                <b>{c.phrase}</b> · {c.example}
              </div>
            ))}
          </div>
          <p>
            <strong>{w.register}:</strong> <span lang="en">{content.register}</span>
          </p>
          {content.wordFamily.length > 0 && (
            <p>
              <strong>{w.family}:</strong> <span lang="en">{content.wordFamily.join(', ')}</span>
            </p>
          )}
          {content.status === 'ai' && <p className="dw__muted">{w.aiNote}</p>}
        </Card>
      )}

      <Card padding="lg" className="dw__card">
        <h2 className="dw__h">{w.mySentences}</h2>
        {data.sentences.length === 0 ? (
          <p className="dw__muted">{w.noSentences}</p>
        ) : (
          <ul className="dw__list">
            {data.sentences.map((s) => (
              <li key={s.id} className="dw__item">
                <div className="dw__item-main">
                  <span lang="en">{s.text}</span>
                  {s.improved && s.improved !== s.text && (
                    <span className="dw__muted" lang="en">
                      {' '}
                      → {s.improved}
                    </span>
                  )}
                </div>
                <span className="dw__muted">{date(s.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="lg" className="dw__card">
        <h2 className="dw__h">{w.related}</h2>
        {data.links.length === 0 ? (
          <p className="dw__muted">{w.noRelated}</p>
        ) : (
          <div className="dw__filters">
            {data.links.map((l) => (
              <button key={l.id} type="button" className="dw__chip" lang="en" onClick={() => onOpenWord(l.id)}>
                {l.term}
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
