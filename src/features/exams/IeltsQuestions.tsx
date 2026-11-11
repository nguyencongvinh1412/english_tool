/**
 * IeltsQuestions
 * Listening/reading questions grouped into blocks of one type (multiple choice,
 * TRUE/FALSE/NOT GIVEN, gap fill) with IELTS-style instructions, for taking or reviewing a test
 */
import type React from 'react';
import { Fragment } from 'react';
import { Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { questionId, TFNG_VALUES, type IeltsQuestion } from '@/shared/ieltsApi';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

interface IeltsQuestionsProps {
  groupId: string;
  questions: IeltsQuestion[];
  /** Number of the first question (numbering runs through a component, 1-40) */
  firstNumber: number;
  answers: Record<string, number | string>;
  flags: string[];
  review: boolean;
  onAnswer?: (id: string, value: number | string) => void;
  onToggleFlag?: (id: string) => void;
}

/**
 * Consecutive questions of the same kind: same type, and for gaps the same word limit, for matching the same list
 */
function blocksOf(questions: IeltsQuestion[]): { type: IeltsQuestion['type']; start: number; end: number; wordLimit?: number; list?: string }[] {
  const blocks: { type: IeltsQuestion['type']; start: number; end: number; wordLimit?: number; list?: string }[] = [];
  questions.forEach((q, i) => {
    const last = blocks.at(-1);
    const limit = q.type === 'gap' ? q.wordLimit : undefined;
    const list = q.type === 'match' ? q.options.join('|') : undefined;
    if (last && last.type === q.type && last.wordLimit === limit && last.list === list) last.end = i;
    else blocks.push({ type: q.type, start: i, end: i, wordLimit: limit, list });
  });
  return blocks;
}

/**
 * The list a block of matching questions shares, when every question of the block carries the same list
 */
function sharedOptionsOf(questions: IeltsQuestion[], block: { type: IeltsQuestion['type']; start: number; end: number }): string[] | null {
  if (block.type !== 'match') return null;
  const first = questions[block.start];
  if (first.type !== 'match') return null;
  const same = questions.slice(block.start, block.end + 1).every((q) => q.type === 'match' && q.options.join('|') === first.options.join('|'));
  // A short list (Yes / No / Not Given, A-B-C) reads better as the usual radio buttons
  return same && first.options.length >= 4 ? first.options : null;
}

/**
 * Whether a reviewed answer is right (mirrors the server's check)
 */
function isRight(q: IeltsQuestion, answer: number | string | undefined): boolean {
  if (answer === undefined) return false;
  if (q.type === 'mcq' || q.type === 'match') return q.anyOf ? q.anyOf.includes(answer as number) : answer === q.answerIndex;
  if (q.type === 'tfng') return typeof answer === 'number' && TFNG_VALUES[answer] === q.answer;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return typeof answer === 'string' && (q.answers ?? []).some((a) => norm(a) === norm(answer));
}

export const IeltsQuestions: React.FC<IeltsQuestionsProps> = ({ groupId, questions, firstNumber, answers, flags, review, onAnswer, onToggleFlag }) => {
  const { t } = useI18n();
  const tfngLabels = [t.ielts.tfTrue, t.ielts.tfFalse, t.ielts.tfNotGiven];

  return (
    <div className="ielts-qs">
      {blocksOf(questions).map((block) => (
        <section key={block.start} className="ielts-block">
          <header className="ielts-block__head">
            <p className="ielts-block__range">{t.ielts.questionsRange(firstNumber + block.start, firstNumber + block.end)}</p>
            <p className="ielts-block__how">
              {block.type === 'mcq' ? t.ielts.howMcq : block.type === 'match' ? t.ielts.howMatch : block.type === 'tfng' ? t.ielts.howTfng : t.ielts.howGap(block.wordLimit ?? 1)}
            </p>
          </header>

          {sharedOptionsOf(questions, block) && (
            <ol className="ielts-match__list" lang="en" type="A">
              {sharedOptionsOf(questions, block)!.map((option) => (
                <li key={option}>{option}</li>
              ))}
            </ol>
          )}

          <ol className="ielts-block__list" start={firstNumber + block.start}>
            {questions.slice(block.start, block.end + 1).map((q, offset) => {
              const index = block.start + offset;
              const id = questionId(groupId, index);
              const number = firstNumber + index;
              const chosen = answers[id];
              const flagged = flags.includes(id);
              const right = review && isRight(q, chosen);

              const flag = !review && (
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
              );

              if (q.type === 'gap') {
                const [before, ...rest] = q.prompt.split('____');
                return (
                  <li key={id} id={`q-${id}`} className={`ielts-q ielts-q--gap ${review ? (right ? 'ielts-q--right' : 'ielts-q--wrong') : ''}`}>
                    <span className="exam-q__number">{number}</span>
                    <p className="ielts-gap" lang="en">
                      {before}
                      <input
                        className="ielts-gap__input"
                        aria-label={t.exams.question(number)}
                        value={typeof chosen === 'string' ? chosen : ''}
                        disabled={review}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => onAnswer?.(id, e.target.value)}
                      />
                      {rest.join('____')}
                    </p>
                    {flag}
                    {review && (
                      <p className="exam-q__explain">
                        {right ? '✓' : `${t.exams.correctAnswer}: ${(q.answers ?? []).join(' / ')}`}
                        {q.explanation && <span lang="en"> · {q.explanation}</span>}
                      </p>
                    )}
                  </li>
                );
              }

              // Matching against one shared list: pick a letter for each item
              if (q.type === 'match' && sharedOptionsOf(questions, block)) {
                return (
                  <li key={id} id={`q-${id}`} className={`ielts-q ielts-q--match ${review ? (right ? 'ielts-q--right' : 'ielts-q--wrong') : ''}`}>
                    <div className="exam-q__head">
                      <span className="exam-q__number">{number}</span>
                      <span className="exam-q__prompt" lang="en">
                        {q.prompt}
                      </span>
                      <select
                        className="input ielts-match__select"
                        aria-label={t.exams.question(number)}
                        value={typeof chosen === 'number' ? chosen : ''}
                        disabled={review}
                        onChange={(e) => e.target.value !== '' && onAnswer?.(id, Number(e.target.value))}
                      >
                        <option value="">–</option>
                        {q.options.map((_, optionIndex) => (
                          <option key={optionIndex} value={optionIndex}>
                            {LETTERS[optionIndex]}
                          </option>
                        ))}
                      </select>
                      {flag}
                    </div>
                    {review && (
                      <p className="exam-q__explain">
                        {chosen === undefined ? t.exams.noAnswer : right ? '✓' : `${t.exams.yourAnswer}: ${LETTERS[chosen as number]}`}
                        {' · '}
                        {t.exams.correctAnswer}: {q.anyOf ? q.anyOf.map((i) => LETTERS[i]).join(' / ') : LETTERS[q.answerIndex ?? 0]}
                        {q.explanation && <span lang="en"> · {q.explanation}</span>}
                      </p>
                    )}
                  </li>
                );
              }

              const lettered = q.type === 'mcq' || q.type === 'match';
              const options = lettered ? q.options : tfngLabels;
              const correct = lettered ? q.answerIndex : q.answer ? TFNG_VALUES.indexOf(q.answer) : undefined;
              return (
                <li key={id} id={`q-${id}`} className="ielts-q">
                  <div className="exam-q__head">
                    <span className="exam-q__number">{number}</span>
                    <span className="exam-q__prompt" lang="en">
                      {q.prompt}
                    </span>
                    {flag}
                  </div>
                  <div
                    className={`exam-q__options ${q.type === 'tfng' ? 'ielts-tfng' : ''}`}
                    role="radiogroup"
                    aria-label={t.exams.question(number)}
                  >
                    {options.map((option, optionIndex) => {
                      const isChosen = chosen === optionIndex;
                      const isRightOption = optionIndex === correct || (lettered && (q.anyOf?.includes(optionIndex) ?? false));
                      const state = review ? (isRightOption ? 'right' : isChosen ? 'wrong' : '') : isChosen ? 'chosen' : '';
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
                          {lettered && <span className="exam-opt__letter">{LETTERS[optionIndex]}</span>}
                          <span lang={lettered ? 'en' : undefined}>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                  {review && (
                    <p className="exam-q__explain">
                      {chosen === undefined ? t.exams.noAnswer : right ? '✓' : `${t.exams.yourAnswer}: ${lettered ? LETTERS[chosen as number] : tfngLabels[chosen as number]}`}
                      {' · '}
                      {t.exams.correctAnswer}: {lettered ? LETTERS[correct ?? 0] : tfngLabels[correct ?? 0]}
                      {q.explanation && (
                        <Fragment>
                          {' · '}
                          <span lang="en">{q.explanation}</span>
                        </Fragment>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
};
