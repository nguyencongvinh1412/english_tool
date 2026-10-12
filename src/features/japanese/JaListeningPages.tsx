/**
 * Japanese listening: comprehension quizzes and dictation (type what you hear in kana or kanji)
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, Icon, Segmented } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { prefetchScript, speakOnce, speakScript } from '@/shared/speech';
import { JaText } from '@/shared/ja/JaText';
import { matchJapanese, type MatchUnit } from '@/shared/ja/text';
import { isImeComposing } from '@/shared/ime';
import { JLPT_CONTENT_LEVELS, type ContentItem, type JaDictation, type JaListening } from '@/shared/contentApi';
import { ContentLibrary } from '@/features/practice/ContentLibrary';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import '@/features/listening/listening-quiz.css';
import '@/features/listening/dictation.css';
import { JaQuiz } from './JaQuiz';
import { useJaLevel, useJaRecorder } from './useJaPractice';
import './japanese.css';

const SPEEDS = [
  { value: '1', label: '1×' },
  { value: '0.85', label: '0.85×' },
  { value: '0.7', label: '0.7×' },
];

/* ---------- Comprehension ---------- */

const JaListeningSession: React.FC<{ item: ContentItem<JaListening>; onBack: () => void }> = ({ item, onBack }) => {
  const { t } = useI18n();
  const { furigana } = useJaLevel();
  const quiz = item.payload;
  const [speed, setSpeed] = useState('1');
  const [currentLine, setCurrentLine] = useState(-1);
  const [plays, setPlays] = useState(0);
  const [checked, setChecked] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const { start, finish } = useJaRecorder(item, 'listening-quiz');
  const genders = { A: quiz.speakers.A.gender, B: quiz.speakers.B?.gender };
  const isPlaying = currentLine >= 0;

  useEffect(() => {
    start();
    prefetchScript(quiz.script, { A: quiz.speakers.A.gender, B: quiz.speakers.B?.gender });
    return () => stopRef.current?.();
  }, [quiz, start]);

  const play = () => {
    stopRef.current?.();
    setPlays((n) => n + 1);
    stopRef.current = speakScript(quiz.script, genders, Number(speed), setCurrentLine);
  };

  const speakerName = (key: 'A' | 'B') => quiz.speakers[key]?.name ?? key;

  return (
    <div className="practice" style={{ ['--skill' as string]: 'var(--listening)', ['--skill-edge' as string]: 'var(--listening-edge)' }}>
      <PracticeHeader title={quiz.title} level={item.level} onBack={onBack} />

      <Card padding="lg" className="lq-player">
        <button
          type="button"
          className={`lq-play ${isPlaying ? 'lq-play--on' : ''}`}
          onClick={isPlaying ? () => stopRef.current?.() : play}
          aria-label={isPlaying ? t.listening.stop : t.listening.play}
        >
          <Icon name={isPlaying ? 'x' : 'headphones'} size={34} />
        </button>
        <div className="lq-player__meta">
          <p className="lq-player__title">{isPlaying ? t.listening.stop : t.listening.play}</p>
          <p className="lq-player__sub">
            {quiz.format === 'dialogue' ? `${speakerName('A')} & ${speakerName('B')}` : speakerName('A')} · {t.listening.replays(plays)}
          </p>
        </div>
        <Segmented label={t.dictation.speed} value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ ...s, tone: 'listening' }))} />
      </Card>

      <div className="practice__narrow">
        <JaQuiz
          questions={quiz.questions}
          onChecked={(correct, total) => {
            setChecked(true);
            finish(correct, total);
          }}
        />

        <Card padding="lg" className="lq-transcript">
          <div className="lq-transcript__head">
            <h2 className="lq-transcript__title">{t.listening.transcript}</h2>
            {checked && (
              <Button size="sm" variant="secondary" onClick={() => setShowTranscript((v) => !v)}>
                {showTranscript ? t.listening.hideTranscript : t.listening.showTranscript}
              </Button>
            )}
          </div>
          {!checked ? (
            <p className="lq-transcript__locked">
              <Icon name="lock" size={16} /> {t.listening.transcriptLocked}
            </p>
          ) : (
            showTranscript && (
              <ol className="lq-lines">
                {quiz.script.map((line, index) => (
                  <li key={index} className={`lq-line lq-line--${line.speaker} ${currentLine === index ? 'lq-line--active' : ''}`}>
                    <span className="lq-line__speaker">{speakerName(line.speaker)}</span>
                    <JaText text={line.text} defaultMode={furigana} />
                  </li>
                ))}
              </ol>
            )
          )}
        </Card>
      </div>
    </div>
  );
};

export const JaListeningPage: React.FC = () => {
  const { t } = useI18n();
  const { level } = useJaLevel();
  const [item, setItem] = useState<ContentItem<JaListening> | null>(null);

  if (item) return <JaListeningSession key={item.id} item={item} onBack={() => setItem(null)} />;
  return (
    <ContentLibrary<JaListening>
      kind="ja-listening"
      tone="listening"
      icon="headphones"
      eyebrow="日本語"
      title={t.skills.activities.jaListening.title}
      description={t.skills.activities.jaListening.description}
      levels={JLPT_CONTENT_LEVELS}
      defaultLevel={level}
      onOpen={setItem}
    />
  );
};

/* ---------- Dictation ---------- */

/**
 * The sentence as checked: right parts shown, the rest hidden as blanks to fill
 */
