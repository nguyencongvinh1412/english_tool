/**
 * UnitPage
 * One lesson of a skill course in four steps: learn, an annotated model, quick drills, then the learner's own
 * text scored against the lesson's checklist. Locked lessons can be read but not practised.
 */
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Banner, Button, Card, Icon, LinkButton, Segmented, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { BandFeedback } from '@/features/practice/BandFeedback';
import { WritingPromptCard, WritingReview } from '@/features/writing/WritingReview';
import { coursePath, curriculumApi, unitPath, unitTask, type ChecklistMark, type UnitDrill, type UnitFeedback, type UnitView } from '@/shared/curriculumApi';
import type { Bilingual } from '@/shared/grammarApi';
import '@/features/writing/writing.css';
import './learn.css';

const STEPS = ['learn', 'model', 'practice', 'write'] as const;
type Step = (typeof STEPS)[number];
type Lang = 'en' | 'vi';

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Draft of the lesson task, kept per lesson so a refresh does not lose it */
const draftKey = (id: string) => `english-tool:unit-draft:${id}`;
function readDraft(id: string): string {
  try {
    return localStorage.getItem(draftKey(id)) ?? '';
  } catch {
    return '';
  }
}
function writeDraft(id: string, text: string): void {
  try {
    if (text) localStorage.setItem(draftKey(id), text);
    else localStorage.removeItem(draftKey(id));
  } catch {
    // Storage unavailable; the draft only lives in memory
  }
}

/**
 * Lesson text: lines starting with "- " or "1. " become lists, other lines paragraphs; **bold** is kept
 */
