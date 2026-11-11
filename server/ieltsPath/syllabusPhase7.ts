/**
 * The final sprint (weeks 25-26), after the last gate the learner's target needs: the mistakes of that gate are
 * reviewed, nothing new is learnt, and the week of the exam is light. It ends the path.
 */
import type { DayPlan, DayStep, LessonMeta } from './syllabus.js';

const L = (lesson: string): DayStep => ({ lesson });
const P = (practice: Extract<DayStep, { practice: unknown }>['practice'], minutes?: number): DayStep => ({ practice, minutes });

export const PHASE7_LESSONS: LessonMeta[] = [
  { id: 'ip-l-final-errors', block: 'listening', minutes: 35, title: { en: 'The last mistakes review: your own list, no new material', vi: 'Ôn lỗi lần cuối: danh sách của chính bạn, không học gì mới' } },
  { id: 'ip-w-final-checklist', block: 'writing', minutes: 35, title: { en: 'Your final Writing checklist, on one page', vi: 'Danh sách kiểm tra Viết cuối cùng của bạn, trên một trang' } },
  { id: 'ip-s-final-voice', block: 'speaking', minutes: 30, title: { en: 'Speaking before the exam: your cards, your voice, no new words', vi: 'Nói trước kỳ thi: thẻ của bạn, giọng của bạn, không từ mới' } },
  { id: 'ip-l-exam-week', block: 'listening', minutes: 30, title: { en: 'The week of the exam: what to do and what to leave alone', vi: 'Tuần thi thật: nên làm gì và nên để yên gì' } },
  { id: 'ip-s-exam-day', block: 'speaking', minutes: 30, title: { en: 'Exam day: the morning, the room, the first minute', vi: 'Ngày thi: buổi sáng, phòng thi, phút đầu tiên' } },
];

export const PHASE7_WEEKS: Record<number, DayPlan> = {
  // Week 25: the mistakes of Gate 6, reviewed; no new knowledge
  25: {
    grammar: ['article-the', 'subject-verb-agreement', 'zero-article', 'present-perfect', 'past-simple', 'passive-tenses'],
    words: Array.from({ length: 6 }, () => ({ topic: 'review', level: 'B2' })),
    listening: [L('ip-l-final-errors'), P('l-sec4'), P('l-sec3'), P('l-test40', 55), P('l-sec4'), P('l-sec3')],
    reading: [P('r-passage'), P('r-three', 60), P('r-summary'), P('r-passage'), P('r-three', 60), P('r-ynng')],
    writing: [L('ip-w-final-checklist'), P('w-opinion', 50), null, P('w-line', 45), null, P('w-discuss', 50)],
    speaking: [L('ip-s-final-voice'), P('s-part2'), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-part1')],
    review: { listening: [P('l-sec4')], reading: [P('r-passage')], speaking: [P('s-part2')] },
  },
  // Week 26: the exam week, light; no new words
  26: {
    grammar: ['article-the', 'subject-verb-agreement', 'zero-article', 'present-perfect', 'past-simple', 'passive-tenses'],
    words: Array.from({ length: 6 }, () => ({ topic: 'review', level: 'B2' })),
    listening: [L('ip-l-exam-week'), P('l-sec4'), P('l-sec3'), null, null, null],
    reading: [P('r-passage'), P('r-two'), null, null, null, null],
    writing: [P('w-line', 45), null, P('w-opinion', 50), null, null, null],
    speaking: [L('ip-s-exam-day'), P('s-part2'), P('s-part1'), P('s-part2'), null, null],
    review: {},
  },
};
