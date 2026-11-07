/**
 * The five stages of a Deep Word session: meet, understand, context and use, produce, connect.
 * Each stage reports what the learner did (for the depth of the word) and asks the session to move on.
 */
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Banner, Button, Tag } from '@/design';
import { useSpeechRecognition } from '@/hooks';
import { RecordButton } from '@/features/speaking/RecordButton';
import { useCurrentUser } from '@/app/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { tasksLeft } from '@/shared/billingApi';
import { ApiRequestError, errorMessage, PLAN_CODES } from '@/shared/http';
import { speakOnce } from '@/shared/speech';
import { formInExample, meaningOf, type EnWord } from '@/shared/enVocabApi';
import { deepWordApi, markIssues, PRODUCE_KINDS, type DeepProgress, type ProduceCosts, type ProduceKind, type SentenceCheck, type SessionStart, type Verdict } from '@/shared/deepWordApi';

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

  // Examples about the learner's own life arrive a moment after the stage opens
  const [personal, setPersonal] = useState<{ text: string; vi: string }[]>((saved.personal as { text: string; vi: string }[] | undefined) ?? []);
  useEffect(() => {
    if (personal.length > 0 || !(data.profile.work || data.profile.interests?.length || data.profile.situations?.length)) return;
    let live = true;
    deepWordApi
      .personalExamples(word.id)
      .then((r) => live && setPersonal(r.examples))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Asked once per opening of the stage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id]);

  const examples = [
    ...(word.example ? [{ text: word.example, vi: word.exampleVi ?? '', kind: 'real' as const }] : []),
    ...personal.map((e) => ({ ...e, kind: 'personal' as const })),
    ...content.examples.map((e) => ({ ...e, kind: 'ai' as const })),
  ].slice(0, beginner ? 3 : 6);

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
              <Tag tone={e.kind === 'real' ? 'reading' : e.kind === 'personal' ? 'brand' : 'neutral'}>{e.kind === 'real' ? s.real : e.kind === 'personal' ? t.deepWord.personalLabel(data.profile.work ?? '') : s.ai}</Tag>
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
const MIN_CHARS: Record<ProduceKind, number> = { sentence: 3, speak: 3, paragraph: 20, scenario: 3 };

