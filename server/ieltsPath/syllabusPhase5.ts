/**
 * Phase 5 of the syllabus (weeks 17-20, "speed and accuracy"): two full listening tests a week at test speed,
 * dictation of Sections 3 and 4, three passages in 55 minutes, wrong answers recorded by type, Task 2 in 40 minutes at
 * 260 words, grammar fixed from the learner's own essays, old essays rewritten with new language, Part 3 answers of
 * four to six sentences, a full two minutes in Part 2, mocks with two different listeners. Gate 5 (L/R 6.5, W/S 6.0)
 * closes the phase.
 */
import type { DayPlan, DayStep, LessonMeta } from './syllabus.js';

const L = (lesson: string): DayStep => ({ lesson });
const P = (practice: Extract<DayStep, { practice: unknown }>['practice'], minutes?: number): DayStep => ({ practice, minutes });

export const PHASE5_LESSONS: LessonMeta[] = [
  { id: 'ip-l-predict', block: 'listening', minutes: 35, title: { en: 'Full tests at test speed: predict before every section', vi: 'Đề đầy đủ tốc độ thi: đoán trước mỗi section' } },
  { id: 'ip-l-dictate-sec34', block: 'listening', minutes: 30, title: { en: 'Dictating Sections 3 and 4', vi: 'Nghe chép Section 3 và 4' } },
  { id: 'ip-l-consistency', block: 'listening', minutes: 30, title: { en: 'Two timed tests: the same score twice', vi: 'Hai đề bấm giờ: cùng một điểm hai lần' } },
  { id: 'ip-l-what-65-needs', block: 'listening', minutes: 30, title: { en: 'Listening again: what 6.5 still needs', vi: 'Nghe lại: 6.5 còn cần gì' } },
  { id: 'ip-r-record-types', block: 'reading', minutes: 35, title: { en: 'Record every wrong answer by question type', vi: 'Ghi từng câu sai theo dạng câu' } },
  { id: 'ip-r-55-minutes', block: 'reading', minutes: 40, title: { en: 'Speeding up: three passages in 55 minutes', vi: 'Tăng tốc: ba bài đọc trong 55 phút' } },
  { id: 'ip-r-three-sets', block: 'reading', minutes: 35, title: { en: 'Three timed sets in a week: pacing and recovery', vi: 'Ba bộ đọc bấm giờ một tuần: nhịp và hồi phục' } },
  { id: 'ip-r-aim-30', block: 'reading', minutes: 30, title: { en: 'The types you still miss, aiming at 30', vi: 'Các dạng còn sai, nhắm 30 câu' } },
  { id: 'ip-w-260', block: 'writing', minutes: 45, title: { en: 'Task 2 in 40 minutes: 260 words and more', vi: 'Task 2 trong 40 phút: từ 260 từ trở lên' } },
  { id: 'ip-w-own-grammar', block: 'writing', minutes: 40, title: { en: 'Fixing grammar from your own essays', vi: 'Sửa ngữ pháp từ bài viết của chính bạn' } },
  { id: 'ip-w-rewrite-new', block: 'writing', minutes: 40, title: { en: 'Rewriting an old essay with new words and structures', vi: 'Viết lại bài cũ bằng từ và cấu trúc mới' } },
  { id: 'ip-w-what-6-has', block: 'writing', minutes: 40, title: { en: 'Four graded tasks: what a 6.0 answer has', vi: 'Bốn bài nộp chấm: bài 6.0 có gì' } },
  { id: 'ip-w-before-gate5', block: 'writing', minutes: 35, title: { en: 'Task 1 and Task 2 on time before Gate 5', vi: 'Task 1 và Task 2 đúng giờ trước Gate 5' } },
  { id: 'ip-s-part3-extend', block: 'speaking', minutes: 40, title: { en: 'Part 3: four to six sentences, with an example and a reason', vi: 'Part 3: bốn đến sáu câu, có ví dụ và lý do' } },
  { id: 'ip-s-two-minutes', block: 'speaking', minutes: 40, title: { en: 'Part 2: the full two minutes without stopping', vi: 'Part 2: trọn hai phút không gác' } },
  { id: 'ip-s-two-listeners', block: 'speaking', minutes: 35, title: { en: 'Two mocks, two listeners: comparing the feedback', vi: 'Hai lần thi thử, hai người nghe: so nhận xét' } },
  { id: 'ip-s-before-gate5', block: 'speaking', minutes: 35, title: { en: 'Mock and self-score before Gate 5', vi: 'Thi thử và tự chấm trước Gate 5' } },
];