export const Prose: React.FC<{ text: string }> = ({ text }) => {
  const blocks: { kind: 'p' | 'ul' | 'ol'; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const kind = /^[-•]\s/.test(line) ? 'ul' : /^\d+\.\s/.test(line) ? 'ol' : 'p';
    const content = kind === 'p' ? line : line.replace(/^([-•]|\d+\.)\s+/, '');
    const last = blocks.at(-1);
    if (kind !== 'p' && last?.kind === kind) last.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }
  return (
    <div className="prose">
      {blocks.map((block, index) => {
        if (block.kind === 'p') return <p key={index}><InlineMarkdown text={block.lines[0]} /></p>;
        const List = block.kind;
        return (
          <List key={index}>
            {block.lines.map((line, i) => (
              <li key={i}>
                <InlineMarkdown text={line} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
};

/* ---------- Drills ---------- */

export const ChoiceDrill: React.FC<{ drill: Extract<UnitDrill, { type: 'choice' }>; lang: Lang; onAnswer: (correct: boolean) => void }> = ({ drill, lang, onAnswer }) => {
  const { t } = useI18n();
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  return (
    <>
      {drill.sentence && (
        <p className="drill__sentence" lang="en">
          {drill.sentence}
        </p>
      )}
      <div className="drill__options">
        {drill.options.map((option, index) => {
          const state = !answered ? '' : index === drill.answerIndex ? 'drill__option--right' : index === picked ? 'drill__option--wrong' : '';
          return (
            <button
              key={index}
              type="button"
              className={`drill__option ${state}`}
              disabled={answered}
              lang="en"
              onClick={() => {
                setPicked(index);
                onAnswer(index === drill.answerIndex);
              }}
            >
              {option}
            </button>
          );
        })}
      </div>
      {answered && (
        <p className={`drill__verdict ${picked === drill.answerIndex ? 'drill__verdict--right' : 'drill__verdict--wrong'}`}>
          <strong>{picked === drill.answerIndex ? t.course.correct : t.course.notQuite}</strong> {drill.explanation[lang]}
        </p>
      )}
    </>
  );
};

/** Shuffled start order that is never already correct */
function shuffledOrder(length: number, seed: string): number[] {
  const order = Array.from({ length }, (_, i) => i);
  let hash = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  for (let i = order.length - 1; i > 0; i--) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const j = hash % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.every((value, index) => value === index) ? [...order.slice(1), order[0]] : order;
}

export const OrderDrill: React.FC<{ drill: Extract<UnitDrill, { type: 'order' }>; lang: Lang; onAnswer: (correct: boolean) => void }> = ({ drill, lang, onAnswer }) => {
  const { t } = useI18n();
  const [order, setOrder] = useState(() => shuffledOrder(drill.parts.length, drill.parts.join('|')));
  const [result, setResult] = useState<boolean | null>(null);
  const move = (from: number, to: number) =>
    setOrder((current) => {
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  return (
    <>
      <p className="drill__hint">{t.course.orderHint}</p>
      <ol className="drill__order">
        {order.map((partIndex, position) => (
          <li key={partIndex} className={result === null ? '' : partIndex === position ? 'drill__order--right' : 'drill__order--wrong'}>
            <span lang="en">{drill.parts[partIndex]}</span>
            {result === null && (
              <span className="drill__arrows">
                <button type="button" onClick={() => move(position, position - 1)} disabled={position === 0} aria-label={t.course.moveUp} title={t.course.moveUp}>
                  <Icon name="arrowUp" size={16} />
                </button>
                <button type="button" onClick={() => move(position, position + 1)} disabled={position === order.length - 1} aria-label={t.course.moveDown} title={t.course.moveDown}>
                  <span className="drill__down">
                    <Icon name="arrowUp" size={16} />
                  </span>
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {result === null ? (
        <Button
          size="sm"
          variant="secondary"
          icon="check"
          onClick={() => {
            const correct = order.every((value, index) => value === index);
            setResult(correct);
            onAnswer(correct);
          }}
        >
          {t.course.check}
        </Button>
      ) : (
        <div className={`drill__verdict ${result ? 'drill__verdict--right' : 'drill__verdict--wrong'}`}>
          <strong>{result ? t.course.correct : t.course.notQuite}</strong> {drill.explanation[lang]}
          {!result && (
            <ol className="drill__answer" lang="en">
              <p>{t.course.correctOrder}</p>
              {drill.parts.map((part) => (
                <li key={part}>{part}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );
};

/* ---------- Writing result ---------- */

const MARK_ICON: Record<ChecklistMark, 'check' | 'alert' | 'x'> = { yes: 'check', partly: 'alert', no: 'x' };

const ChecklistResult: React.FC<{ view: UnitView; feedback: UnitFeedback; lang: Lang }> = ({ view, feedback, lang }) => {
  const { t } = useI18n();
  const labels = new Map(view.content.checklist.map((c) => [c.id, c.label]));
  return (
    <Card padding="lg" className="unit-checklist">
      <h2 className="w-section-title">{t.course.checklistResult}</h2>
      <ul className="unit-checklist__list">
        {feedback.checklist.map((item) => (
          <li key={item.id} className={`unit-checklist__item unit-checklist__item--${item.met}`}>
            <span className="unit-checklist__mark">
              <Icon name={MARK_ICON[item.met]} size={16} /> {t.course.marks[item.met]}
            </span>
            <span>
              <strong>{labels.get(item.id)?.[lang] ?? item.id}</strong>
              <br />
              {item.comment}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
};

/* ---------- Page ---------- */

export const UnitPage: React.FC = () => {
  const { unitId = '' } = useParams();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { celebrate } = useProgress();
  const [view, setView] = useState<UnitView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [step, setStep] = useState<Step>('learn');
  const [lang, setLang] = useState<Lang>(locale);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [text, setText] = useState(() => readDraft(unitId));
  const [startedAt, setStartedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ feedback: UnitFeedback; response: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setView(null);
    setLoadError(null);
    setResult(null);
    setAnswers({});
    setText(readDraft(unitId));
    curriculumApi
      .unit(unitId)
      .then((data) => {
        if (cancelled) return;
        setView(data);
        // Pick up where the learner stopped: drills done but no text yet → the writing task
        setStep(data.open && data.progress?.drillScore != null && !data.progress.completedAt ? 'write' : 'learn');
      })
      .catch((err) => !cancelled && setLoadError(err));
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  useEffect(() => writeDraft(unitId, text), [unitId, text]);
  useEffect(() => {
    if (step === 'write' && !startedAt) setStartedAt(Date.now());
    window.scrollTo({ top: 0 });
  }, [step, startedAt]);

  const backToCourse = useCallback(() => navigate(coursePath(view?.unit.skill ?? 'writing')), [navigate, view]);
  const task = useMemo(() => (view ? unitTask(view.content) : null), [view]);

  if (loadError) return <Banner tone="danger">{errorMessage(loadError, t)}</Banner>;
  if (!view || !task) return <Spinner size={28} label={t.common.loading} />;

  const { unit, content, open } = view;
  const say = (text: Bilingual) => text[lang];
  const stepIndex = STEPS.indexOf(step);
  const answeredAll = Object.keys(answers).length === content.drills.length;
  const correctCount = Object.values(answers).filter(Boolean).length;
  const words = countWords(text);
  const enough = words >= Math.round(task.minWords * 0.5);

  const finishDrills = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await curriculumApi.saveDrills(unit.id, correctCount, content.drills.length);
      setView({ ...view, progress: saved.progress });
      setStep('write');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const scored = await curriculumApi.write(unit.id, text, startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0);
      setResult({ feedback: scored.feedback, response: text });
      setView({ ...view, progress: scored.progress });
      setText('');
      celebrate(scored.xpEarned);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const nav = (
    <div className="practice__actions unit__nav">
      {stepIndex > 0 && (
        <Button variant="secondary" icon="arrowLeft" onClick={() => setStep(STEPS[stepIndex - 1])}>
          {t.course.back}
        </Button>
      )}
      {(step === 'learn' || step === 'model') && (
        <Button icon="chevronRight" onClick={() => setStep(STEPS[stepIndex + 1])} disabled={step === 'model' && !open}>
          {t.course.next}
        </Button>
      )}
    </div>
  );

  return (
    <div className="practice unit" style={{ ['--skill' as string]: `var(--${unit.skill})` }}>
      <PracticeHeader title={unit.title[locale]} level={unit.level} onBack={backToCourse} />

      <div className="unit__bar">
        <span className="unit__count">{t.course.lessonOf(unit.order, unit.total)}</span>
        <Segmented<Lang>
          label={t.course.explainIn}
          value={lang}
          onChange={setLang}
          options={[
            { value: 'vi', label: 'VI' },
            { value: 'en', label: 'EN' },
          ]}
        />
      </div>

      <ol className="unit__steps">
        {STEPS.map((s, index) => {
          // Locked lessons: reading only. The task opens after the drills (or once the lesson is done)
          const reachable = index < 2 || (open && (s !== 'write' || view.progress?.drillScore != null || Boolean(view.progress?.completedAt)));
          return (
            <li key={s}>
              <button
                type="button"
                className={`unit__step ${s === step ? 'unit__step--on' : ''} ${index < stepIndex ? 'unit__step--past' : ''}`}
                aria-current={s === step ? 'step' : undefined}
                disabled={!reachable}
                onClick={() => setStep(s)}
              >
                <span className="unit__step-num">{index + 1}</span>
                {t.course.steps[s]}
              </button>
            </li>
          );
        })}
      </ol>

      {!open && <Banner tone="info">{t.course.lockedBanner}</Banner>}

      {step === 'learn' && (
        <>
          <Card padding="lg" tone={unit.skill} className="unit__objectives">
            <h2 className="w-section-title">{t.course.objectives}</h2>
            <ul>
              {content.objectives.map((o, i) => (
                <li key={i}>
                  <Icon name="target" size={16} /> {say(o)}
                </li>
              ))}
            </ul>
          </Card>
          {content.learn.map((section, i) => (
            <Card key={i} padding="lg" className="unit__section">
              <h2 className="w-section-title">{say(section.heading)}</h2>
              <Prose text={say(section.body)} />
            </Card>
          ))}
          {nav}
        </>
      )}

      {step === 'model' && (
        <>
          <Card padding="lg" className="unit__section">
            <p className="unit__situation">
              <strong>{t.course.situation}:</strong> {say(content.model.situation)}
            </p>
            <div className="model-email">
              <p className="model-email__subject">
                <span>{t.course.subject}:</span> <strong lang="en">{content.model.subject}</strong>
              </p>
              {content.model.parts.map((part, i) => (
                <div key={i} className="model-email__part">
                  <span className="model-email__label">{say(part.label)}</span>
                  <p className="model-email__text" lang="en">
                    {part.text}
                  </p>
                  <p className="model-email__note">
                    <Icon name="sparkles" size={14} /> {say(part.note)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
          <Card padding="lg" className="unit__section">
            <h2 className="w-section-title">{t.course.phrases}</h2>
            <div className="phrase-groups">
              {content.phrases.map((group, i) => (
                <div key={i} className="phrase-group">
                  <h3>{say(group.use)}</h3>
                  <ul lang="en">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
          {nav}
        </>
      )}

      {step === 'practice' && open && (
        <>
          <p className="unit__intro">{t.course.practiceIntro}</p>
          {content.drills.map((drill, i) => (
            <Card key={`${unit.id}-${i}`} padding="lg" className="drill">
              <p className="drill__prompt">
                <span className="drill__num">{i + 1}</span> {say(drill.prompt)}
              </p>
              {drill.type === 'choice' ? (
                <ChoiceDrill drill={drill} lang={lang} onAnswer={(correct) => setAnswers((a) => ({ ...a, [i]: correct }))} />
              ) : (
                <OrderDrill drill={drill} lang={lang} onAnswer={(correct) => setAnswers((a) => ({ ...a, [i]: correct }))} />
              )}
            </Card>
          ))}
          {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
          <div className="practice__actions unit__nav">
            <Button variant="secondary" icon="arrowLeft" onClick={() => setStep('model')}>
              {t.course.back}
            </Button>
            <Button icon="pen" onClick={() => void finishDrills()} disabled={!answeredAll} loading={busy}>
              {t.course.toWriting}
            </Button>
            <span className="quiz__hint">{answeredAll ? t.course.score(correctCount, content.drills.length) : t.course.answerAll}</span>
          </div>
        </>
      )}

      {step === 'write' && open && !result && (
        <div className="w-layout">
          <div className="unit__task">
            <WritingPromptCard task={task} />
            <Card padding="lg">
              <h2 className="w-section-title w-section-title--sm">{t.course.checklistTitle}</h2>
              <ul className="unit__checks">
                {content.checklist.map((c) => (
                  <li key={c.id}>
                    <Icon name="check" size={14} /> {say(c.label)}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card padding="lg" className="w-editor">
            <div className="w-editor__bar">
              <span className={`w-count ${words >= task.minWords ? 'w-count--ok' : ''}`}>{t.writing.words(words)}</span>
            </div>
            <textarea
              className="input w-editor__text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t.writing.placeholder}
              lang="en"
              spellCheck={false}
              disabled={busy}
            />
            {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
            <div className="practice__actions">
              <Button size="lg" icon="sparkles" onClick={() => void submit()} loading={busy} disabled={!enough}>
                {busy ? t.writing.scoring : t.writing.submit}
              </Button>
              {!enough && <span className="quiz__hint">{t.writing.tooShort(Math.round(task.minWords * 0.5))}</span>}
            </div>
          </Card>
        </div>
      )}

      {step === 'write' && result && (
        <>
          <ChecklistResult view={view} feedback={result.feedback} lang={lang} />
          <BandFeedback feedback={result.feedback} tone="writing" note={t.writing.estimateNote} />
          <WritingReview response={result.response} feedback={result.feedback} />
          <div className="practice__actions">
            {view.next && (
              <LinkButton to={unitPath(unit.skill, view.next.id)} icon="chevronRight">
                {t.course.nextLesson}: {view.next.title[locale]}
              </LinkButton>
            )}
            <Button variant="secondary" icon="pen" onClick={() => setResult(null)}>
              {t.course.writeAgain}
            </Button>
            <Button variant="ghost" icon="arrowLeft" onClick={backToCourse}>
              {t.course.allLessons}
            </Button>
          </div>
          {view.progress?.bestBand != null && <Badge tone="success">{t.course.best(view.progress.bestBand)}</Badge>}
        </>
      )}
    </div>
  );
};
