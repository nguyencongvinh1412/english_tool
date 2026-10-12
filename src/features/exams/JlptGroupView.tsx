/**
 * JlptGroupView
 * One JLPT question group (texts, audio, questions) for taking or reviewing a test.
 * Readings (furigana) are hidden while the test runs, as on the real JLPT, and shown in the review.
 */
import type React from 'react';
import { useEffect, useMemo } from 'react';
import { Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { JaText } from '@/shared/ja/JaText';
import { plainText } from '@/shared/ja/text';
import { prefetchScript, type Genders, type ScriptLine } from '@/shared/speech';
import { SPOKEN_OPTIONS, type JlptGroup, type Mondai } from '@/shared/jlptApi';
import { mediaUrl } from '@/shared/examApi';
import { GroupAudio } from './ExamGroupView';

/** Instructions as printed in the test book (with readings) */
const INSTRUCTIONS: Record<Mondai, string> = {
  'kanji-reading': '＿＿＿のことばは　ひらがなで　どう　書{か}きますか。',
  orthography: '＿＿＿のことばは　どう　書{か}きますか。',
  'word-formation': '（　）に入{い}れるのに　最{もっと}もよいものを、えらんでください。',
  context: '（　）に　なにを　入{い}れますか。いちばん　いい　ものを　えらんでください。',
  paraphrase: '＿＿＿の　ぶんと　だいたい　おなじ　いみの　ものを　えらんでください。',
  usage: 'つぎの　ことばの　つかいかたで　いちばん　いい　ものを　えらんでください。',
  'grammar-form': '（　）に　何{なに}を　入{い}れますか。いちばん　いい　ものを　えらんでください。',
  'sentence-order': '＿★＿に　入{はい}る　ものは　どれですか。いちばん　いい　ものを　えらんでください。',
  'text-grammar': 'ぶんしょうを　読{よ}んで、（1）から　の　中{なか}に　入{はい}る　いちばん　いい　ものを　えらんでください。',
  'reading-short': 'つぎの　ぶんしょうを　読{よ}んで、しつもんに　こたえてください。',
  'reading-mid': 'つぎの　ぶんしょうを　読{よ}んで、しつもんに　こたえてください。',
  'reading-long': 'つぎの　文章{ぶんしょう}を　読{よ}んで、質問{しつもん}に　答{こた}えてください。',
  'reading-integrated': 'AとBの　文章{ぶんしょう}を　読{よ}んで、質問{しつもん}に　答{こた}えてください。',
  'reading-thematic': 'つぎの　文章{ぶんしょう}を　読{よ}んで、質問{しつもん}に　答{こた}えてください。',
  'info-search': '右{みぎ}の　ページを　見{み}て、質問{しつもん}に　答{こた}えてください。',
  'listen-task': 'はじめに　しつもんを　聞{き}いて　ください。それから　話{はなし}を　聞{き}いて、いちばん　いい　ものを　えらんで　ください。',
  'listen-point': 'はじめに　しつもんを　聞{き}いて　ください。それから　話{はなし}を　聞{き}いて、いちばん　いい　ものを　えらんで　ください。',
  'listen-summary': '話{はなし}を　聞{き}いて、いちばん　いい　ものを　えらんで　ください。',
  'listen-expression': '絵{え}の　かわりに　場面{ばめん}の　説明{せつめい}を　読{よ}んで、ただしい　ことばを　えらんで　ください。',
  'listen-response': 'ぶんを　聞{き}いて、いちばん　いい　へんじを　えらんで　ください。',
  'listen-integrated': '長{なが}めの　話{はなし}を　聞{き}いて、いちばん　いい　ものを　えらんで　ください。',
};

const NUMBERS = ['１', '２', '３', '４'];
const SPOKEN_NUMBERS = ['いち', 'に', 'さん', 'よん'];

/**
 * Japanese text with [[underlined]] targets; readings only when shown
 */
const RichText: React.FC<{ text: string; readings: boolean }> = ({ text, readings }) => {
  const pieces = text.split(/\[\[(.+?)\]\]/);
  return (
    <>
      {pieces.map((piece, i) => {
        const shown = readings ? piece : plainText(piece);
        if (!shown) return null;
        return i % 2 === 1 ? (
          <u key={i} className="jlpt-target">
            <JaText text={shown} />
          </u>
        ) : (
          <JaText key={i} text={shown} />
        );
      })}
    </>
  );
};

/**
 * What the recording says for a listening group: number, the question first (課題/ポイント理解),
 * the talk, the question again, and spoken options
 */
function listeningLines(mondai: Mondai, group: JlptGroup, firstNumber: number): ScriptLine[] {
  const spokenOptions = SPOKEN_OPTIONS.includes(mondai);
  const questionFirst = mondai === 'listen-task' || mondai === 'listen-point';
  return (group.payload.items ?? []).flatMap((item, index) => [
    { speaker: 'C' as const, text: `${firstNumber + index}番{ばん}。` },
    ...(item.situation ? [{ speaker: 'C' as const, text: item.situation }] : []),
    ...(questionFirst && item.question ? [{ speaker: 'C' as const, text: item.question }] : []),
    ...item.script.map((line) => ({ speaker: line.speaker, text: line.text })),
    ...(item.question ? [{ speaker: 'C' as const, text: item.question }] : []),
    ...(spokenOptions
      ? item.options.map((option, i) => ({ speaker: (mondai === 'listen-response' ? 'B' : 'C') as 'B' | 'C', text: `${SPOKEN_NUMBERS[i]}、${option}` }))
      : []),
  ]);
}

interface JlptGroupViewProps {
  mondai: Mondai;
  group: JlptGroup;
  firstNumber: number;
  answers: Record<string, number>;
  flags: string[];
  review?: boolean;
  playOnce?: boolean;
  played?: boolean;
  onPlayed?: () => void;
  onAnswer?: (questionId: string, choice: number) => void;
  onToggleFlag?: (questionId: string) => void;
}

export const JlptGroupView: React.FC<JlptGroupViewProps> = ({
  mondai,
  group,
  firstNumber,
  answers,
  flags,
  review = false,
  playOnce = false,
  played = false,
  onPlayed,
  onAnswer,
  onToggleFlag,
}) => {
  const { t, locale } = useI18n();
  const payload = group.payload;
  const listening = Boolean(payload.items);
  const hideOptions = listening && SPOKEN_OPTIONS.includes(mondai) && !review;
  const genders: Genders = {
    A: payload.speakers?.A.gender ?? 'female',
    B: payload.speakers?.B?.gender ?? (payload.speakers?.A.gender === 'male' ? 'female' : 'male'),
    C: 'female',
  };
  const lines = useMemo(() => (listening ? listeningLines(mondai, group, firstNumber) : []), [listening, mondai, group, firstNumber]);

  // Prepare the voices while the learner reads the instructions
  useEffect(() => {
    if (lines.length > 0 && !payload.audio) prefetchScript(lines, genders);
    // genders follows the payload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, payload.audio]);

  const questions = listening
    ? (payload.items ?? []).map((item) => ({
        // Questions are heard, not printed; 発話表現's situation stands in for the picture
        prompt: [item.situation, review ? item.question : undefined].filter(Boolean).join('　'),
        options: item.options,
        answerIndex: item.answerIndex,
        explanation: item.explanation,
        imageAssetId: item.imageAssetId,
      }))
    : (payload.questions ?? []);

  return (
    <div className="exam-group jlpt-group">
      <p className="exam-group__instructions">
        <JaText text={INSTRUCTIONS[mondai]} />
        <span className="jlpt-group__hint">{t.jlpt.mondai[mondai].hint}</span>
      </p>

      {listening && (
        <GroupAudio
          lines={lines}
          recording={payload.audio}
          genders={genders}
          playOnce={playOnce && !review}
          played={played && !review}
          onPlayed={() => onPlayed?.()}
        />
      )}

      {payload.passages?.map((passage, i) => (
        <div key={i} className="exam-text jlpt-text" lang="ja">
          {passage.label && <p className="exam-text__kind">{passage.label}</p>}
          {passage.imageAssetId && <img className="jlpt-picture" src={mediaUrl(passage.imageAssetId)} alt={passage.label ?? passage.title ?? ''} loading="lazy" />}
          {passage.title && (
            <h3>
              <RichText text={passage.title} readings={review} />
            </h3>
          )}
          {passage.text && (
            <p>
              <RichText text={passage.text} readings={review} />
            </p>
          )}
        </div>
      ))}

      {review && listening && (
        <details className="exam-transcript">
          <summary>{t.exams.transcript}</summary>
          {(payload.items ?? []).map((item, i) => (
            <div key={i} className="jlpt-transcript__item">
              <strong>{firstNumber + i}.</strong>
              {item.script.map((line, j) => (
                <p key={j}>
                  {payload.speakers?.[line.speaker]?.name ?? line.speaker}：<JaText text={line.text} />
                </p>
              ))}
              {item.question && (
                <p>
                  <JaText text={item.question} />
                </p>
              )}
            </div>
          ))}
        </details>
      )}

      <ol className="exam-questions" start={firstNumber}>
        {questions.map((question, index) => {
          const id = `${group.id}:${index}`;
          const chosen = answers[id];
          const flagged = flags.includes(id);
          const correct = question.answerIndex;
          return (
            <li key={id} id={`q-${id}`} className="exam-q">
              <div className="exam-q__head">
                <span className="exam-q__number">{firstNumber + index}</span>
                {question.prompt && (
                  <span className="exam-q__prompt" lang="ja">
                    <RichText text={question.prompt} readings={review} />
                  </span>
                )}
                {!review && (
                  <button
                    type="button"
                    className={`exam-flag ${flagged ? 'exam-flag--on' : ''}`}
                    onClick={() => onToggleFlag?.(id)}
                    aria-pressed={flagged}
                    title={flagged ? t.exams.unflag : t.exams.flag}
                  >
                    <Icon name="flag" size={16} />
                    <span className="visually-hidden">{flagged ? t.exams.unflag : t.exams.flag}</span>
                  </button>
                )}
              </div>
              {question.imageAssetId && (
                <img className="exam-q__photo jlpt-picture" src={mediaUrl(question.imageAssetId)} alt={t.exams.question(firstNumber + index)} loading="lazy" />
              )}
              <div className={`exam-q__options ${hideOptions ? 'jlpt-options--spoken' : ''}`} role="radiogroup" aria-label={t.exams.question(firstNumber + index)}>
                {question.options.map((option, optionIndex) => {
                  const isChosen = chosen === optionIndex;
                  const state = review ? (optionIndex === correct ? 'right' : isChosen ? 'wrong' : '') : isChosen ? 'chosen' : '';
                  return (
                    <label key={optionIndex} className={`exam-opt ${state ? `exam-opt--${state}` : ''}`}>
                      <input
                        type="radio"
                        className="visually-hidden"
                        name={id}
                        value={optionIndex}
                        checked={isChosen}
                        disabled={review}
                        onChange={() => onAnswer?.(id, optionIndex)}
                      />
                      <span className="exam-opt__letter">{NUMBERS[optionIndex]}</span>
                      {/* Picture choices are printed as their numbers only */}
                      {!hideOptions && option.trim() !== String(optionIndex + 1) && (
                        <span lang="ja">
                          <RichText text={option} readings={review} />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              {review && (
                <p className="exam-q__explain">
                  {chosen === undefined ? t.exams.noAnswer : chosen === correct ? '✓' : `${t.exams.yourAnswer}: ${NUMBERS[chosen]}`} · {t.exams.correctAnswer}:{' '}
                  {NUMBERS[correct ?? 0]}
                  {question.explanation && <span> · {locale === 'vi' ? question.explanation.vi : question.explanation.en}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