const CheckedSentence: React.FC<{ units: MatchUnit[] }> = ({ units }) => (
  <p className="ja-dict__answer" lang="ja">
    {units.map((unit, index) =>
      unit.ok ? (
        unit.reading ? (
          <ruby key={index}>
            {unit.text}
            <rt>{unit.reading}</rt>
          </ruby>
        ) : (
          <span key={index}>{unit.text}</span>
        )
      ) : (
        <span key={index} className="ja-dict__blank" aria-label="?">
          {'＿'.repeat(Math.max(1, [...unit.text].length))}
        </span>
      )
    )}
  </p>
);

const JaDictationSession: React.FC<{ item: ContentItem<JaDictation>; onBack: () => void }> = ({ item, onBack }) => {
  const { t, locale } = useI18n();
  const { furigana } = useJaLevel();
  const sentences = item.payload.sentences;
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [units, setUnits] = useState<MatchUnit[] | null>(null);
  const [done, setDone] = useState<'correct' | 'revealed' | null>(null);
  const [speed, setSpeed] = useState('1');
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { start, finish } = useJaRecorder(item, 'dictation');
  const sentence = sentences[index];

  const play = useCallback(() => speakOnce(sentence.text, Number(speed)), [sentence, speed]);

  useEffect(() => {
    start();
    prefetchScript(
      sentences.map((s) => ({ speaker: 'A' as const, text: s.text })),
      { A: 'female' }
    );
  }, [sentences, start]);

  // Each new sentence plays once on its own
  useEffect(() => {
    if (!finished) play();
    inputRef.current?.focus();
  }, [index, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = () => {
    if (!input.trim() || done) return;
    const result = matchJapanese(sentence.text, input);
    setUnits(result.units);
    if (result.correct) {
      setDone('correct');
      setScore((s) => s + 1);
    }
  };

  const next = () => {
    if (index + 1 < sentences.length) {
      setIndex(index + 1);
      setInput('');
      setUnits(null);
      setDone(null);
      return;
    }
    setFinished(true);
    finish(score, sentences.length);
  };

  if (finished) {
    return (
      <div className="practice" style={{ ['--skill' as string]: 'var(--listening)' }}>
        <PracticeHeader title={item.payload.title} level={item.level} onBack={onBack} />
        <Card padding="lg" className="ja-dict__summary">
          <p className="ja-dict__score">
            {score}/{sentences.length}
          </p>
          <Banner tone={score / sentences.length >= 0.8 ? 'success' : 'info'}>{t.jaPractice.dictationDone(score, sentences.length)}</Banner>
          <ol className="ja-dict__review">
            {sentences.map((s, i) => (
              <li key={i}>
                <JaText text={s.text} defaultMode={furigana} />
                <span className="ja-dict__translation">{s.translation[locale]}</span>
              </li>
            ))}
          </ol>
          <Button variant="secondary" icon="arrowLeft" onClick={onBack}>
            {t.library.back}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="practice" style={{ ['--skill' as string]: 'var(--listening)', ['--skill-edge' as string]: 'var(--listening-edge)' }}>
      <PracticeHeader title={item.payload.title} level={item.level} onBack={onBack} />

      <Card padding="lg" className="ja-dict">
        <div className="ja-dict__top">
          <span className="ja-dict__count">{t.jaPractice.sentenceOf(index + 1, sentences.length)}</span>
          <Segmented label={t.dictation.speed} value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ ...s, tone: 'listening' }))} />
        </div>

        <button type="button" className="lq-play ja-dict__play" onClick={play} aria-label={t.listening.play}>
          <Icon name="headphones" size={34} />
        </button>

        {units && <CheckedSentence units={done === 'revealed' ? units.map((u) => ({ ...u, ok: true })) : units} />}
        {done && <p className="ja-dict__translation">{sentence.translation[locale]}</p>}

        <textarea
          ref={inputRef}
          className="input ja-dict__input"
          lang="ja"
          rows={2}
          value={input}
          readOnly={done !== null}
          placeholder={t.jaPractice.typeHere}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter that picks a kanji in the IME must not check the sentence
            if (event.key !== 'Enter' || event.shiftKey || isImeComposing(event)) return;
            event.preventDefault();
            if (done) next();
            else check();
          }}
        />
        <p className="ja-dict__hint">{t.jaPractice.dictationHint}</p>

        {done === 'correct' && <Banner tone="success">{t.dictation.correct}</Banner>}
        {done === 'revealed' && <Banner tone="info">{t.dictation.revealed}</Banner>}
        {units && !done && <Banner tone="warning">{t.jaPractice.almost}</Banner>}

        <div className="ja-dict__actions">
          {done ? (
            <Button icon={index + 1 < sentences.length ? 'chevronRight' : 'check'} onClick={next}>
              {index + 1 < sentences.length ? t.dictation.next : t.dictation.finish}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => {
                setUnits(matchJapanese(sentence.text, input).units);
                setDone('revealed');
              }}>
                {t.jaPractice.reveal}
              </Button>
              <Button icon="check" onClick={check} disabled={!input.trim()}>
                {t.jaPractice.check}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};

export const JaDictationPage: React.FC = () => {
  const { t } = useI18n();
  const { level } = useJaLevel();
  const [item, setItem] = useState<ContentItem<JaDictation> | null>(null);

  if (item) return <JaDictationSession key={item.id} item={item} onBack={() => setItem(null)} />;
  return (
    <ContentLibrary<JaDictation>
      kind="ja-dictation"
      tone="listening"
      icon="type"
      eyebrow="日本語"
      title={t.skills.activities.jaDictation.title}
      description={t.skills.activities.jaDictation.description}
      levels={JLPT_CONTENT_LEVELS}
      defaultLevel={level}
      onOpen={setItem}
    />
  );
};
