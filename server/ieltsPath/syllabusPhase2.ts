/**
 * Phase 2 of the syllabus (weeks 5-8, "get to know the exam"): Section 1-3 listening, True / False / Not Given,
 * matching headings, line graphs, the four-paragraph opinion essay, Part 2 for a minute and a half and a first look at
 * Part 3. Weeks 7 and 8 move to full-length work against the clock, ending in Gate 2.
 */
import type { DayPlan, DayStep, LessonMeta } from './syllabus.js';

const L = (lesson: string): DayStep => ({ lesson });
const P = (practice: Extract<DayStep, { practice: unknown }>['practice'], minutes?: number): DayStep => ({ practice, minutes });

export const PHASE2_LESSONS: LessonMeta[] = [
  { id: 'ip-l-transcript', block: 'listening', minutes: 30, title: { en: 'Listen again with the transcript', vi: 'Nghe lại cùng bản ghi chép' } },
  { id: 'ip-l-sec3-opinions', block: 'listening', minutes: 35, title: { en: 'Section 3: opinions and distractors', vi: 'Section 3: ý kiến và đáp án gây nhiễu' } },
  { id: 'ip-l-thirty', block: 'listening', minutes: 35, title: { en: 'Thirty questions in 25 minutes', vi: 'Ba mươi câu trong 25 phút' } },
  { id: 'ip-l-full-test', block: 'listening', minutes: 35, title: { en: 'A full test: all four sections', vi: 'Một bài đầy đủ: cả bốn section' } },
  { id: 'ip-r-false-ng', block: 'reading', minutes: 40, title: { en: 'False or Not Given: a closer look', vi: 'False hay Not Given: nhìn kỹ hơn' } },
  { id: 'ip-r-headings-sentences', block: 'reading', minutes: 40, title: { en: 'Matching headings and sentence completion', vi: 'Nối tiêu đề và hoàn thành câu' } },
  { id: 'ip-r-two-passages', block: 'reading', minutes: 40, title: { en: 'Two passages in 40 minutes', vi: 'Hai bài đọc trong 40 phút' } },
  { id: 'ip-r-three-passages', block: 'reading', minutes: 40, title: { en: 'A set of three passages in 60 minutes', vi: 'Bộ ba bài đọc trong 60 phút' } },
  { id: 'ip-w-trends', block: 'writing', minutes: 40, title: { en: 'Line graphs: words for trends', vi: 'Biểu đồ đường: từ chỉ xu hướng' } },
  { id: 'ip-w-task1-check', block: 'writing', minutes: 35, title: { en: 'Task 1 checklist: read the chart, write, check', vi: 'Checklist Task 1: đọc biểu đồ, viết, kiểm tra' } },
  { id: 'ip-w-opinion-essay', block: 'writing', minutes: 45, title: { en: 'The opinion essay in four paragraphs', vi: 'Bài luận nêu quan điểm bốn đoạn' } },
  { id: 'ip-w-linkers', block: 'writing', minutes: 35, title: { en: 'Linking ideas: however, although, because of', vi: 'Nối ý: however, although, because of' } },
  { id: 'ip-w-adv-disadv', block: 'writing', minutes: 45, title: { en: 'The advantages and disadvantages essay', vi: 'Bài luận ưu điểm và nhược điểm' } },
  { id: 'ip-w-on-time', block: 'writing', minutes: 40, title: { en: 'Task 1 in 20 minutes, Task 2 in 40', vi: 'Task 1 trong 20 phút, Task 2 trong 40' } },
  { id: 'ip-s-topics', block: 'speaking', minutes: 35, title: { en: 'Ten common Part 1 topics, without memorising', vi: 'Mười chủ đề Part 1 hay gặp, không học thuộc' } },
  { id: 'ip-s-part2-longer', block: 'speaking', minutes: 40, title: { en: 'Part 2: talk for a minute and a half', vi: 'Part 2: nói một phút rưỡi' } },
  { id: 'ip-s-part3-four', block: 'speaking', minutes: 40, title: { en: 'Part 3: understand, answer, example, explain', vi: 'Part 3: hiểu, trả lời, ví dụ, giải thích' } },
  { id: 'ip-s-full-mock', block: 'speaking', minutes: 35, title: { en: 'Parts 1 to 3 in eleven minutes', vi: 'Part 1 đến 3 trong mười một phút' } },
];

