/**
 * CheckpointPage
 * The short, free checkpoint of a roadmap stage: an overview (locked, ready, or already passed), one question at a
 * time, then the result. A pass is the one big celebration of a stage; a miss gets a calm explanation by skill
 * and a catch-up week aimed at exactly the weak parts.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Banner, Button, Card, ErrorState, Icon, LinkButton, Modal, Skeleton, Tag, type TagTone } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { ApiRequestError } from '@/shared/http';
import { isSpeechSupported, speakOnce } from '@/shared/speech';
import { hasRoadmap, roadmapApi, type CheckpointAttempt, type CheckpointQuestion, type CheckpointResult, type RoadmapView, type SkillKey } from '@/shared/roadmapApi';
import { useStageName } from './useStageName';
import '@/features/exams/exams.css';
import '@/features/me/me.css';
import '@/features/placement/placement.css';
import './roadmap.css';

const TONES: Record<SkillKey, TagTone> = { vocabulary: 'neutral', grammar: 'neutral', reading: 'reading', listening: 'listening' };
const ACTION_LINKS: Record<SkillKey, string> = { vocabulary: ROUTES.VOCABULARY, grammar: ROUTES.GRAMMAR, reading: ROUTES.READING_PASSAGE, listening: ROUTES.DICTATION };
const LETTERS = ['A', 'B', 'C', 'D'];
const UNLOCK = 80;
const PASS = 70;

type Phase =
  | { name: 'loading' }
  | { name: 'error' }
  | { name: 'overview'; view: RoadmapView }
  | { name: 'unavailable'; reason: 'empty' | 'other' }
  | { name: 'test'; attempt: CheckpointAttempt; index: number; answers: Record<string, number> }
  | { name: 'result'; result: CheckpointResult; attemptId: string };

export const CheckpointPage: React.FC = () => {
  const { t } = useI18n();
  const c = t.checkpoint;
  const { stage: stageParam } = useParams();
  const stageIndex = Number(stageParam);
  const navigate = useNavigate();
  const stageName = useStageName();
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [remedialDone, setRemedialDone] = useState(false);
  const [playing, setPlaying] = useState(false);
  const stopAudio = useRef<(() => void) | null>(null);

  useEffect(() => {
    roadmapApi
      .get()
      .then((data) => setPhase(hasRoadmap(data) && data.roadmap.stages[stageIndex] ? { name: 'overview', view: data } : { name: 'unavailable', reason: 'other' }))
      .catch(() => setPhase({ name: 'error' }));
    return () => stopAudio.current?.();
  }, [stageIndex]);

  const begin = async (early: boolean, full = false) => {
    setBusy(true);
    try {
      const attempt = await roadmapApi.startCheckpoint(stageIndex, early, full);
      setChoice(null);
      setPhase({ name: 'test', attempt, index: 0, answers: {} });
    } catch (err) {
      // Not on the plan: the upgrade prompt opens, and the learner stays here
      if (err instanceof ApiRequestError && err.code === 'plan_required') return;
      setPhase({ name: 'unavailable', reason: err instanceof ApiRequestError && err.code === 'empty_bank' ? 'empty' : 'other' });
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (phase.name !== 'test' || choice === null) return;
    stopAudio.current?.();
    setPlaying(false);
    const question = phase.attempt.questions[phase.index];
    const answers = { ...phase.answers, [question.id]: choice };
    if (phase.index + 1 < phase.attempt.questions.length) {
      setChoice(null);
      setPhase({ ...phase, index: phase.index + 1, answers });
      return;
    }
    setBusy(true);
    try {
      const done = await roadmapApi.submitCheckpoint(phase.attempt.id, answers);
      setPhase({ name: 'result', result: done.result!, attemptId: done.id });
    } catch {
      setPhase({ name: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const play = (text: string) => {
    stopAudio.current?.();
    setPlaying(true);
    stopAudio.current = speakOnce(text, 1, () => setPlaying(false));
  };

  const back = (
    <Link to={ROUTES.ROADMAP} className="plan__back" aria-label={c.continueRoadmap}>
      <Icon name="arrowLeft" size={20} />
    </Link>
  );
  const title = <h1>{c.title}</h1>;
  const skillName = (skill: SkillKey) => t.placement.parts[skill];

  if (phase.name === 'loading')
    return (
      <div className="checkpoint">
        <header className="plan__head">
          {back}
          {title}
        </header>
        <Skeleton height={160} label={c.loading} />
      </div>
    );

  if (phase.name === 'error')
    return (
      <div className="checkpoint">
        <header className="plan__head">
          {back}
          {title}
        </header>
        <ErrorState title={c.errorTitle} action={<Button onClick={() => window.location.reload()}>{t.today.retry}</Button>}>
          {c.errorBody}
        </ErrorState>
      </div>
    );

  if (phase.name === 'unavailable')
    return (
      <div className="checkpoint">
        <header className="plan__head">
          {back}
          {title}
        </header>
        <Banner tone="info">{phase.reason === 'empty' ? c.empty : c.unavailable}</Banner>
        <LinkButton to={ROUTES.ROADMAP}>{c.continueRoadmap}</LinkButton>
      </div>
    );

  if (phase.name === 'overview') {
    const { roadmap, progress, checkpoint } = phase.view;
    const stage = roadmap.stages[stageIndex];
    const pct = Math.round((progress.stages[stageIndex]?.progress ?? 0) * 100);
    const unlocked = pct >= UNLOCK;
    const passed = progress.stages[stageIndex]?.passed === true;
    const name = stageName(stage);
    return (
      <div className="checkpoint">
        <header className="plan__head">
          {back}
          {title}
        </header>
        <div className="checkpoint__grid">
          <div className="checkpoint__col">
            <Card padding="lg" className="checkpoint__card">
              <Tag tone="brand">{c.badge}</Tag>
              <h2>{c.stageTitle(name)}</h2>
              <p>{passed ? c.congratsBody(name) : unlocked ? c.ready(pct) : c.locked(pct)}</p>
              <div className="checkpoint__meter">
                <div className="roadmap__bar">
                  <span>{c.targets}</span>
                  <strong>{c.needed(pct, UNLOCK)}</strong>
                </div>
                <div className="checkpoint__track" role="img" aria-label={c.needed(pct, UNLOCK)}>
                  <span style={{ width: `${Math.min(100, pct)}%` }} />
                  <i style={{ left: `${UNLOCK}%` }} />
                </div>
              </div>
            </Card>
            <Card padding="sm">
              <ul className="tests__rows">
                <li className="tests__row">
                  <span className="tests__row-text">
                    <strong>{c.short}</strong>
                    <span>{c.shortMeta}</span>
                  </span>
                </li>
                <li className="tests__row">
                  <span className="tests__row-text">
                    <strong>{c.full}</strong>
                    <span>{c.fullMeta}</span>
                  </span>
                  <Button variant="secondary" size="sm" disabled={busy || passed} onClick={() => void begin(!unlocked, true)}>
                    {c.takeFull}
                  </Button>
                  <Link to={ROUTES.ME_PLAN} className="tests__lock">
                    <Icon name="lock" size={16} />
                    {c.plus}
                  </Link>
                </li>
              </ul>
            </Card>
          </div>
          <aside className="checkpoint__col">
            {passed ? (
              <LinkButton to={ROUTES.ROADMAP} size="lg" block>
                {c.continueRoadmap}
              </LinkButton>
            ) : (
              <>
                <Button size="lg" block onClick={() => void begin(!unlocked)} loading={busy} variant={unlocked ? 'primary' : 'secondary'}>
                  {checkpoint?.inProgressId ? c.resume : unlocked ? c.start : c.tryEarly}
                </Button>
                <p className="roadmap__muted">{c.rule}</p>
              </>
            )}
          </aside>
        </div>
      </div>
    );
  }

  if (phase.name === 'test') {
    const { attempt, index } = phase;
    const q: CheckpointQuestion = attempt.questions[index];
    const last = index + 1 === attempt.questions.length;
    return (
      <div className="placement">
        <div className="placement__inner">
          <header className="placement__head">
            <button type="button" className="placement__exit" aria-label={c.exit} onClick={() => setLeaving(true)}>
              <Icon name="x" size={20} />
            </button>
            <div className="placement__titles">
              <h1>{c.title}</h1>
              <p>{c.question(index + 1, attempt.questions.length)}</p>
            </div>
          </header>
          <div className="checkpoint__bar" aria-hidden="true">
            <span style={{ width: `${(index / attempt.questions.length) * 100}%` }} />
          </div>
          <Card padding="md" className="placement__context">
            <Tag tone={TONES[q.skill]}>{skillName(q.skill)}</Tag>
            {q.skill === 'listening' && q.context ? (
              <div className="placement__audio">
                <Button variant="secondary" icon="headphones" onClick={() => play(q.context!)} disabled={playing || !isSpeechSupported()}>
                  {playing ? t.placement.listening : t.placement.listen}
                </Button>
                <span className="placement__hint">{t.placement.listenHint}</span>
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
            <Button size="lg" block onClick={() => void next()} disabled={choice === null} loading={busy}>
              {busy ? c.sending : last ? c.finish : c.check}
            </Button>
          </div>
        </div>
        <Modal
          open={leaving}
          title={c.exit}
          onClose={() => setLeaving(false)}
          closeLabel={t.common.close}
          footer={
            <>
              <Button variant="ghost" onClick={() => navigate(ROUTES.ROADMAP)}>
                {c.leave}
              </Button>
              <Button onClick={() => setLeaving(false)}>{c.stay}</Button>
            </>
          }
        >
          <p>{c.exitBody}</p>
        </Modal>
      </div>
    );
  }

  // Result
  const { result, attemptId } = phase;
  const overall = Math.round(result.overall * 100);
  const entries = Object.entries(result.skills) as [SkillKey, NonNullable<CheckpointResult['skills'][SkillKey]>][];
  const lows = entries.filter(([, s]) => s.verdict === 'low').map(([k]) => skillName(k));
  const weakNames = result.weak.map(skillName).join(', ');
  return (
    <div className="checkpoint">
      <header className="plan__head">
        {back}
        {title}
      </header>
      {result.passed && (
        <section className="goal-done__hero" role="status">
          <span className="goal-done__badge">
            <Icon name="check" size={40} />
          </span>
          <h2>{c.congrats}</h2>
          <p>{c.passedBadge(overall)}</p>
        </section>
      )}
      <div className="checkpoint__grid">
        <div className="checkpoint__col">
          <Card padding="md">
            <div className="stage__head">
              <strong>{c.resultSkills}</strong>
              <Tag tone={result.passed ? 'brand' : 'notice'}>{result.passed ? c.passedBadge(overall) : c.failedBadge(overall)}</Tag>
            </div>
            <ul className="checkpoint__skills">
              {entries.map(([skill, s]) => (
                <li key={skill}>
                  <div className="roadmap__bar">
                    <Tag tone={TONES[skill]}>{skillName(skill)}</Tag>
                    <strong>
                      {Math.round(s.score * 100)}% · {c.verdict[s.verdict]}
                    </strong>
                  </div>
                  <div className="checkpoint__track" role="img" aria-label={`${skillName(skill)} ${Math.round(s.score * 100)}%`}>
                    <span style={{ width: `${Math.round(s.score * 100)}%` }} />
                    <i style={{ left: `${PASS}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="roadmap__muted">{c.markNote}</p>
          </Card>
          {!result.passed && (
            <Card padding="md" className="checkpoint__card">
              <h2>{c.whyTitle}</h2>
              <p>{c.whyBody(overall, weakNames)}</p>
              {lows.length > 0 && <p>{c.whyLow(lows.join(', '))}</p>}
              <strong>{c.todo}</strong>
              <ol className="checkpoint__todo">
                {result.weak.slice(0, 3).map((skill) => (
                  <li key={skill}>
                    <Link to={ACTION_LINKS[skill]}>{c.actions[skill]}</Link>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
        <aside className="checkpoint__col">
          {result.passed ? (
            <LinkButton to={ROUTES.ROADMAP} size="lg" block>
              {c.continueRoadmap}
            </LinkButton>
          ) : (
            <>
              {remedialDone ? (
                <Banner tone="success">{c.remedialDone}</Banner>
              ) : (
                <Button
                  size="lg"
                  block
                  onClick={async () => {
                    await roadmapApi.startRemedial(attemptId).catch(() => null);
                    setRemedialDone(true);
                  }}
                >
                  {c.remedial}
                </Button>
              )}
              <LinkButton to={ROUTES.ROADMAP} variant="ghost" block>
                {c.later}
              </LinkButton>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};
