/**
 * The five stages of a Deep Word session: meet, understand, context and use, produce, connect.
 * Each stage reports what the learner did (for the depth of the word) and asks the session to move on.
 */
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Banner, Button, Tag } from '@/design';
import { useCurrentUser } from '@/app/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { tasksLeft } from '@/shared/billingApi';
import { ApiRequestError, errorMessage, PLAN_CODES } from '@/shared/http';
import { speakOnce } from '@/shared/speech';
import { formInExample, meaningOf, type EnWord } from '@/shared/enVocabApi';
import { deepWordApi, markIssues, type DeepProgress, type SentenceCheck, type SessionStart, type Verdict } from '@/shared/deepWordApi';

type Result = 'pass' | 'partial' | 'fail';
type Report = (kind: 'guess' | 'recall' | 'listen', aspect: 'form' | 'meaning' | 'use', result: Result, assisted?: boolean) => void;

/** A sentence with the studied word (in any of its forms) marked */
const Marked: React.FC<{ sentence: string; term: string }> = ({ sentence, term }) => {
  const form = formInExample(sentence, term);
  if (!form) return <>{sentence}</>;
  const at = sentence.toLowerCase().indexOf(form.toLowerCase());
  return (
    <>
      {sentence.slice(0, at)}
      <mark>{sentence.slice(at, at + form.length)}</mark>
      {sentence.slice(at + form.length)}
    </>
  );
};

const shuffle = <T,>(items: T[]): T[] => [...items].sort(() => Math.random() - 0.5);

/* ---------- 1. Meet ---------- */

export const StageMeet: React.FC<{ data: SessionStart; report: Report; onNext: () => void }> = ({ data, report, onNext }) => {
  const { t } = useI18n();
  const s = t.deepWord.session.s1;
  const { word, content, choices } = data;
  const options = useMemo(() => shuffle([choices.answer, ...choices.wrong]), [choices]);
  const [picked, setPicked] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<'right' | 'wrong' | 'unsure' | null>(null);
  const [listened, setListened] = useState(false);
  const sentence = word.example ?? content.examples[0]?.text ?? null;

  const listen = () => {
    speakOnce(word.term);
    if (!listened) {
      setListened(true);
      report('listen', 'form', 'pass');
    }
  };
  const check = () => {
    if (picked === null) return;
    const right = picked === choices.answer;
    setOutcome(right ? 'right' : 'wrong');
    report('guess', 'meaning', right ? 'pass' : 'fail');
  };
  const unsure = () => {
    setOutcome('unsure');
    report('guess', 'meaning', 'partial', true);
  };

  return (
    <div className="dw__card">
      <div className="dw__row">
        <span className="dw__term" lang="en">
          {word.term}
          {word.ipa && <span className="dw__ipa">/{word.ipa}/</span>}
        </span>
        {word.pos && <Badge>{word.pos}</Badge>}
        <Button variant="secondary" size="sm" icon="headphones" onClick={listen}>
          {s.listen}
        </Button>
      </div>

      {sentence && (
        <div className="dw__section">
          <p className="dw__kicker">{s.context}</p>
          <p className="dw__sentence" lang="en">
            <Marked sentence={sentence} term={word.term} />
          </p>
        </div>
      )}

      <h2 className="dw__h">{s.ask(word.term)}</h2>
      <fieldset className="dw__choices" role="radiogroup" disabled={outcome !== null}>
        <legend className="dw__muted">{sentence ? s.hint : s.noContext}</legend>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={picked === option}
            className={`dw__choice ${outcome && option === choices.answer ? 'is-right' : ''}`}
            onClick={() => setPicked(option)}
            lang={choices.lang}
          >
            {option}
          </button>
        ))}
      </fieldset>

      {outcome === null ? (
        <div className="dw__row">
          <Button onClick={check} disabled={picked === null}>
            {s.check}
          </Button>
          <Button variant="ghost" onClick={unsure}>
            {s.unsure}
          </Button>
        </div>
      ) : (
        <>
          {outcome !== 'unsure' && <p className={`dw__note ${outcome === 'right' ? 'dw__note--ok' : ''}`}>{outcome === 'right' ? s.right : s.wrong}</p>}
          <div className="dw__core">
            <p className="dw__kicker">{s.core}</p>
            <strong>{meaningOf(word)}</strong>
            <span className="dw__muted">{content.simpleDefinition}</span>
          </div>
          <Button size="lg" icon="chevronRight" className="dw__next" onClick={onNext}>
            {s.next}
          </Button>
        </>
      )}
    </div>
  );
};

/* ---------- 2. Understand ---------- */

