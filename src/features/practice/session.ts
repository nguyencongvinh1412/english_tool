/**
 * Practice session helpers
 * A session is a run of rounds (each an AI-made exercise with its questions) on one topic and level.
 * These pure functions turn the rounds into the numbers and mistake list on the summary page.
 */
import type { JaMcq, QuizQuestion } from '@/shared/contentApi';

/** One question as the summary and review show it */
export interface ReviewEntry {
  prompt: string;
  /** Text of the learner's choice; null if unanswered */
  yourAnswer: string | null;
  correctAnswer: string;
  explanation: string;
  correct: boolean;
}

/** A round the learner checked */
export interface FinishedRound {
  title: string;
  entries: ReviewEntry[];
  durationSec: number;
}

export interface SessionSummary {
  rounds: number;
  correct: number;
  total: number;
  /** 0-100, rounded */
  percent: number;
  durationSec: number;
  perRound: { title: string; correct: number; total: number; percent: number }[];
  /** Wrong or unanswered questions, with the round they came from */
  mistakes: (ReviewEntry & { round: number; roundTitle: string })[];
}

/** Value of the correct answer, comparable with the stored choice */
export function correctValue(question: QuizQuestion): string {
  return question.type === 'mcq' ? String(question.answerIndex) : question.answer;
}

/**
 * Builds review entries for a checked round of English questions
 * @param label Text for an option value (an option's wording, or "True" / "False" / "Not given")
 */
export function quizEntries(
  questions: QuizQuestion[],
  answers: (string | null)[],
  label: (question: QuizQuestion, value: string) => string
): ReviewEntry[] {
  return questions.map((question, index) => {
    const answer = answers[index] ?? null;
    return {
      prompt: question.prompt,
      yourAnswer: answer === null ? null : label(question, answer),
      correctAnswer: label(question, correctValue(question)),
      explanation: question.explanation,
      correct: answer === correctValue(question),
    };
  });
}

/**
 * Builds review entries for a checked round of Japanese multiple-choice questions
 * Text keeps the 漢字{かんじ} reading markup so the summary can show furigana
 */
export function jaEntries(questions: JaMcq[], answers: (string | null)[], locale: 'en' | 'vi'): ReviewEntry[] {
  return questions.map((question, index) => {
    const answer = answers[index] ?? null;
    return {
      prompt: question.prompt,
      yourAnswer: answer === null ? null : (question.options[Number(answer)] ?? null),
      correctAnswer: question.options[question.answerIndex],
      explanation: question.explanation[locale],
      correct: answer === String(question.answerIndex),
    };
  });
}

const percentOf = (correct: number, total: number): number => (total === 0 ? 0 : Math.round((correct / total) * 100));

/**
 * Totals, per-round scores and the mistake list for the summary page
 */
export function summarizeSession(rounds: FinishedRound[]): SessionSummary {
  const perRound = rounds.map((round) => {
    const correct = round.entries.filter((entry) => entry.correct).length;
    return { title: round.title, correct, total: round.entries.length, percent: percentOf(correct, round.entries.length) };
  });
  const correct = perRound.reduce((sum, round) => sum + round.correct, 0);
  const total = perRound.reduce((sum, round) => sum + round.total, 0);

  return {
    rounds: rounds.length,
    correct,
    total,
    percent: percentOf(correct, total),
    durationSec: rounds.reduce((sum, round) => sum + round.durationSec, 0),
    perRound,
    mistakes: rounds.flatMap((round, index) =>
      round.entries.filter((entry) => !entry.correct).map((entry) => ({ ...entry, round: index + 1, roundTitle: round.title }))
    ),
  };
}

/** "4 min 05 s" style length, in the shape the UI strings take */
export function splitDuration(seconds: number): { minutes: number; seconds: number } {
  const whole = Math.max(0, Math.round(seconds));
  return { minutes: Math.floor(whole / 60), seconds: whole % 60 };
}
