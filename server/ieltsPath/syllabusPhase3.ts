/**
 * Phase 3 of the syllabus (weeks 9-12, "techniques for each question type"): Section 3 and 4 notes, Yes / No / Not
 * Given, matching information, summary completion, pie charts, processes and maps, the discussion, problem-solution and
 * two-part essays, a stronger Part 2 and Part 3. Weeks 11 and 12 are full tests against the clock; Gate 3 closes the
 * phase and decides the exam date.
 */
import type { DayPlan, DayStep, LessonMeta } from './syllabus.js';

const L = (lesson: string): DayStep => ({ lesson });
const P = (practice: Extract<DayStep, { practice: unknown }>['practice'], minutes?: number): DayStep => ({ practice, minutes });

export const PHASE3_LESSONS: LessonMeta[] = [
  { id: 'ip-l-notes', block: 'listening', minutes: 35, title: { en: 'Lecture notes: predict the word you need', vi: 'Ghi chú bài giảng: đoán từ cần điền' } },
  { id: 'ip-l-places', block: 'listening', minutes: 35, title: { en: 'Describing places: plans and maps in words', vi: 'Mô tả vị trí: sơ đồ và bản đồ bằng lời' } },
  { id: 'ip-l-trap-types', block: 'listening', minutes: 35, title: { en: 'Sorting wrong answers by kind of trap', vi: 'Phân loại câu sai theo loại bẫy' } },
  { id: 'ip-l-dictate-hard', block: 'listening', minutes: 30, title: { en: 'Dictating the hard parts', vi: 'Nghe chép những đoạn khó' } },
  { id: 'ip-r-ynng', block: 'reading', minutes: 40, title: { en: 'Yes / No / Not Given and matching information', vi: 'Yes / No / Not Given và nối thông tin' } },
  { id: 'ip-r-summary', block: 'reading', minutes: 40, title: { en: 'Summary and table completion', vi: 'Hoàn thành tóm tắt và bảng' } },
  { id: 'ip-r-analyse', block: 'reading', minutes: 40, title: { en: 'Analysing a set of three passages', vi: 'Phân tích một bộ ba bài đọc' } },
  { id: 'ip-r-context', block: 'reading', minutes: 35, title: { en: 'Guessing words from context', vi: 'Đoán nghĩa từ theo ngữ cảnh' } },
  { id: 'ip-w-pie-multi', block: 'writing', minutes: 40, title: { en: 'Pie charts and two charts together', vi: 'Biểu đồ tròn và hai biểu đồ cùng lúc' } },
  { id: 'ip-w-discuss', block: 'writing', minutes: 45, title: { en: 'Discuss both views and give your opinion', vi: 'Thảo luận hai quan điểm và nêu ý kiến' } },
  { id: 'ip-w-process', block: 'writing', minutes: 40, title: { en: 'Describing a process', vi: 'Mô tả một quy trình' } },
  { id: 'ip-w-problem-solution', block: 'writing', minutes: 45, title: { en: 'Problems and solutions', vi: 'Vấn đề và giải pháp' } },
  { id: 'ip-w-two-part', block: 'writing', minutes: 45, title: { en: 'Two-part questions', vi: 'Câu hỏi hai phần' } },
  { id: 'ip-w-maps', block: 'writing', minutes: 40, title: { en: 'Describing a map before and after', vi: 'Mô tả bản đồ trước và sau' } },
  { id: 'ip-w-common-errors', block: 'writing', minutes: 40, title: { en: 'Fixing the errors you repeat', vi: 'Sửa những lỗi bạn hay lặp lại' } },
  { id: 'ip-s-part2-opening', block: 'speaking', minutes: 40, title: { en: 'Part 2: a strong opening, and the cue card as your plan', vi: 'Part 2: mở đầu ấn tượng, và cue card làm dàn ý' } },
  { id: 'ip-s-part3-compare', block: 'speaking', minutes: 40, title: { en: 'Part 3: comparing, advantages and concession', vi: 'Part 3: so sánh, ưu nhược điểm và nhượng bộ' } },
  { id: 'ip-s-timed', block: 'speaking', minutes: 35, title: { en: 'Parts 1 to 3 on time, and a self-check', vi: 'Part 1 đến 3 đúng giờ, và tự kiểm tra' } },
  { id: 'ip-s-listener', block: 'speaking', minutes: 35, title: { en: 'A mock with a real listener', vi: 'Thi thử với một người nghe thật' } },
];