export const StageUnderstand: React.FC<{ data: SessionStart; onNext: () => void }> = ({ data, onNext }) => {
  const { t, locale } = useI18n();
  const s = t.deepWord.session.s2;
  const { content, beginner } = data;
  return (
    <div className="dw__card">
      <div className="dw__section">
        <p className="dw__kicker">{s.definition}</p>
        <p className="dw__sentence" lang="en">
          {content.simpleDefinition}
        </p>
        {content.synonyms.length > 0 && (
          <p>
            <strong>{s.synonyms}:</strong> <span lang="en">{content.synonyms.join(', ')}</span>
          </p>
        )}
        {content.antonyms.length > 0 && (
          <p>
            <strong>{s.antonyms}:</strong> <span lang="en">{content.antonyms.join(', ')}</span>
          </p>
        )}
      </div>

      {!beginner &&
        content.contrast.map((c) => (
          <div key={c.word} className="dw__contrast">
            <strong>
              {s.differs('')}
              <span lang="en">{c.word}</span>
            </strong>
            <span>{locale === 'vi' ? c.differenceVi : c.difference}</span>
          </div>
        ))}

      <div className="dw__core">
        <p className="dw__kicker">{s.use}</p>
        <span lang="en">{content.coreUse}</span>
      </div>
      <Button size="lg" icon="chevronRight" className="dw__next" onClick={onNext}>
        {s.next}
      </Button>
    </div>
  );
};

/* ---------- 3. Context and use ---------- */

