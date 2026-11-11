/**
 * Phase 6 of the syllabus (weeks 21-24, "mock tests and mistakes"): a whole real test in one sitting in weeks 21 and 23
 * (Listening, Reading and Writing one after the other, Speaking apart), the weakest skill worked on in week 22 with
 * feedback from two people, and a last week of light practice before Gate 6 (L/R 7.0, W/S 6.5).
 * The mock tests are real Cambridge tests kept apart for this (see practice.ts).
 */
import { MOCK_REAL_TESTS } from './realTests.js';
import type { DayPlan, DayStep, LessonMeta } from './syllabus.js';

const L = (lesson: string): DayStep => ({ lesson });
const P = (practice: Extract<DayStep, { practice: unknown }>['practice'], minutes?: number): DayStep => ({ practice, minutes });
/** A step taken from a given real test */
const M = (practice: Extract<DayStep, { practice: unknown }>['practice'], minutes: number, test: string): DayStep => ({ practice, minutes, test });

const MOCK_TESTS = MOCK_REAL_TESTS;

export const PHASE6_LESSONS: LessonMeta[] = [
  { id: 'ip-l-real-format', block: 'listening', minutes: 35, title: { en: 'Listening in the real format: one play, ten minutes to transfer', vi: 'Nghe đúng định dạng thi thật: nghe một lần, mười phút chép đáp án' } },
  { id: 'ip-r-real-format', block: 'reading', minutes: 35, title: { en: 'Reading in the real format: sixty minutes and no transfer time', vi: 'Đọc đúng định dạng thi thật: sáu mươi phút, không có giờ chép đáp án' } },
  { id: 'ip-w-real-format', block: 'writing', minutes: 40, title: { en: 'Writing in one sitting: sixty minutes, Task 2 first', vi: 'Viết trong một lượt: sáu mươi phút, Task 2 trước' } },
  { id: 'ip-s-real-format', block: 'speaking', minutes: 35, title: { en: 'Speaking as a separate appointment: eleven to fourteen minutes', vi: 'Nói là một buổi hẹn riêng: mười một đến mười bốn phút' } },
  { id: 'ip-l-weakest', block: 'listening', minutes: 40, title: { en: 'Reading your mock result: finding the weakest skill', vi: 'Đọc kết quả thi thử: tìm kỹ năng yếu nhất' } },
  { id: 'ip-w-two-reviewers', block: 'writing', minutes: 40, title: { en: 'Feedback from two people: what to do when they disagree', vi: 'Nhận xét từ hai người: làm gì khi họ không đồng ý' } },
  { id: 'ip-l-compare-mocks', block: 'listening', minutes: 35, title: { en: 'Comparing two mock tests: what moved and why', vi: 'So hai lần thi thử: điều gì đổi và vì sao' } },
  { id: 'ip-l-gate6', block: 'listening', minutes: 30, title: { en: 'Gate 6: the plan for the last week of the phase', vi: 'Gate 6: kế hoạch cho tuần cuối của giai đoạn' } },
  { id: 'ip-w-gate6', block: 'writing', minutes: 35, title: { en: 'Gate 6 Writing and Speaking: what 6.5 asks for', vi: 'Gate 6 Viết và Nói: 6.5 đòi hỏi gì' } },
];

export const PHASE6_WEEKS: Record<number, DayPlan> = {
  // Week 21: the real test format; a first whole mock on day 2; the weakest skill found on day 3
  21: {
    grammar: ['article-the', 'subject-verb-agreement', 'present-perfect', 'past-simple', 'passive-tenses', 'mixed-conditionals'],
    words: Array.from({ length: 6 }, () => ({ topic: 'review', level: 'B2' })),
    listening: [L('ip-l-real-format'), M('l-test40', 55, MOCK_TESTS[21]), P('l-sec4'), P('l-test40', 55), P('l-sec3'), P('l-sec4')],
    reading: [L('ip-r-real-format'), M('r-three', 65, MOCK_TESTS[21]), P('r-summary'), P('r-three', 65), P('r-two'), P('r-passage')],
    writing: [L('ip-w-real-format'), M('w-full', 60, MOCK_TESTS[21]), P('w-opinion', 55), null, P('w-discuss', 55), null],
    speaking: [L('ip-s-real-format'), M('s-full', 50, MOCK_TESTS[21]), P('s-part2'), P('s-full', 50), P('s-part1'), P('s-part2')],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 65)], speaking: [P('s-full', 50)] },
  },
  // Week 22: half of the time on the weakest skill; feedback on Writing and Speaking from two different people
  22: {
    grammar: ['mixed-conditionals', 'wishes', 'modal-perfect', 'article-the', 'reduced-relative', 'cleft-sentences'],
    words: Array.from({ length: 6 }, () => ({ topic: 'review', level: 'B2' })),
    listening: [L('ip-l-weakest'), P('l-test40', 55), P('l-sec4'), P('l-test40', 55), P('l-sec3'), P('l-sec4')],
    reading: [P('r-three', 65), P('r-summary'), P('r-three', 65), P('r-ynng'), P('r-passage'), P('r-matchinfo')],
    writing: [L('ip-w-two-reviewers'), P('w-opinion', 55), null, P('w-discuss', 55), P('w-line', 45), P('w-problem', 55)],
    speaking: [P('s-full', 50), P('s-part2'), P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2')],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 65)], speaking: [P('s-full', 50)] },
  },
  // Week 23: the second whole mock on day 2, compared with the first
  23: {
    grammar: ['article-the', 'zero-article', 'subject-verb-agreement', 'past-perfect', 'future-perfect', 'inversion'],
    words: Array.from({ length: 6 }, () => ({ topic: 'review', level: 'B2' })),
    listening: [L('ip-l-compare-mocks'), M('l-test40', 55, MOCK_TESTS[23]), P('l-sec4'), P('l-test40', 55), P('l-sec3'), P('l-sec4')],
    reading: [P('r-passage'), M('r-three', 65, MOCK_TESTS[23]), P('r-summary'), P('r-three', 65), P('r-two'), P('r-ynng')],
    writing: [P('w-opinion', 55), M('w-full', 60, MOCK_TESTS[23]), P('w-problem', 55), null, P('w-pie', 45), null],
    speaking: [P('s-part2'), M('s-full', 50, MOCK_TESTS[23]), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-part1')],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 65)], speaking: [P('s-full', 50)] },
  },
  // Week 24: lighter practice, the mistakes of the whole phase; Gate 6 at the end
  24: {
    grammar: ['present-perfect-continuous', 'past-perfect', 'subject-verb-agreement', 'article-the', 'zero-article', 'passive-tenses'],
    words: Array.from({ length: 6 }, () => ({ topic: 'review', level: 'B2' })),
    listening: [L('ip-l-gate6'), P('l-test40', 55), P('l-sec4'), P('l-sec3'), P('l-test40', 55), P('l-sec4')],
    reading: [P('r-three', 65), P('r-passage'), P('r-three', 65), P('r-two'), P('r-three', 65), P('r-passage')],
    writing: [L('ip-w-gate6'), P('w-opinion', 55), null, P('w-line', 45), null, P('w-discuss', 55)],
    speaking: [P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-full', 50), P('s-part1')],
    review: { listening: [P('l-sec4')], reading: [P('r-passage')], speaking: [P('s-part2')] },
  },
};
