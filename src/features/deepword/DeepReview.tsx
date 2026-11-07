/**
 * DeepReview
 * A short review of words studied in depth: one exercise per word (recall, fill in, fix the sentence, write a
 * sentence), a different kind each time, then the result by aspect.
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, Spinner } from '@/design';
import { useCurrentUser } from '@/app/AuthProvider';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { ActivityProgress } from '@/features/practice/ActivityProgress';
import { useI18n } from '@/i18n/I18nProvider';
import { tasksLeft } from '@/shared/billingApi';
import { errorMessage } from '@/shared/http';
import { speakOnce } from '@/shared/speech';
import { ASPECTS, cellOf, deepWordApi, markIssues, type Aspect, type ReviewAnswer, type ReviewItem } from '@/shared/deepWordApi';
import { DepthGrid, StageLadder } from './DepthMeter';
import './deepword.css';

/** The aspect each kind of exercise practises */
const ASPECT_OF = { recall: 'meaning', cloze: 'form', fix: 'use', sentence: 'use' } as const;

type Done = { item: ReviewItem; answer: ReviewAnswer };

/** One exercise and, after it is answered, how it went */
const Exercise: React.FC<{ item: ReviewItem; creditsOut: boolean; onDone: (answer: ReviewAnswer) => void }> = ({ item, creditsOut, onDone }) => {
  const { t, locale } = useI18n();
  const d = t.deepWord;
  const r = d.review;
  const ex = item.exercise;
  const [text, setText] = useState('');
  const [ticks, setTicks] = useState<boolean[]>(() => d.session.s4.selfItems.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [answer, setAnswer] = useState<ReviewAnswer | null>(null);
  const selfCheck = ex.kind === 'sentence' && creditsOut;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const reply = await deepWordApi.answer({
        itemId: item.word.id,
        kind: ex.kind,
        ref: 'ref' in ex ? ex.ref : undefined,
        answer: text.trim(),
        selfCheck: selfCheck ? { ticked: ticks.filter(Boolean).length, total: ticks.length } : undefined,
      });
      setAnswer(reply);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const verdictText = answer ? (answer.assisted ? r.helped : answer.result === 'pass' ? r.right : answer.result === 'partial' ? r.almost : r.wrong) : '';
  const placeholder = ex.kind === 'fix' ? r.fix.placeholder : ex.kind === 'sentence' ? r.sentence.placeholder : r.recall.placeholder;
  const multiline = ex.kind === 'fix' || ex.kind === 'sentence';

  return (
    <div className="dw__card">
      <div className="dw__row">
        <Badge tone="brand">{r.kinds[ex.kind]}</Badge>
        <span className="dw__muted">{r.practising(d.aspects[ASPECT_OF[ex.kind] as Aspect])}</span>
        <Button variant="ghost" size="sm" icon="headphones" aria-label={d.session.s1.listen} onClick={() => speakOnce(item.word.term)} />
      </div>

      {ex.kind === 'recall' && (
        <>
          <h2 className="dw__h">{r.recall.ask}</h2>
          <p className="dw__sentence" lang="en">
            {ex.definition}
          </p>
          {item.word.meaningVi && locale === 'vi' && <p className="dw__muted">{item.word.meaningVi}</p>}
          <p className="dw__muted">{ex.pos ? `${ex.pos} · ` : ''}{r.hint(ex.first, ex.length)}</p>
        </>
      )}
      {ex.kind === 'cloze' && (
        <>
          <h2 className="dw__h">{r.cloze.ask}</h2>
          <p className="dw__sentence" lang="en">
            {ex.text}
          </p>
          {ex.vi && locale === 'vi' && <p className="dw__muted">{ex.vi}</p>}
          <p className="dw__muted">{r.hint(ex.first, ex.length)}</p>
        </>
      )}
      {ex.kind === 'fix' && (
        <>
          <h2 className="dw__h">{r.fix.ask}</h2>
          <p className="dw__sentence dw__flag" lang="en" style={{ display: 'block' }}>
            {ex.wrong}
          </p>
        </>
      )}
      {ex.kind === 'sentence' && (
        <>
          <h2 className="dw__h">{r.sentence.ask(item.word.term)}</h2>
          {ex.firstSentence && <p className="dw__note dw__note--warn">{r.sentence.first}</p>}
          {ex.topic && <p className="dw__muted">{r.sentence.topic(ex.topic)}</p>}
        </>
      )}

      {!answer && (
        <>
          {multiline ? (
            <textarea className="dw__textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} rows={3} maxLength={400} lang="en" />
          ) : (
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} lang="en" autoCapitalize="off" autoComplete="off" spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && text.trim() && void submit()} />
          )}
          {selfCheck && (
            <fieldset className="dw__section" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="dw__h">{d.session.s4.selfTitle}</legend>
              {d.session.s4.selfItems.map((label, i) => (
                <label key={label} className="dw__item">
                  <input type="checkbox" checked={ticks[i]} onChange={() => setTicks(ticks.map((v, j) => (j === i ? !v : v)))} /> {label}
                </label>
              ))}
            </fieldset>
          )}
          <Button size="lg" onClick={() => void submit()} loading={busy} disabled={busy || text.trim().length < (multiline ? 3 : 1)}>
            {r.check}
          </Button>
        </>
      )}

      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      {answer && (
        <div className="dw__section" aria-live="polite">
          <p className={`dw__note ${answer.result === 'pass' && !answer.assisted ? 'dw__note--ok' : 'dw__note--warn'}`}>
            <strong>{verdictText}</strong>
          </p>
          {ex.kind === 'fix' && (
            <>
              <p className="dw__fb-sentence" lang="en">
                {markIssues(text, answer.check?.issues ?? []).map((part, i) =>
                  part.issue ? (
                    <span key={i} className="dw__flag">
                      {part.text}
                      <sup>[{part.issue}]</sup>
                    </span>
                  ) : (
                    <span key={i}>{part.text}</span>
                  )
                )}
              </p>
              {answer.explanation.right && (
                <div className="dw__core">
                  <p className="dw__kicker">{r.rightSentence}</p>
                  <span lang="en">{answer.explanation.right}</span>
                  {answer.explanation.note && (
                    <span className="dw__muted">
                      {r.why}: {answer.explanation.note}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
          {(ex.kind === 'recall' || ex.kind === 'cloze') && answer.result !== 'pass' && answer.explanation.answer && <p>{r.answerWas(answer.explanation.answer)}</p>}
          {ex.kind === 'sentence' && answer.check && (
            <>
              <p>{answer.check.feedback}</p>
              {answer.check.improved && (
                <div className="dw__core">
                  <p className="dw__kicker">{r.better}</p>
                  <span lang="en">{answer.check.improved}</span>
                </div>
              )}
            </>
          )}
          <Button size="lg" icon="chevronRight" className="dw__next" onClick={() => onDone(answer)}>
            {r.next}
          </Button>
        </div>
      )}
    </div>
  );
};

export const DeepReview: React.FC<{ onExit: () => void; onOpenWord: (itemId: string) => void }> = ({ onExit, onOpenWord }) => {
  const { t, locale } = useI18n();
  const user = useCurrentUser();
  const r = t.deepWord.review;
  const creditsOut = (tasksLeft(user.credits, 'writing') ?? 1) <= 0;
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [welcomeBack, setWelcomeBack] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Done[]>([]);
  const [round, setRound] = useState(0);

  const load = useCallback(() => {
    deepWordApi
      .review(!creditsOut)
      .then((reply) => {
        setItems(reply.items);
        setWelcomeBack(reply.welcomeBack);
      })
      .catch(setError);
  }, [creditsOut]);

  useEffect(() => {
    load();
  }, [load, round]);

  const again = () => {
    setItems(null);
    setIndex(0);
    setDone([]);
    setRound((n) => n + 1);
  };

  if (error !== null && !items) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!items) return <Spinner size={30} label={t.common.loading} />;

  const finished = items.length > 0 && index >= items.length;
  if (items.length === 0 || finished) {
    const date = (iso: string) => new Date(iso).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'numeric' });
    return (
      <div className="dw">
        <Card padding="lg" className="dw__card reveal">
          <Icon name="check" size={36} />
          <h2 className="dw__title">{items.length === 0 ? r.none : r.results.title}</h2>
          {items.length === 0 ? <p className="dw__muted">{r.noneBody}</p> : <p>{r.results.body(done.length)}</p>}
          {done.map(({ item, answer }) => {
            const moved = ASPECTS.filter((a) => cellOf(answer.progress.cells, a, 'p') > cellOf(answer.cellsBefore, a, 'p') || cellOf(answer.progress.cells, a, 'r') > cellOf(answer.cellsBefore, a, 'r'));
            return (
              <div key={item.word.id} className="dw__section">
                <div className="dw__row dw__row--between">
                  <button type="button" className="dw__chip" lang="en" onClick={() => onOpenWord(item.word.id)}>
                    {item.word.term}
                  </button>
                  <span className="dw__muted">
                    {r.results.outcomes[answer.outcome]}
                    {answer.progress.nextReviewAt ? ` · ${r.results.next(date(answer.progress.nextReviewAt))}` : ''}
                  </span>
                </div>
                <StageLadder stage={answer.progress.stage} />
                <DepthGrid cells={answer.progress.cells} before={answer.cellsBefore} />
                <p className="dw__muted">
                  {r.results.changed}: {moved.length ? moved.map((a) => `${t.deepWord.aspects[a]} ${r.results.moved}`).join(', ') : r.results.same}
                </p>
              </div>
            );
          })}
          <div className="dw__row">
            <Button onClick={onExit}>{r.results.back}</Button>
            {items.length > 0 && (
              <Button variant="secondary" onClick={again}>
                {r.results.more}
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const item = items[index];
  return (
    <div className="dw">
      <PracticeHeader title={r.title} level={null} onBack={onExit} />
      <ActivityProgress label={r.progress(index + 1, items.length)} index={index} total={items.length} />
      {welcomeBack && index === 0 && <Banner tone="info">{r.welcomeBack}</Banner>}
      {creditsOut && <Banner tone="info">{r.noAi}</Banner>}
      <Card padding="lg" key={item.word.id}>
        <Exercise
          item={item}
          creditsOut={creditsOut}
          onDone={(answer) => {
            setDone((list) => [...list, { item, answer }]);
            setIndex((i) => i + 1);
            window.scrollTo({ top: 0 });
          }}
        />
      </Card>
    </div>
  );
};