export const StageContext: React.FC<{ data: SessionStart; report: Report; saved: Record<string, unknown>; onSave: (data: Record<string, unknown>) => void; onNext: () => void }> = ({ data, report, saved, onSave, onNext }) => {
  const { t, locale } = useI18n();
  const s = t.deepWord.session.s3;
  const { word, content, beginner } = data;
  const [typed, setTyped] = useState('');
  const [state, setState] = useState<'hidden' | 'recalled' | 'revealed'>(saved.recall === 'recalled' ? 'recalled' : saved.recall === 'revealed' ? 'revealed' : 'hidden');

  /** Words that go with the term in the collocations; a typed answer that has one of them counts as remembered */
  const partners = useMemo(() => {
    const term = word.term.toLowerCase().replace(/e$/, '');
    return content.collocations.flatMap((c) => c.phrase.toLowerCase().split(/\s+/)).filter((w) => w.length > 2 && !w.startsWith(term));
  }, [content.collocations, word.term]);

  const check = () => {
    const tokens = typed.toLowerCase().split(/[^a-z']+/).filter(Boolean);
    const hit = tokens.some((w) => partners.includes(w));
    setState(hit ? 'recalled' : 'revealed');
    onSave({ recall: hit ? 'recalled' : 'revealed' });
    report('recall', 'use', hit ? 'pass' : 'partial', false);
  };
  const reveal = () => {
    setState('revealed');
    onSave({ recall: 'revealed' });
    report('recall', 'use', 'partial', true);
  };

  const examples = [
    ...(word.example ? [{ text: word.example, vi: word.exampleVi ?? '', real: true }] : []),
    ...content.examples.map((e) => ({ ...e, real: false })),
  ].slice(0, beginner ? 3 : 5);

  return (
    <div className="dw__card">
      <div className="dw__section">
        <p className="dw__kicker">{s.examples}</p>
        <ul className="dw__list">
          {examples.map((e) => (
            <li key={e.text} className="dw__item">
              <div className="dw__item-main">
                <p className="dw__sentence" lang="en">
                  <Marked sentence={e.text} term={word.term} />
                </p>
                {locale === 'vi' && e.vi && <span className="dw__muted">{e.vi}</span>}
              </div>
              <Tag tone={e.real ? 'reading' : 'neutral'}>{e.real ? s.real : s.ai}</Tag>
            </li>
          ))}
        </ul>
      </div>

      <div className="dw__section">
        <h2 className="dw__h">{s.collocations}</h2>
        {state === 'hidden' ? (
          <>
            <div className="dw__veil">
              <strong>{s.recallTitle}</strong>
              <p>{s.recallBody(word.term)}</p>
              <textarea className="dw__textarea" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={s.recallPlaceholder} aria-label={s.recallTitle} rows={2} lang="en" />
              <p className="dw__muted">{s.recallNote}</p>
            </div>
            <div className="dw__row">
              <Button onClick={check} disabled={typed.trim().length < 2}>
                {s.recallCheck}
              </Button>
              <Button variant="ghost" onClick={reveal}>
                {s.reveal}
              </Button>
            </div>
          </>
        ) : (
          <>
            {state === 'recalled' && <p className="dw__note dw__note--ok">{s.recalled}</p>}
            {content.collocations.map((c) => (
              <div key={c.phrase} className="dw__colloc" lang="en">
                <b>{c.phrase}</b> · {c.example}
              </div>
            ))}
          </>
        )}
      </div>

      {state !== 'hidden' && (
        <>
          <div className="dw__section">
            <h2 className="dw__h">{s.usage}</h2>
            {word.pos && (
              <p>
                <strong>{word.pos}</strong> · <span lang="en">{content.coreUse}</span>
              </p>
            )}
            {!beginner && (
              <p>
                <strong>{s.register}:</strong> <span lang="en">{content.register}</span>
              </p>
            )}
            {content.wordFamily.length > 0 && (
              <p>
                <strong>{s.family}:</strong> <span lang="en">{content.wordFamily.join(', ')}</span>
              </p>
            )}
          </div>
          <Button size="lg" icon="chevronRight" className="dw__next" onClick={onNext}>
            {s.next}
          </Button>
        </>
      )}
    </div>
  );
};

/* ---------- 4. Produce ---------- */

const PLAN_OR_QUOTA = [...PLAN_CODES, 'quota_exceeded'];

export const StageProduce: React.FC<{
  data: SessionStart;
  progress: DeepProgress;
  onProgress: (progress: DeepProgress) => void;
  onNext: () => void;
  onDeferred: (progress: DeepProgress) => void;
}> = ({ data, progress, onProgress, onNext, onDeferred }) => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const s = t.deepWord.session.s4;
  const word = data.word;
  const creditsOut = (tasksLeft(user.credits, 'writing') ?? 1) <= 0;
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'write' | 'checking' | 'result' | 'self'>(creditsOut ? 'self' : 'write');
  const [result, setResult] = useState<{ check: SentenceCheck; verdict: Verdict; sentence: string } | null>(null);
  const [ticks, setTicks] = useState<boolean[]>(() => s.selfItems.map(() => false));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const topic = data.profile.work ? s.topic(data.profile.work) : s.topicDefault;
  const done = progress.cells.useP >= 1;

  const check = async () => {
    setBusy(true);
    setError(null);
    setPhase('checking');
    try {
      const reply = await deepWordApi.produce(word.id, text.trim());
      setResult({ check: reply.check, verdict: reply.verdict, sentence: text.trim() });
      onProgress(reply.progress);
      setPhase('result');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code && PLAN_OR_QUOTA.includes(err.code)) setPhase('self');
      else {
        setError(err);
        setPhase('write');
      }
    } finally {
      setBusy(false);
    }
  };

  const selfCheck = async () => {
    setBusy(true);
    setError(null);
    try {
      onProgress((await deepWordApi.selfCheck(word.id, ticks.filter(Boolean).length, ticks.length)).progress);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const later = async () => {
    setBusy(true);
    setError(null);
    try {
      onDeferred((await deepWordApi.defer(word.id)).progress);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dw__card">
      <div className="dw__section">
        <h2 className="dw__h">{s.title}</h2>
        <p className="dw__muted">{s.body}</p>
      </div>

      <div className="dw__kinds" role="radiogroup" aria-label={s.title}>
        {(['sentence', 'speak', 'paragraph', 'scenario'] as const).map((kind) => (
          <button key={kind} type="button" role="radio" aria-checked={kind === 'sentence'} disabled={kind !== 'sentence'} className="dw__kind">
            <span className="dw__row">
              <strong>{s.kinds[kind]}</strong>
              {kind === 'sentence' ? <Tag tone="brand">{s.free}</Tag> : <Tag tone="neutral">{s.soon}</Tag>}
            </span>
            <span className="dw__muted">{s.kindBodies[kind]}</span>
          </button>
        ))}
      </div>

      {(phase === 'write' || phase === 'checking') && (
        <div className="dw__section">
          <p className="dw__note">{topic}</p>
          <textarea className="dw__textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={s.placeholder} aria-label={s.kinds.sentence} rows={3} maxLength={400} lang="en" />
          <Button onClick={() => void check()} loading={busy} disabled={text.trim().length < 3 || busy}>
            {phase === 'checking' ? s.checking : s.check}
          </Button>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="dw__section" aria-live="polite">
          <p className={`dw__note ${result.verdict === 'good' ? 'dw__note--ok' : 'dw__note--warn'}`}>
            <strong>{s.verdict[result.verdict]}</strong>
          </p>
          <p className="dw__kicker">{s.yourSentence}</p>
          <p className="dw__fb-sentence" lang="en">
            {markIssues(result.sentence, result.check.issues).map((part, i) =>
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
          <div className="dw__aspects">
            <Badge tone={result.check.meaningOk ? 'success' : 'warning'}>
              {result.check.meaningOk ? '✓' : '◐'} {s.aspects.meaning}
            </Badge>
            <Badge tone={result.check.formOk ? 'success' : 'warning'}>
              {result.check.formOk ? '✓' : '◐'} {s.aspects.form}
            </Badge>
            <Badge tone={result.check.naturalOk ? 'success' : 'warning'}>
              {result.check.naturalOk ? '✓' : '◐'} {s.aspects.natural}
            </Badge>
          </div>
          <p>{result.check.feedback}</p>
          {result.check.issues.length > 0 && (
            <ol className="dw__issues">
              {result.check.issues.map((issue, i) => (
                <li key={i}>
                  <b lang="en">{issue.text}</b>: {issue.note}
                </li>
              ))}
            </ol>
          )}
          {result.check.improved && result.check.improved !== result.sentence && (
            <div className="dw__core">
              <p className="dw__kicker">{s.better}</p>
              <span lang="en">{result.check.improved}</span>
            </div>
          )}
          <div className="dw__row">
            <Button variant="secondary" onClick={() => { setText(''); setPhase('write'); }}>
              {s.another}
            </Button>
          </div>
        </div>
      )}

      {phase === 'self' && !done && (
        <div className="dw__section">
          <Banner tone="info">
            <strong>{s.noCreditsTitle}</strong> <Tag tone="notice">{s.needCredits}</Tag> {s.noCredits}
          </Banner>
          <textarea className="dw__textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={s.placeholder} aria-label={s.kinds.sentence} rows={3} maxLength={400} lang="en" />
          <fieldset className="dw__section" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="dw__h">{s.selfTitle}</legend>
            {s.selfItems.map((label, i) => (
              <label key={label} className="dw__item">
                <input type="checkbox" checked={ticks[i]} onChange={() => setTicks(ticks.map((v, j) => (j === i ? !v : v)))} /> {label}
              </label>
            ))}
          </fieldset>
          <Button onClick={() => void selfCheck()} loading={busy} disabled={text.trim().length < 3 || busy}>
            {s.selfDone}
          </Button>
        </div>
      )}

      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      {done ? (
        <Button size="lg" icon="chevronRight" className="dw__next" onClick={onNext}>
          {s.next}
        </Button>
      ) : (
        <div className="dw__section">
          <p className="dw__muted">{s.laterNote(progress.deferralsLeft)}</p>
          {progress.deferralsLeft > 0 && (
            <div className="dw__row">
              <Button variant="ghost" onClick={() => void later()} disabled={busy}>
                {s.later}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ---------- 5. Connect ---------- */

export const StageConnect: React.FC<{ data: SessionStart; busy: boolean; onFinish: (link: string[]) => void }> = ({ data, busy, onFinish }) => {
  const { t } = useI18n();
  const s = t.deepWord.session.s5;
  const [related, setRelated] = useState<EnWord[] | null>(null);
  const [linked, setLinked] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    deepWordApi
      .related(data.word.id)
      .then((r) => live && setRelated(r.words))
      .catch(() => live && setRelated([]));
    return () => {
      live = false;
    };
  }, [data.word.id]);

  const toggle = (id: string) => setLinked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  return (
    <div className="dw__card">
      <p className="dw__note dw__note--ok">{s.saved(data.word.term)}</p>

      <div className="dw__section">
        <h2 className="dw__h">{s.connectTitle}</h2>
        <p className="dw__muted">{s.connectBody}</p>
        {related === null ? null : related.length === 0 ? (
          <p className="dw__muted">{s.noRelated}</p>
        ) : (
          <ul className="dw__list">
            {related.map((w) => (
              <li key={w.id} className="dw__item">
                <div className="dw__item-main">
                  <strong lang="en">{w.term}</strong> <span className="dw__muted">{meaningOf(w)}</span>
                </div>
                <Button size="sm" variant={linked.includes(w.id) ? 'secondary' : 'primary'} icon={linked.includes(w.id) ? 'check' : 'plus'} aria-pressed={linked.includes(w.id)} onClick={() => toggle(w.id)}>
                  {linked.includes(w.id) ? s.connected : s.connect}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dw__section">
        <h2 className="dw__h">{s.scheduleTitle}</h2>
        <p className="dw__muted">{s.scheduleBody}</p>
        <div className="dw__row">
          {[1, 3, 7, 14].map((n) => (
            <Badge key={n} icon="today">
              {s.day(n)}
            </Badge>
          ))}
        </div>
      </div>

      <Button size="lg" icon="check" className="dw__next" loading={busy} disabled={busy} onClick={() => onFinish(linked)}>
        {busy ? s.finishing : s.finish}
      </Button>
    </div>
  );
};