export const PHASE5_WEEKS: Record<number, DayPlan> = {
  // Week 17: varied sentence structure (inversion, cleft sentences, reduced clauses); society, economy, science; two full tests at test speed; sets of three with wrong answers recorded by type; Task 2 at 260 words; Part 3 extended answers
  17: {
    grammar: ['inversion', 'cleft-sentences', 'reduced-relative', 'participle-clauses', 'so-such', 'causative'],
    words: [
      { topic: 'society', level: 'B2' }, { topic: 'society', level: 'B2' }, { topic: 'economy', level: 'B2' },
      { topic: 'economy', level: 'B2' }, { topic: 'science', level: 'B2' }, { topic: 'science', level: 'B2' },
    ],
    listening: [L('ip-l-predict'), P('l-test40'), P('l-sec4'), P('l-test40'), P('l-sec3'), P('l-sec4')],
    reading: [L('ip-r-record-types'), P('r-three'), P('r-passage'), P('r-three'), P('r-summary'), P('r-ynng')],
    writing: [L('ip-w-260'), P('w-opinion', 50), null, P('w-discuss', 50), null, P('w-twopart', 50)],
    speaking: [L('ip-s-part3-extend'), P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-full', 50)],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 65)], speaking: [P('s-full', 50)] },
  },
  // Week 18: grammar from the learner's own essays; dictation of Sections 3 and 4; three passages in 55 minutes; an old essay rewritten with new language; the full two minutes in Part 2
  18: {
    grammar: ['subject-verb-agreement', 'article-the', 'present-perfect', 'passive-tenses', 'reported-statements', 'gerund-infinitive'],
    words: [
      { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' },
      { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' },
    ],
    listening: [L('ip-l-dictate-sec34'), P('l-sec3'), P('l-sec4'), P('l-test40'), P('l-sec3'), P('l-sec4')],
    reading: [L('ip-r-55-minutes'), P('r-three', 60), P('r-two'), P('r-three', 60), P('r-two'), P('r-passage')],
    writing: [L('ip-w-own-grammar'), P('w-problem', 50), L('ip-w-rewrite-new'), P('w-advdis', 50), null, P('w-line', 45)],
    speaking: [L('ip-s-two-minutes'), P('s-part2'), P('s-part1'), P('s-part2'), P('s-full', 50), P('s-part2')],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 60)], speaking: [P('s-part2')] },
  },
  // Week 19: academic collocations and adverbs of degree; two timed full tests; three timed sets; two Task 2 and two Task 1 graded; two mocks with different listeners
  19: {
    grammar: ['dependent-prepositions', 'adjective-preposition-ing', 'too-enough', 'as-as', 'comparatives', 'quantifiers'],
    words: [
      { topic: 'collocations', level: 'B2' }, { topic: 'collocations', level: 'B2' }, { topic: 'collocations', level: 'B2' },
      { topic: 'collocations', level: 'B2' }, { topic: 'collocations', level: 'B2' }, { topic: 'collocations', level: 'B2' },
    ],
    listening: [L('ip-l-consistency'), P('l-test40'), P('l-sec4'), P('l-test40'), P('l-sec3'), P('l-sec4')],
    reading: [L('ip-r-three-sets'), P('r-three', 60), P('r-summary'), P('r-three', 60), P('r-matchinfo'), P('r-three', 60)],
    writing: [L('ip-w-what-6-has'), P('w-pie', 45), null, P('w-problem', 50), P('w-process', 45), P('w-twopart', 50)],
    speaking: [L('ip-s-two-listeners'), P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-full', 50)],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 60)], speaking: [P('s-full', 50)] },
  },
  // Week 20: review of 600 words; listen again to old tests; the question types still missed; Task 1 and Task 2 on time; mock and self-score. Gate 5 at the end.
  20: {
    grammar: ['mixed-conditionals', 'wishes', 'modal-perfect', 'deduction', 'future-perfect', 'past-perfect'],
    words: [
      { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' },
      { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' },
    ],
    listening: [L('ip-l-what-65-needs'), P('l-test40'), P('l-sec4'), P('l-test40'), P('l-sec3'), P('l-test40')],
    reading: [L('ip-r-aim-30'), P('r-three', 60), P('r-ynng'), P('r-three', 60), P('r-summary'), P('r-three', 60)],
    writing: [L('ip-w-before-gate5'), P('w-map', 45), null, P('w-opinion', 50), null, P('w-pie', 45)],
    speaking: [L('ip-s-before-gate5'), P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-full', 50)],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 60)], speaking: [P('s-full', 50)] },
  },
};