export const PHASE3_WEEKS: Record<number, DayPlan> = {
  // Week 9: complex sentences (relative, noun clauses, concession); academic words, group 1; Sections 3-4 notes; Yes/No/Not Given, matching information; pie charts, discussion essay; Part 2 opening
  9: {
    grammar: ['defining-relative', 'non-defining-relative', 'relative-pronouns', 'contrast-linkers', 'time-clauses', 'cause-result'],
    words: [
      { topic: 'academic', level: 'B1' }, { topic: 'academic', level: 'B1' }, { topic: 'academic', level: 'B1' },
      { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' }, { topic: 'academic', level: 'B2' },
    ],
    listening: [L('ip-l-notes'), P('l-sec4'), P('l-sec3'), P('l-sec4'), P('l-sec3'), P('l-sec4')],
    reading: [L('ip-r-ynng'), P('r-ynng'), P('r-matchinfo'), P('r-ynng'), P('r-matchinfo'), P('r-ynng')],
    writing: [L('ip-w-pie-multi'), P('w-pie', 50), L('ip-w-discuss'), P('w-discuss', 55), null, P('w-discuss', 55)],
    speaking: [L('ip-s-part2-opening'), P('s-part2'), P('s-part1'), P('s-part2'), P('s-part1'), P('s-part2')],
    review: { listening: [P('l-sec4')], reading: [P('r-ynng')], speaking: [P('s-part2')] },
  },
  // Week 10: collocations; maps in words and note completion; summary and table completion; processes, problem-solution; Part 3 comparisons and concession
  10: {
    grammar: ['passive-tenses', 'passive-modals', 'participle-clauses', 'reduced-relative', 'adjective-preposition-ing', 'dependent-prepositions'],
    words: [
      { topic: 'collocations', level: 'B1' }, { topic: 'collocations', level: 'B1' }, { topic: 'collocations', level: 'B2' },
      { topic: 'collocations', level: 'B2' }, { topic: 'collocations', level: 'B2' }, { topic: 'collocations', level: 'B2' },
    ],
    listening: [L('ip-l-places'), P('l-mono'), P('l-sec4'), P('l-mono'), P('l-sec4'), P('l-mono')],
    reading: [L('ip-r-summary'), P('r-summary'), P('r-summary'), P('r-scan'), P('r-summary'), P('r-summary')],
    writing: [L('ip-w-process'), P('w-process', 50), L('ip-w-problem-solution'), P('w-problem', 55), null, P('w-problem', 55)],
    speaking: [L('ip-s-part3-compare'), P('s-full'), P('s-part1'), P('s-full'), P('s-part2'), P('s-full')],
    review: { listening: [P('l-sec4')], reading: [P('r-summary')], speaking: [P('s-full')] },
  },
  // Week 11: paraphrase; a full 40-question test every week and the kinds of trap; a set of three passages on time; two-part essays, maps; Parts 1-3 on time with a self-check
  11: {
    grammar: ['third-conditional', 'mixed-conditionals', 'unless-in-case', 'wishes', 'passive-reporting', 'reporting-verbs'],
    words: [
      { topic: 'paraphrase', level: 'B2' }, { topic: 'paraphrase', level: 'B2' }, { topic: 'paraphrase', level: 'B2' },
      { topic: 'paraphrase', level: 'B2' }, { topic: 'paraphrase', level: 'B2' }, { topic: 'paraphrase', level: 'B2' },
    ],
    listening: [L('ip-l-trap-types'), P('l-test40'), P('l-test40'), P('l-sec3'), P('l-test40'), P('l-test40')],
    reading: [L('ip-r-analyse'), P('r-three'), P('r-three'), P('r-two'), P('r-three'), P('r-three')],
    writing: [L('ip-w-two-part'), P('w-twopart', 55), L('ip-w-maps'), P('w-map', 50), null, P('w-twopart', 55)],
    speaking: [L('ip-s-timed'), P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-full', 50)],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 65)], speaking: [P('s-full', 50)] },
  },
  // Week 12: review of 400 words and of the mistakes list (articles, tenses, agreement); listen again and dictate the hard parts; sets of three passages; Task 1 and Task 2 on time; a mock with a listener. Gate 3 at the end, and the decision about the exam date.
  12: {
    grammar: ['article-the', 'zero-article', 'present-perfect', 'past-simple', 'subject-verb-agreement', 'countable-uncountable'],
    words: [
      { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' },
      { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' }, { topic: 'review', level: 'B2' },
    ],
    listening: [L('ip-l-dictate-hard'), P('l-test40'), P('l-test40'), P('l-sec4'), P('l-test40'), P('l-test40')],
    reading: [L('ip-r-context'), P('r-three'), P('r-three'), P('r-two'), P('r-three'), P('r-three')],
    writing: [L('ip-w-common-errors'), P('w-pie', 50), null, P('w-discuss', 55), null, P('w-problem', 55)],
    speaking: [L('ip-s-listener'), P('s-full', 50), P('s-part1'), P('s-full', 50), P('s-part2'), P('s-full', 50)],
    review: { listening: [P('l-test40', 55)], reading: [P('r-three', 65)], speaking: [P('s-full', 50)] },
  },
};
