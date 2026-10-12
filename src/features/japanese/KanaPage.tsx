/**
 * KanaPage
 * Hiragana and katakana charts (tap to hear) and a quick recognition quiz
 */
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, Card, Icon, PageHeader, ProgressBar, Segmented } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useProgress } from '@/shared/progress';
import { prefetchScript, speakOnce } from '@/shared/speech';
import { ensureJapaneseFont } from '@/shared/ja/furigana';
import { answerOf, buildKanaQuiz, kanaCells, KANA_ROWS, toKatakana, type KanaGroup, type KanaQuestion, type KanaScript } from './kana';
import './kana.css';

const QUIZ_LENGTH = 10;

/**
 * Plays one kana with the Japanese voice
 */
const say = (kana: string) => speakOnce(kana, 0.9);

/**
 * Tap-to-hear chart of one group
 */
const KanaChart: React.FC<{ script: KanaScript; group: KanaGroup }> = ({ script, group }) => {
  const { t } = useI18n();
  const [active, setActive] = useState<string | null>(null);
  const columns = group === 'combo' ? 3 : 5;

  // Warm the voice cache so the first taps play instantly
  useEffect(() => {
    prefetchScript(
      kanaCells(script, [group]).map((cell) => ({ speaker: 'A' as const, text: cell.kana })),
      { A: 'female' }
    );
  }, [script, group]);

  return (
    <div className="kana-chart" style={{ ['--cols' as string]: columns }} role="grid" aria-label={t.kana.groups[group]}>
      {KANA_ROWS[group].map((row, r) => (
        <div key={r} className="kana-chart__row" role="row">
          {row.map((cell, c) => {
            if (!cell) return <span key={c} className="kana-cell kana-cell--empty" role="gridcell" />;
            const kana = script === 'katakana' ? toKatakana(cell.kana) : cell.kana;
            return (
              <button
                key={c}
                type="button"
                role="gridcell"
                className={`kana-cell ${active === kana ? 'kana-cell--active' : ''}`}
                onClick={() => {
                  setActive(kana);
                  say(kana);
                }}
                aria-label={`${kana} ${cell.romaji}`}
              >
                <span className="kana-cell__char" lang="ja">
                  {kana}
                </span>
                <span className="kana-cell__romaji">{cell.romaji}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/**
 * One question at a time; reading questions show the kana, listening questions play it
 */
const KanaQuiz: React.FC<{ script: KanaScript; group: KanaGroup; onExit: () => void }> = ({ script, group, onExit }) => {
  const { t } = useI18n();
  const { record } = useProgress();
  const [round, setRound] = useState(0);
  const questions = useMemo<KanaQuestion[]>(
    () => buildKanaQuiz(kanaCells(script, [group]), QUIZ_LENGTH),
    // A new round reshuffles
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [script, group, round]
  );
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const startedAt = useRef(0);

  const question = questions[index];

  useEffect(() => {
    startedAt.current = Date.now();
  }, [round]);

  // Listening questions play as soon as they appear
  useEffect(() => {
    if (!finished && question?.type === 'listen') say(question.cell.kana);
  }, [question, finished]);

  const choose = (option: string) => {
    if (picked) return;
    setPicked(option);
    if (option === answerOf(question)) setScore((s) => s + 1);
    else if (question.type === 'read') say(question.cell.kana);
  };

  const next = () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    setFinished(true);
    void record({
      activity: 'kana',
      contentRef: `${script}-${group}`,
      title: `${t.kana.scripts[script]} · ${t.kana.groups[group]}`,
      score,
      maxScore: questions.length,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
    }).catch(() => {});
  };

  const restart = () => {
    setRound((r) => r + 1);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setFinished(false);
  };

  if (finished) {
    return (
      <Card padding="lg" className="kana-quiz kana-quiz--done reveal">
        <p className="kana-quiz__score">
          {score}/{questions.length}
        </p>
        <Banner tone={score / questions.length >= 0.8 ? 'success' : 'info'}>
          {score / questions.length >= 0.8 ? t.kana.great : t.kana.keepGoing}
        </Banner>
        <div className="kana-quiz__actions">
          <Button variant="ghost" icon="arrowLeft" onClick={onExit}>
            {t.kana.backToChart}
          </Button>
          <Button icon="bolt" onClick={restart}>
            {t.kana.again}
          </Button>
        </div>
      </Card>
    );
  }

  const answer = answerOf(question);

  return (
    <Card padding="lg" className="kana-quiz">
      <div className="kana-quiz__top">
        <Button variant="ghost" size="sm" icon="x" onClick={onExit} aria-label={t.kana.backToChart} />
        <ProgressBar value={(index / questions.length) * 100} tone="brand" size="sm" label={t.kana.progress(index + 1, questions.length)} />
        <span className="kana-quiz__count">
          {index + 1}/{questions.length}
        </span>
      </div>

      <p className="kana-quiz__prompt">{question.type === 'read' ? t.kana.readPrompt : t.kana.listenPrompt}</p>

      {question.type === 'read' ? (
        <p className="kana-quiz__char" lang="ja">
          {question.cell.kana}
        </p>
      ) : (
        <button type="button" className="kana-quiz__play" onClick={() => say(question.cell.kana)} aria-label={t.kana.playAgain}>
          <Icon name="headphones" size={44} />
        </button>
      )}

      <div className="kana-quiz__options">
        {question.options.map((option) => {
          const state = picked ? (option === answer ? 'right' : option === picked ? 'wrong' : 'idle') : 'idle';
          return (
            <button
              key={option}
              type="button"
              lang={question.type === 'listen' ? 'ja' : undefined}
              className={`kana-opt kana-opt--${state} ${question.type === 'listen' ? 'kana-opt--kana' : ''}`}
              onClick={() => choose(option)}
              disabled={picked !== null}
            >
              {option}
            </button>
          );
        })}
      </div>

      {picked && (
        <div className={`kana-quiz__feedback kana-quiz__feedback--${picked === answer ? 'right' : 'wrong'}`}>
          <span>
            {picked === answer ? t.kana.correct : t.kana.answerWas}{' '}
            <strong lang="ja">{question.cell.kana}</strong> = <strong>{question.cell.romaji}</strong>
          </span>
          <Button onClick={next} icon={index + 1 < questions.length ? 'chevronRight' : 'check'}>
            {index + 1 < questions.length ? t.kana.next : t.kana.finish}
          </Button>
        </div>
      )}
    </Card>
  );
};

export const KanaPage: React.FC = () => {
  const { t } = useI18n();
  const [script, setScript] = useState<KanaScript>('hiragana');
  const [group, setGroup] = useState<KanaGroup>('basic');
  const [quizzing, setQuizzing] = useState(false);

  useEffect(ensureJapaneseFont, []);

  return (
    <div className="kana">
      <PageHeader eyebrow="日本語" title={t.kana.title} description={t.kana.subtitle} />

      <div className="kana__controls">
        <Segmented<KanaScript>
          label={t.kana.scriptLabel}
          value={script}
          onChange={(value) => {
            setScript(value);
            setQuizzing(false);
          }}
          options={[
            { value: 'hiragana', label: 'ひらがな' },
            { value: 'katakana', label: 'カタカナ' },
          ]}
        />
        <Segmented<KanaGroup>
          label={t.kana.groupLabel}
          value={group}
          onChange={(value) => {
            setGroup(value);
            setQuizzing(false);
          }}
          options={(['basic', 'dakuten', 'combo'] as const).map((g) => ({ value: g, label: t.kana.groups[g] }))}
        />
      </div>

      {quizzing ? (
        <KanaQuiz key={`${script}-${group}`} script={script} group={group} onExit={() => setQuizzing(false)} />
      ) : (
        <>
          <Card padding="md" className="kana__practice">
            <p>{t.kana.practiceBody(t.kana.scripts[script], t.kana.groups[group])}</p>
            <Button icon="bolt" onClick={() => setQuizzing(true)}>
              {t.kana.practice}
            </Button>
          </Card>
          <p className="kana__hint">{t.kana.tapHint}</p>
          <KanaChart script={script} group={group} />
        </>
      )}
    </div>
  );
};
