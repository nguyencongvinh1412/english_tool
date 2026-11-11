/**
 * Phase 4 of the syllabus (weeks 13-16, "academic vocabulary"): two full listening tests a week with every wrong
 * answer analysed, Section 4 at natural speed, sets of three passages against the clock aiming at 28-30 correct, hard
 * multiple choice, Task 2 written by the four criteria, the overview, introductions and conclusions, rewriting from
 * feedback, Part 3 concession and buying time, Part 2 transitions, mocks with a listener. Gate 4 (L/R 6.0, W/S 5.5)
 * closes the phase and decides the target.
 */
import type { DayPlan, DayStep, LessonMeta } from './syllabus.js';

const L = (lesson: string): DayStep => ({ lesson });
const P = (practice: Extract<DayStep, { practice: unknown }>['practice'], minutes?: number): DayStep => ({ practice, minutes });

export const PHASE4_LESSONS: LessonMeta[] = [
  { id: 'ip-l-full-analyse', block: 'listening', minutes: 35, title: { en: 'Two full tests a week: analyse every wrong answer', vi: 'Hai bài nghe đầy đủ mỗi tuần: phân tích từng câu sai' } },
  { id: 'ip-l-lecture-speed', block: 'listening', minutes: 35, title: { en: 'Section 4 at natural speed: signposts and lists', vi: 'Section 4 tốc độ thật: từ dẫn đường và liệt kê' } },
  { id: 'ip-l-dictate-lecture', block: 'listening', minutes: 30, title: { en: 'A full test, then dictate one section', vi: 'Một đề đầy đủ, rồi nghe chép một section' } },
  { id: 'ip-l-error-types-review', block: 'listening', minutes: 35, title: { en: 'Listen again, sorted by kind of mistake', vi: 'Nghe lại bài cũ, chia theo loại lỗi' } },
  { id: 'ip-r-sets-timing', block: 'reading', minutes: 40, title: { en: 'Three passages: 18, 20 and 22 minutes', vi: 'Ba bài đọc: 18, 20 và 22 phút' } },
  { id: 'ip-r-mcq-hard', block: 'reading', minutes: 40, title: { en: 'Hard multiple choice and summaries with a word list', vi: 'Trắc nghiệm khó và tóm tắt có danh sách từ' } },
  { id: 'ip-r-target-28', block: 'reading', minutes: 35, title: { en: 'Aiming at 28 to 30 correct', vi: 'Nhắm tới 28 đến 30 câu đúng' } },
  { id: 'ip-r-weak-types', block: 'reading', minutes: 35, title: { en: 'Your weakest question types, reviewed', vi: 'Ôn lại các dạng bạn hay sai nhất' } },
  { id: 'ip-w-criteria', block: 'writing', minutes: 45, title: { en: 'Task 2 by the four criteria: what band 6 means', vi: 'Task 2 theo bốn tiêu chí: band 6 nghĩa là gì' } },
  { id: 'ip-w-overview', block: 'writing', minutes: 40, title: { en: 'The overview that earns the band', vi: 'Câu tổng quan quyết định điểm' } },
  { id: 'ip-w-intro-conclusion', block: 'writing', minutes: 40, title: { en: 'Introductions and conclusions in Task 2', vi: 'Mở bài và kết bài trong Task 2' } },
  { id: 'ip-w-feedback', block: 'writing', minutes: 40, title: { en: 'Rewriting an essay from its feedback', vi: 'Viết lại bài luận theo nhận xét' } },
  { id: 'ip-w-timed-pair', block: 'writing', minutes: 35, title: { en: 'Task 1 and Task 2 in 60 minutes, with your checklist', vi: 'Task 1 và Task 2 trong 60 phút, kèm danh sách kiểm tra' } },
  { id: 'ip-s-part3-concession', block: 'speaking', minutes: 40, title: { en: 'Part 3: conceding a point and buying time, sparingly', vi: 'Part 3: nhượng bộ và "câu giờ" tự nhiên, dùng ít' } },
  { id: 'ip-s-part2-transitions', block: 'speaking', minutes: 40, title: { en: 'Part 2: moving between points, feelings and detail', vi: 'Part 2: chuyển ý, diễn tả cảm xúc và chi tiết' } },
  { id: 'ip-s-repetition', block: 'speaking', minutes: 35, title: { en: 'A mock with a listener: the words you repeat', vi: 'Thi thử với người nghe: những từ bạn lặp lại' } },
  { id: 'ip-s-self-score', block: 'speaking', minutes: 35, title: { en: 'Mock and self-score by the four criteria', vi: 'Thi thử và tự chấm theo bốn tiêu chí' } },
];

