/**
 * PlacementPage
 * The level test in focus mode (outside the app shell): an introduction, one question at a time in four stages
 * (vocabulary, grammar, reading, listening) with a way to pause, then the result per skill. The roadmap uses the
 * result as the starting level. No timer: this is not an exam.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorState, Icon, LinkButton, Modal, Skeleton, Tag, type TagTone } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { ApiRequestError } from '@/shared/http';
import { isSpeechSupported, speakOnce } from '@/shared/speech';
import { placementApi, type PlacementResult, type PlacementSession, type PlacementSkill, type ProductiveSkill } from '@/shared/placementApi';
import { ProductiveMeasure } from './ProductiveMeasure';
import './placement.css';

const SKILLS: PlacementSkill[] = ['vocabulary', 'grammar', 'reading', 'listening'];
const TONES: Record<PlacementSkill, TagTone> = { vocabulary: 'neutral', grammar: 'neutral', reading: 'reading', listening: 'listening' };
const LETTERS = ['A', 'B', 'C', 'D'];

type Load = { state: 'loading' } | { state: 'error' } | { state: 'unavailable'; reason: 'language' | 'empty' } | { state: 'intro'; resumable: boolean } | { state: 'session'; session: PlacementSession } | { state: 'done'; result: PlacementResult; answered: number };

export const PlacementPage: React.FC = () => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const p = t.placement;
  const [view, setView] = useState<Load>(user.studyLanguage === 'en' ? { state: 'loading' } : { state: 'unavailable', reason: 'language' });
  const [choice, setChoice] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const stopAudio = useRef<(() => void) | null>(null);
  /** Writing and Speaking, once measured after the quiz, and which of them is being measured now */
  const [measured, setMeasured] = useState<Partial<Record<ProductiveSkill, string>>>({});
  const [measuring, setMeasuring] = useState<ProductiveSkill | null>(null);

  const applySession = useCallback((session: PlacementSession) => {
    setChoice(null);
    setView(session.status === 'finished' && session.result ? { state: 'done', result: session.result, answered: session.progress.answered } : { state: 'session', session });
  }, []);

  useEffect(() => {
    if (user.studyLanguage !== 'en') return;
    placementApi
      .get()
      .then(({ session }) => setView({ state: 'intro', resumable: Boolean(session) }))
      .catch(() => setView({ state: 'error' }));
    return () => stopAudio.current?.();
  }, [user.studyLanguage]);

  const start = async () => {
    setSending(true);
    try {
      applySession((await placementApi.start()).session);
    } catch (err) {
      setView(err instanceof ApiRequestError && err.status === 503 ? { state: 'unavailable', reason: 'empty' } : { state: 'error' });
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    if (view.state !== 'session' || choice === null || !view.session.question) return;
    stopAudio.current?.();
    setPlaying(false);
    setSending(true);
    try {
      applySession((await placementApi.answer(view.session.id, view.session.question.id, choice)).session);
    } catch {
      setView({ state: 'error' });
    } finally {
      setSending(false);
    }
  };

  const play = (text: string) => {
    stopAudio.current?.();
    setPlaying(true);
    stopAudio.current = speakOnce(text, 1, () => setPlaying(false));
  };

  const header = (title: string, sub?: string, back = true) => (
    <header className="placement__head">
      {back && (
        <button type="button" className="placement__exit" aria-label={t.common.close} onClick={() => (view.state === 'session' ? setPausing(true) : navigate(ROUTES.ROADMAP))}>
          <Icon name={view.state === 'session' ? 'x' : 'arrowLeft'} size={20} />
        </button>
      )}
      <div className="placement__titles">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {view.state === 'session' && (
        <button type="button" className="placement__link" onClick={() => setPausing(true)}>
          {p.pause}
        </button>
      )}
    </header>
  );

  let body: React.ReactNode;
  if (view.state === 'loading') {
    body = (
      <>
        {header(p.title)}
        <Skeleton height={160} label={p.loading} />
      </>
    );
  } else if (view.state === 'error') {
    body = (
      <>
        {header(p.title)}
        <ErrorState title={p.errorTitle} action={<Button onClick={() => window.location.reload()}>{p.retry}</Button>}>
          {p.errorBody}
        </ErrorState>
      </>
    );
  } else if (view.state === 'unavailable') {
    body = (
      <>
        {header(p.title)}
        <Card padding="lg" className="placement__card">
          <p>{view.reason === 'language' ? p.unavailableEn : p.emptyBank}</p>
          <LinkButton to={ROUTES.ROADMAP_NEW} size="lg">
            {p.skip}
          </LinkButton>
        </Card>
      </>
    );
  } else if (view.state === 'intro') {
    const total = SKILLS.reduce((n, s) => n + p.minutes[s], 0);
    body = (
      <>
        {header(p.title, p.intro(total))}
        <Card padding="lg" className="placement__card">
          <p>{p.why}</p>
          <ul className="placement__parts">
            {SKILLS.map((skill) => (
              <li key={skill}>
                <Tag tone={TONES[skill]}>{p.parts[skill]}</Tag>
                <span>{t.today.minutes(p.minutes[skill])}</span>
              </li>
            ))}
          </ul>
          <Button size="lg" onClick={() => void start()} loading={sending}>
            {view.resumable ? p.resume : p.start}
          </Button>
          <Link to={ROUTES.ROADMAP_NEW} className="placement__link">
            {p.skip}
          </Link>
        </Card>
      </>
    );
  } else if (view.state === 'session') {
    const { session } = view;
    const q = session.question;
    const phase = session.progress.phase;
    body = (
      <>
        {header(p.stage(phase, SKILLS.length, p.parts[q?.skill ?? 'vocabulary']), `${p.question(session.progress.answered + 1, session.progress.total)} · ${p.saved}`)}
        <ol className="placement__phases" aria-label={p.title}>
          {session.progress.phases.map((ph) => (
            <li key={ph.skill}>
              <span className="placement__bar">
                <span style={{ width: `${Math.min(100, (ph.asked / ph.total) * 100)}%` }} />
              </span>
              <span className={ph.skill === q?.skill ? 'placement__phase placement__phase--on' : 'placement__phase'}>{p.parts[ph.skill]}</span>
            </li>
          ))}
        </ol>
        {q && (
          <>
            <Card padding="md" className="placement__context">
              <Tag tone={TONES[q.skill]}>{p.parts[q.skill]}</Tag>
              {q.skill === 'listening' && q.context ? (
                <div className="placement__audio">
                  <Button variant="secondary" onClick={() => play(q.context!)} disabled={playing || !isSpeechSupported()} icon="headphones">
                    {playing ? p.listening : p.listen}
                  </Button>
                  <span className="placement__hint">{p.listenHint}</span>
                </div>
              ) : (
                q.context && <p className="placement__text">{q.context}</p>
              )}
            </Card>
            <h2 className="placement__prompt">{q.prompt}</h2>
            <div className="placement__options" role="radiogroup" aria-label={q.prompt}>
              {q.options.map((option, i) => (
                <button key={option} type="button" role="radio" aria-checked={choice === i} className={`placement__option ${choice === i ? 'placement__option--on' : ''}`} onClick={() => setChoice(i)}>
                  <span className="placement__letter" aria-hidden="true">
                    {choice === i ? '✓' : LETTERS[i]}
                  </span>
                  {option}
                </button>
              ))}
            </div>
            <div className="placement__cta">
              <Button size="lg" block onClick={() => void submit()} disabled={choice === null} loading={sending}>
                {p.check}
              </Button>
              <button type="button" className="placement__link" onClick={() => setPausing(true)}>
                {p.pause}
              </button>
            </div>
          </>
        )}
      </>
    );
  } else {
    const { result } = view;
    const row = (skill: PlacementSkill, measured: boolean) => {
      const r = measured ? result.levels[skill] : null;
      return (
        <li key={skill} className="placement__row">
          <Tag tone={TONES[skill]}>{p.parts[skill]}</Tag>
          <span className="placement__level">
            <strong>{r ? r.level : p.notMeasured}</strong>
            <span>{r ? p.confidence[r.confidence] : p.later}</span>
          </span>
        </li>
      );
    };
    body = (
      <>
        {header(p.resultTitle, p.resultDone(view.answered))}
        <Card padding="md">
          <span className="placement__label">{p.overall}</span>
          <strong className="placement__overall">{result.overall ?? p.notMeasured}</strong>
        </Card>
        <Card padding="md">
          <span className="placement__label">{p.foundation}</span>
          <ul className="placement__rows">
            {row('vocabulary', true)}
            {row('grammar', true)}
          </ul>
        </Card>
        <Card padding="md">
          <span className="placement__label">{p.skills}</span>
          <ul className="placement__rows">
            {row('listening', true)}
            {row('reading', true)}
            {(['writing', 'speaking'] as const).map((skill) => (
              <li key={skill} className="placement__row">
                <Tag tone={skill}>{t.today.kinds[skill]}</Tag>
                <span className="placement__level">
                  <strong>{measured[skill] ?? p.notMeasured}</strong>
                  {measured[skill] ? <span>{p.confidence.low}</span> : <span>{p.later}</span>}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setMeasuring(skill)}>
                  {measured[skill] ? p.measure.again : p.measure.start}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
        <p className="placement__hint">{p.measure.optional}</p>
        <p className="placement__hint">{p.editByHand}</p>
        <div className="placement__cta">
          <LinkButton to={ROUTES.ROADMAP_NEW} size="lg" block>
            {p.useResult}
          </LinkButton>
          <span className="placement__hint">{p.retake}</span>
        </div>
      </>
    );
  }

  return (
    <div className="placement">
      <div className="placement__inner">{body}</div>
      <Modal
        open={pausing}
        title={p.pauseTitle}
        onClose={() => setPausing(false)}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => navigate(ROUTES.ROADMAP)}>
              {p.leave}
            </Button>
            <Button onClick={() => setPausing(false)}>{p.continue}</Button>
          </>
        }
      >
        <p>{p.pauseBody}</p>
      </Modal>
      {measuring && <ProductiveMeasure key={measuring} skill={measuring} open onClose={() => setMeasuring(null)} onMeasured={(level) => setMeasured((m) => ({ ...m, [measuring]: level }))} />}
    </div>
  );
};