export const PHASE2_WEEKS: Record<number, DayPlan> = {
  // Week 5: tenses and modals; education, work; Sections 1 and 2 listened to again with the transcript; False vs Not Given; line graphs; Part 1 topics
  5: {
    grammar: ['past-simple', 'present-perfect', 'can-could', 'should-ought-to', 'must-have-to', 'may-might'],
    words: [
      { topic: 'education', level: 'A2' }, { topic: 'education', level: 'B1' }, { topic: 'education', level: 'B1' },
      { topic: 'work', level: 'B1' }, { topic: 'work', level: 'B1' }, { topic: 'work', level: 'B1' },
    ],
    listening: [L('ip-l-transcript'), P('l-form'), P('l-mono'), P('l-form'), P('l-mono'), P('l-form')],
    reading: [L('ip-r-false-ng'), P('r-tfng'), P('r-tfng'), P('r-tfng'), P('r-tfng'), P('r-tfng')],
    writing: [L('ip-w-trends'), L('ip-w-task1-check'), P('w-line', 45), null, P('w-line', 45), P('w-line', 45)],
    speaking: [L('ip-s-topics'), P('s-part1'), P('s-part1'), P('s-part1'), P('s-part1'), P('s-part1')],
    review: { listening: [P('l-mono')], reading: [P('r-tfng')], speaking: [P('s-part1')] },
  },
  // Week 6: second conditional, passive, linkers; health, environment; Section 3; headings and sentence completion; opinion essay; Part 2 for 90 seconds
  6: {
    grammar: ['second-conditional', 'passive-basics', 'contrast-linkers', 'cause-result', 'purpose', 'time-clauses'],
    words: [
      { topic: 'health', level: 'B1' }, { topic: 'health', level: 'B1' }, { topic: 'health', level: 'B1' },
      { topic: 'environment', level: 'B1' }, { topic: 'environment', level: 'B1' }, { topic: 'environment', level: 'B1' },
    ],
    listening: [L('ip-l-sec3-opinions'), P('l-sec3'), P('l-sec3'), P('l-sec3'), P('l-sec3'), P('l-sec3')],
    reading: [L('ip-r-headings-sentences'), P('r-scan'), P('r-short'), P('r-scan'), P('r-short'), P('r-scan')],
    writing: [L('ip-w-opinion-essay'), P('w-opinion', 50), L('ip-w-linkers'), P('w-opinion', 50), null, P('w-opinion', 50)],
    speaking: [L('ip-s-part2-longer'), P('s-part2'), P('s-part1'), P('s-part2'), P('s-part1'), P('s-part2')],
    review: { listening: [P('l-sec3')], reading: [P('r-scan')], speaking: [P('s-part2')] },
  },
  // Week 7: reported speech, comparison; technology, cities; thirty questions in 25 minutes; two passages in 40; advantages and disadvantages; Part 3
  7: {
    grammar: ['reported-statements', 'reported-questions', 'comparatives', 'superlatives', 'as-as', 'too-enough'],
    words: [
      { topic: 'technology', level: 'B1' }, { topic: 'technology', level: 'B1' }, { topic: 'technology', level: 'B1' },
      { topic: 'city', level: 'B1' }, { topic: 'city', level: 'B1' }, { topic: 'city', level: 'B1' },
    ],
    listening: [L('ip-l-thirty'), P('l-test30'), P('l-test30'), P('l-sec3'), P('l-test30'), P('l-test30')],
    reading: [L('ip-r-two-passages'), P('r-two'), P('r-two'), P('r-two'), P('r-two'), P('r-two')],
    writing: [L('ip-w-adv-disadv'), P('w-advdis', 50), null, P('w-advdis', 50), null, P('w-advdis', 50)],
    speaking: [L('ip-s-part3-four'), P('s-full'), P('s-part1'), P('s-full'), P('s-part2'), P('s-full')],
    review: { listening: [P('l-test30')], reading: [P('r-two')], speaking: [P('s-full')] },
  },
  // Week 8: review of the words and the mistakes list; the first full 40-question test (a low score is expected); a set of three passages in 60 minutes; Task 1 and Task 2 on time; mock Parts 1-3. Gate 2 at the end.
  8: {
    grammar: ['article-the', 'subject-verb-agreement', 'present-perfect', 'past-continuous', 'countable-uncountable', 'question-forms'],
    words: [
      { topic: 'review', level: 'B1' }, { topic: 'review', level: 'B1' }, { topic: 'review', level: 'B1' },
      { topic: 'review', level: 'B1' }, { topic: 'review', level: 'B1' }, { topic: 'review', level: 'B1' },
    ],
    listening: [L('ip-l-full-test'), P('l-test40'), P('l-test40'), P('l-sec3'), P('l-test40'), P('l-test40')],
    reading: [L('ip-r-three-passages'), P('r-three'), P('r-three'), P('r-two'), P('r-three'), P('r-three')],
    writing: [L('ip-w-on-time'), P('w-line', 50), null, P('w-opinion', 55), null, P('w-advdis', 55)],
    speaking: [L('ip-s-full-mock'), P('s-full'), P('s-part1'), P('s-full'), P('s-part2'), P('s-full')],
    review: { listening: [P('l-test40')], reading: [P('r-three')], speaking: [P('s-full')] },
  },
};
