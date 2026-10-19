/**
 * QuizSession
 * Runs rounds of one exercise kind on the same topic and level: after checking a round the learner can
 * ask for more questions (a fresh AI-made exercise) or end the session, then sees a summary and can review.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Button, Segmented } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { contentApi, type ContentItem, type QuizQuestion } from '@/shared/contentApi';
import { plainText } from '@/shared/ja/text';
import { summarizeSession, type FinishedRound, type ReviewEntry } from './session';
import { SessionSummaryView } from './SessionSummaryView';

/** Props every round component receives; it renders the exercise and passes these to QuizRunner */
export interface RoundProps<P> {
  item: ContentItem<P>;
  onBack: () => void;
  /** Reports the check to the session (the round still records its own progress attempt) */
  onChecked: (correct: number, total: number, answers: (string | null)[]) => void;
  /** "More questions" and "End session" buttons for the quiz footer */
  actions: React.ReactNode;
  /** Set when reviewing: the saved answers, shown checked and read-only */
  reviewAnswers?: (string | null)[];
}

/** What entriesOf needs to word a question for the current UI language */
export interface EntryContext {
  locale: 'en' | 'vi';
  /** Text of an English question's option value (the option's wording, or "True" / "False" / "Not given") */
  label: (question: QuizQuestion, value: string) => string;
}

interface QuizSessionProps<P> {
  first: ContentItem<P>;
  /** Skill token for accents, e.g. "listening" */
  tone: string;
  /** Turns a checked round's answers into the questions the summary lists */
  entriesOf: (payload: P, answers: (string | null)[], context: EntryContext) => ReviewEntry[];
  /** Renders question and answer text on the summary (Japanese shows furigana); plain text by default */
  renderText?: (text: string) => React.ReactNode;
  /** Language of the question text */
  lang?: string;
  Round: React.ComponentType<RoundProps<P>>;
  onBack: () => void;
}

interface RoundState<P> {
  item: ContentItem<P>;
  /** null until the learner checks this round */
  answers: (string | null)[] | null;
  durationSec: number;
}

type Stage = 'play' | 'summary' | 'review';

/** Most earlier titles sent to the AI so it does not repeat them */
const AVOID_LIMIT = 12;

export function QuizSession<P>({ first, tone, entriesOf, renderText, lang, Round, onBack }: QuizSessionProps<P>): React.JSX.Element {
  const { t, locale } = useI18n();
  const [rounds, setRounds] = useState<RoundState<P>[]>([{ item: first, answers: null, durationSec: 0 }]);
  const [stage, setStage] = useState<Stage>('play');
  const [reviewIndex, setReviewIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const startedAt = useRef(0);

  const current = rounds[rounds.length - 1];
  const finished = rounds.filter((round): round is RoundState<P> & { answers: (string | null)[] } => round.answers !== null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [rounds.length]);

  const onChecked = useCallback((_correct: number, _total: number, answers: (string | null)[]) => {
    const durationSec = Math.round((Date.now() - startedAt.current) / 1000);
    setRounds((list) => list.map((round, index) => (index === list.length - 1 ? { ...round, answers, durationSec } : round)));
  }, []);

  const more = async (): Promise<void> => {
    setGenerating(true);
    setError(null);
    try {
      const { item } = await contentApi.generate<P>({
        kind: first.kind,
        level: first.level ?? 'B1',
        topic: plain(first.topic ?? first.title).slice(0, 100),
        avoidTitles: rounds.map((round) => plain(round.item.title)).slice(-AVOID_LIMIT),
      });
      setRounds((list) => [...list, { item, answers: null, durationSec: 0 }]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (failure) {
      setError(failure);
    } finally {
      setGenerating(false);
    }
  };

  /** Titles of Japanese items carry reading markup the AI prompt should not see */
  const plain = (text: string): string => (first.kind.startsWith('ja-') ? plainText(text) : text);

  const label = (question: QuizQuestion, value: string): string =>
    question.type === 'mcq' ? question.options[Number(value)] : t.quiz.tfng[value as keyof typeof t.quiz.tfng];

  const finishedRounds: FinishedRound[] = finished.map((round) => ({
    title: round.item.title,
    entries: entriesOf(round.item.payload, round.answers, { locale, label }),
    durationSec: round.durationSec,
  }));

  if (stage === 'summary') {
    return (
      <SessionSummaryView
        tone={tone}
        topic={first.topic ?? first.title}
        renderText={renderText}
        lang={lang}
        summary={summarizeSession(finishedRounds)}
        onReview={() => {
          setReviewIndex(0);
          setStage('review');
        }}
        onBack={onBack}
      />
    );
  }

  if (stage === 'review') {
    const round = finished[Math.min(reviewIndex, finished.length - 1)];
    return (
      <div className="practice" style={{ ['--skill' as string]: `var(--${tone})`, ['--skill-edge' as string]: `var(--${tone}-edge)` }}>
        <div className="practice__actions">
          <Button variant="ghost" icon="arrowLeft" onClick={() => setStage('summary')}>
            {t.quiz.session.backToSummary}
          </Button>
          <h2 className="session-review__title">{t.quiz.session.reviewTitle}</h2>
          {finished.length > 1 && (
            <Segmented<string>
              label={t.quiz.session.reviewTitle}
              value={String(reviewIndex)}
              onChange={(value) => setReviewIndex(Number(value))}
              options={finished.map((_, index) => ({ value: String(index), label: t.quiz.session.setNumber(index + 1), tone }))}
            />
          )}
        </div>
        <Round key={round.item.id} item={round.item} onBack={onBack} onChecked={onChecked} actions={null} reviewAnswers={round.answers} />
      </div>
    );
  }

  const actions = (
    <>
      <Button icon="plus" onClick={() => void more()} disabled={current.answers === null || generating} loading={generating}>
        {t.quiz.session.more}
      </Button>
      <Button variant="secondary" icon="flag" onClick={() => setStage('summary')} disabled={finished.length === 0 || generating}>
        {t.quiz.session.end}
      </Button>
      {generating && <span className="quiz__hint">{t.quiz.session.generating}</span>}
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
    </>
  );

  return (
    <>
      {rounds.length > 1 && <p className="session-tag">{t.quiz.session.setNumber(rounds.length)}</p>}
      <Round key={current.item.id} item={current.item} onBack={onBack} onChecked={onChecked} actions={actions} />
    </>
  );
}
