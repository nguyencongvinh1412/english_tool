import { describe, expect, it } from 'vitest';
import type { JaMcq, QuizQuestion } from '@/shared/contentApi';
import { jaEntries, quizEntries, splitDuration, summarizeSession, type FinishedRound } from './session';

const questions: QuizQuestion[] = [
  { type: 'mcq', prompt: 'Where are they?', options: ['Station', 'Airport', 'Hotel', 'Cafe'], answerIndex: 1, explanation: 'They mention the gate.' },
  { type: 'tfng', prompt: 'The flight is late.', answer: 'not_given', explanation: 'Not said.' },
];
const label = (q: QuizQuestion, value: string) => (q.type === 'mcq' ? q.options[Number(value)] : value);

describe('quizEntries', () => {
  it('marks right, wrong and unanswered questions', () => {
    const entries = quizEntries(questions, ['1', 'true'], label);
    expect(entries[0]).toMatchObject({ yourAnswer: 'Airport', correctAnswer: 'Airport', correct: true });
    expect(entries[1]).toMatchObject({ yourAnswer: 'true', correctAnswer: 'not_given', correct: false });
    expect(quizEntries(questions, [null, null], label).every((e) => e.yourAnswer === null && !e.correct)).toBe(true);
  });
});

describe('summarizeSession', () => {
  const rounds: FinishedRound[] = [
    { title: 'Airport', entries: quizEntries(questions, ['1', 'not_given'], label), durationSec: 90 },
    { title: 'Hotel', entries: quizEntries(questions, ['0', 'true'], label), durationSec: 65 },
  ];

  it('totals the rounds and lists mistakes with their round', () => {
    const summary = summarizeSession(rounds);
    expect(summary).toMatchObject({ rounds: 2, correct: 2, total: 4, percent: 50, durationSec: 155 });
    expect(summary.perRound.map((r) => r.percent)).toEqual([100, 0]);
    expect(summary.mistakes.map((m) => [m.round, m.roundTitle, m.prompt])).toEqual([
      [2, 'Hotel', 'Where are they?'],
      [2, 'Hotel', 'The flight is late.'],
    ]);
  });

  it('handles an empty session', () => {
    expect(summarizeSession([])).toMatchObject({ rounds: 0, total: 0, percent: 0, mistakes: [] });
  });
});

describe('splitDuration', () => {
  it('splits seconds into minutes and seconds', () => {
    expect(splitDuration(155)).toEqual({ minutes: 2, seconds: 35 });
    expect(splitDuration(-3)).toEqual({ minutes: 0, seconds: 0 });
  });
});

describe('jaEntries', () => {
  const ja: JaMcq[] = [
    { prompt: '駅{えき}はどこ？', options: ['右{みぎ}', '左{ひだり}', '前{まえ}', '後{うしろ}'], answerIndex: 1, explanation: { vi: 'Bên trái.', en: 'On the left.' } },
  ];

  it('uses the explanation in the UI language and compares by option index', () => {
    expect(jaEntries(ja, ['1'], 'vi')[0]).toMatchObject({ correct: true, correctAnswer: '左{ひだり}', explanation: 'Bên trái.' });
    expect(jaEntries(ja, ['0'], 'en')[0]).toMatchObject({ correct: false, yourAnswer: '右{みぎ}', explanation: 'On the left.' });
    expect(jaEntries(ja, [null], 'en')[0]).toMatchObject({ correct: false, yourAnswer: null });
  });
});