export const PHASE4_WEEKS: Record<number, DayPlan> = {
  // Week 13: nominalisation and advanced passives; academic words, group 2; two full tests, every wrong answer analysed; two sets of three passages on time; Task 2 by the four criteria; Part 3 concession and buying time
  13: {
    grammar: ['passive-tenses', 'passive-reporting', 'causative', 'passive-modals', 'participle-clauses', 'gerund-infinitive'],
    words: [
      { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' },
      { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' },
    ],
    listening: [L('ip-l-full-analyse'), P('l-test40'), P('l-sec4'), P('l-test40'), P('l-sec4'), P('l-sec3')],
    reading: [L('ip-r-sets-timing'), P('r-three'), P('r-summary'), P('r-three'), P('r-passage'), P('r-ynng')],
    writing: [L('ip-w-criteria'), P('w-opinion', 55), null, P('w-discuss', 55), null, P('w-advdis', 55)],
    speaking: [L('ip-s-part3-concession'), P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-full', 50)],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 65)], speaking: [P('s-full', 50)] },
  },
  // Week 14: cohesion, reference and substitution; linking words; Section 4 at natural speed; summary completion and hard multiple choice; the overview, introductions and conclusions; Part 2 transitions
  14: {
    grammar: ['coordinating', 'so-such', 'cleft-sentences', 'reduced-relative', 'non-defining-relative', 'purpose'],
    words: [
      { topic: 'linking', level: 'B2' }, { topic: 'linking', level: 'B2' }, { topic: 'linking', level: 'B2' },
      { topic: 'linking', level: 'B2' }, { topic: 'linking', level: 'B2' }, { topic: 'linking', level: 'B2' },
    ],
    listening: [L('ip-l-lecture-speed'), P('l-sec4'), P('l-sec4'), P('l-test40'), P('l-sec4'), P('l-sec4')],
    reading: [L('ip-r-mcq-hard'), P('r-passage'), P('r-summary'), P('r-three'), P('r-summary'), P('r-passage')],
    writing: [L('ip-w-overview'), P('w-line', 50), L('ip-w-intro-conclusion'), P('w-problem', 55), null, P('w-pie', 50)],
    speaking: [L('ip-s-part2-transitions'), P('s-part2'), P('s-part1'), P('s-part2'), P('s-full', 50), P('s-part2')],
    review: { listening: [P('l-test40', 55)], reading: [P('r-summary')], speaking: [P('s-part2')] },
  },
  // Week 15: idioms and phrasal verbs, used only when understood; a full test plus dictation; sets of three aiming at 28-30; two Task 2 and one Task 1 graded, rewritten from feedback; a mock with a listener, noting repeated words
  15: {
    grammar: ['phrasal-verbs', 'verb-meaning-change', 'dependent-prepositions', 'adjectives-ed-ing', 'stative-verbs', 'make-let'],
    words: [
      { topic: 'idioms', level: 'B2' }, { topic: 'idioms', level: 'B2' }, { topic: 'idioms', level: 'B2' },
      { topic: 'idioms', level: 'B2' }, { topic: 'idioms', level: 'B2' }, { topic: 'idioms', level: 'B2' },
    ],
    listening: [L('ip-l-dictate-lecture'), P('l-test40'), P('l-sec3'), P('l-test40'), P('l-sec4'), P('l-sec3')],
    reading: [L('ip-r-target-28'), P('r-three'), P('r-two'), P('r-three'), P('r-two'), P('r-passage')],
    writing: [L('ip-w-feedback'), P('w-twopart', 55), null, P('w-pie', 50), null, P('w-discuss', 55)],
    speaking: [L('ip-s-repetition'), P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-full', 50)],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 65)], speaking: [P('s-full', 50)] },
  },
  // Week 16: review of 500 words and the mistakes list; listen again by kind of mistake; the question types you miss most; Task 1 and Task 2 on time; mock and self-score. Gate 4 at the end, and the decision about the target.
  16: {
    grammar: ['article-the', 'zero-article', 'subject-verb-agreement', 'present-perfect-continuous', 'past-perfect', 'mixed-conditionals'],
    words: [
      { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' },
      { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' },
    ],
    listening: [L('ip-l-error-types-review'), P('l-test40'), P('l-sec4'), P('l-test40'), P('l-sec3'), P('l-test40')],
    reading: [L('ip-r-weak-types'), P('r-three'), P('r-summary'), P('r-three'), P('r-matchinfo'), P('r-three')],
    writing: [L('ip-w-timed-pair'), P('w-process', 50), null, P('w-opinion', 55), null, P('w-map', 50)],
    speaking: [L('ip-s-self-score'), P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-full', 50)],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 65)], speaking: [P('s-full', 50)] },
  },
};