export const StageProduce: React.FC<{
  data: SessionStart;
  progress: DeepProgress;
  onProgress: (progress: DeepProgress) => void;
  onNext: () => void;
  onDeferred: (progress: DeepProgress) => void;
}> = ({ data, progress, onProgress, onNext, onDeferred }) => {
  const { t, locale } = useI18n();
  const user = useCurrentUser();
  const s = t.deepWord.session.s4;
  const word = data.word;
  const creditsOut = (tasksLeft(user.credits, 'writing') ?? 1) <= 0;
  const [kind, setKind] = useState<ProduceKind>('sentence');
  const [text, setText] = useState('');
  const [situation, setSituation] = useState<{ situation: string; situationVi: string } | null>(null);
  const [alsoUse, setAlsoUse] = useState<string[]>([]);
  const [phase, setPhase] = useState<'write' | 'checking' | 'result' | 'self'>(creditsOut ? 'self' : 'write');
  const [result, setResult] = useState<{ check: SentenceCheck; verdict: Verdict; text: string } | null>(null);
  const [ticks, setTicks] = useState<boolean[]>(() => s.selfItems.map(() => false));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [gettingSituation, setGettingSituation] = useState(false);
  const [costs, setCosts] = useState<ProduceCosts | null>(null);
  const speech = useSpeechRecognition();

  useEffect(() => {
    deepWordApi.costs().then(setCosts).catch(() => undefined);
  }, []);

  // A finished recording is added to the text
  const { isListening, transcript, resetTranscript } = speech;
  useEffect(() => {
    if (!isListening && transcript) {
      setText((before) => `${before} ${transcript}`.trim());
      resetTranscript();
    }
  }, [isListening, transcript, resetTranscript]);

  const topic = data.profile.work ? s.topic(data.profile.work) : s.topicDefault;
  const done = progress.cells.useP >= 1;
  const family = data.content.wordFamily.filter((w) => w.toLowerCase() !== word.term.toLowerCase()).slice(0, 3);

  const choose = (next: ProduceKind) => {
    if (next === kind) return;
    setKind(next);
    setText('');
    setSituation(null);
    setAlsoUse([]);
    setResult(null);
    setError(null);
    setPhase(creditsOut && next === 'sentence' ? 'self' : 'write');
  };

  const getSituation = async () => {
    setGettingSituation(true);
    setError(null);
    try {
      setSituation(await deepWordApi.scenario(word.id));
      setText('');
    } catch (err) {
      setError(err);
    } finally {
      setGettingSituation(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    setPhase('checking');
    try {
      const reply = await deepWordApi.produce(word.id, text.trim(), { kind, situation: situation?.situation, alsoUse: alsoUse.length ? alsoUse : undefined });
      setResult({ check: reply.check, verdict: reply.verdict, text: text.trim() });
      onProgress(reply.progress);
      setPhase('result');
    } catch (err) {
      const outOfCredits = err instanceof ApiRequestError && err.code !== undefined && PLAN_OR_QUOTA.includes(err.code);
      if (outOfCredits && kind === 'sentence') setPhase('self');
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

  const canCheck = text.trim().length >= MIN_CHARS[kind] && (kind !== 'scenario' || situation !== null);
  const textShown = isListening ? `${text} ${transcript} ${speech.interimTranscript}`.trim() : text;
  const placeholder = kind === 'scenario' ? s.scenarioAnswer : s.placeholder;

  return (
    <div className="dw__card">
      <div className="dw__section">
        <h2 className="dw__h">{s.title}</h2>
        <p className="dw__muted">{s.body}</p>
      </div>

      <div className="dw__kinds" role="radiogroup" aria-label={s.title}>
        {PRODUCE_KINDS.map((k) => {
          const locked = creditsOut && k !== 'sentence';
          return (
            <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={locked || phase === 'checking'} className="dw__kind" onClick={() => choose(k)}>
              <span className="dw__row">
                <strong>{s.kinds[k]}</strong>
                {k === 'sentence' && <Tag tone="brand">{s.free}</Tag>}
                {locked ? <Tag tone="notice">{s.needCreditsKind}</Tag> : costs && <Tag tone="neutral">{s.cost(costs.credits[k])}</Tag>}
              </span>
              <span className="dw__muted">{s.kindBodies[k]}</span>
            </button>
          );
        })}
      </div>

      {(phase === 'write' || phase === 'checking') && (
        <div className="dw__section">
          {kind === 'sentence' && <p className="dw__note">{topic}</p>}
          {kind === 'speak' && (
            <>
              <p className="dw__note">{s.speakHint}</p>
              {speech.errorKind === 'denied' && <Banner tone="warning">{s.speakDenied}</Banner>}
              {speech.isSupported ? (
                <RecordButton size="md" isRecording={isListening} onStart={speech.startListening} onStop={speech.stopListening} startLabel={s.speakRecord} stopLabel={s.speakStop} />
              ) : (
                <Banner tone="info">{s.speakNoSupport}</Banner>
              )}
            </>
          )}
          {kind === 'paragraph' && (
            <>
              <p className="dw__note">{s.paragraphHint}</p>
              {family.length > 0 && (
                <div className="dw__filters" role="group" aria-label={s.alsoUse}>
                  <span className="dw__muted">{s.alsoUse}:</span>
                  {family.map((w) => (
                    <button key={w} type="button" className="dw__chip" aria-pressed={alsoUse.includes(w)} lang="en" onClick={() => setAlsoUse((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : cur.length < 2 ? [...cur, w] : cur))}>
                      {w}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {kind === 'scenario' && (
            <>
              {situation ? (
                <div className="dw__core">
                  <p className="dw__kicker">{s.scenarioLabel}</p>
                  <span lang="en">{situation.situation}</span>
                  {locale === 'vi' && <span className="dw__muted">{situation.situationVi}</span>}
                </div>
              ) : null}
              <div>
                <Button variant={situation ? 'ghost' : 'primary'} icon="sparkles" onClick={() => void getSituation()} loading={gettingSituation} disabled={gettingSituation || busy}>
                  {gettingSituation ? s.scenarioGetting : situation ? s.scenarioAnother : s.scenarioGet}
                </Button>
              </div>
            </>
          )}
          {(kind !== 'scenario' || situation) && (
            <>
              <textarea className="dw__textarea" value={textShown} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={s.kinds[kind]} rows={kind === 'paragraph' ? 6 : 3} maxLength={kind === 'paragraph' ? 800 : 400} lang="en" />
              <Button onClick={() => void check()} loading={busy} disabled={!canCheck || busy || isListening}>
                {phase === 'checking' ? s.checking : s.check}
              </Button>
            </>
          )}
        </div>
      )}

      {phase === 'result' && result && (
        <div className="dw__section" aria-live="polite">
          <p className={`dw__note ${result.verdict === 'good' ? 'dw__note--ok' : 'dw__note--warn'}`}>
            <strong>{s.verdict[result.verdict]}</strong>
          </p>
          <p className="dw__kicker">{s.yourSentence}</p>
          <p className="dw__fb-sentence" lang="en">
            {markIssues(result.text, result.check.issues).map((part, i) =>
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
          {result.check.improved && result.check.improved !== result.text && (
            <div className="dw__core">
              <p className="dw__kicker">{s.better}</p>
              <span lang="en">{result.check.improved}</span>
            </div>
          )}
          <div className="dw__row">
            <Button
              variant="secondary"
              onClick={() => {
                setText('');
                if (kind === 'scenario') setSituation(null);
                setPhase('write');
              }}
            >
              {s.another}
            </Button>
          </div>
        </div>
      )}

      {phase === 'self' && !done && kind === 'sentence' && (
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
