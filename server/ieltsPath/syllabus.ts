/**
 * The IELTS syllabus as data. Phase 1 (weeks 1-4, "catch up to B1") is written out day by day from the 6-month
 * syllabus; later phases are added in the same shape. Every study day has five blocks (vocabulary and grammar,
 * listening, reading, writing, speaking); day 7 of a week is review and a short test.
 *
 * A step is one of:
 *   lesson    an authored lesson (learn, examples, drills) from server/content/en/ielts-path
 *   practice  an exercise made for the step (a group built from the bank or generated), run as an IELTS test session
 *   grammar   an existing grammar point
 *   words     new words at a level (the vocabulary screen)
 *   dictation the dictation screen
 *   pronunciation the pronunciation screen (added when speaking practice shows weak pronunciation)
 */

export const BLOCKS = ['vocab-grammar', 'listening', 'reading', 'writing', 'speaking'] as const;
export type Block = (typeof BLOCKS)[number];
export type StepKind = 'lesson' | 'practice' | 'grammar' | 'words' | 'dictation' | 'pronunciation';

/** Kinds of practice exercise (see practice.ts for what each one makes) */
export const PRACTICE_TYPES = [
  'l-conv', 'l-form', 'l-mono', 'l-full', 'l-sec3', 'l-sec4', 'l-test30', 'l-test40',
  'r-short', 'r-tfng', 'r-scan', 'r-passage', 'r-two', 'r-three', 'r-ynng', 'r-matchinfo', 'r-summary',
  'w-para', 'w-task1', 'w-task2', 'w-line', 'w-opinion', 'w-advdis', 'w-pie', 'w-process', 'w-map', 'w-discuss', 'w-problem', 'w-twopart',
  's-part1', 's-part2', 's-mock', 's-full',
] as const;
export type PracticeType = (typeof PRACTICE_TYPES)[number];

export type StepRef =
  | { lessonId: string }
  | { type: PracticeType }
  | { pointId: string }
  | { level: string; count: number; topic: string }
  | Record<string, never>;

export interface Step {
  phase: number;
  week: number;
  /** 1-6 study days, 7 review */
  day: number;
  block: Block;
  kind: StepKind;
  ref: StepRef;
  core: boolean;
  minutes: number;
}

import { PHASE2_LESSONS, PHASE2_WEEKS } from './syllabusPhase2.js';
import { PHASE3_LESSONS, PHASE3_WEEKS } from './syllabusPhase3.js';
import { PHASE4_LESSONS, PHASE4_WEEKS } from './syllabusPhase4.js';
import { PHASE5_LESSONS, PHASE5_WEEKS } from './syllabusPhase5.js';

/** The lessons that exist, with the skill they belong to and where they sit */
export interface LessonMeta {
  id: string;
  block: Exclude<Block, 'vocab-grammar'>;
  title: { en: string; vi: string };
  minutes: number;
}

export const LESSONS: LessonMeta[] = [
  { id: 'ip-l-dictation', block: 'listening', minutes: 30, title: { en: 'Dictation: hearing small words and endings', vi: 'Nghe chép: nghe những từ nhỏ và âm cuối' } },
  { id: 'ip-l-form', block: 'listening', minutes: 35, title: { en: 'Section 1: names, numbers and dates', vi: 'Section 1: tên, số và ngày tháng' } },
  { id: 'ip-l-keywords', block: 'listening', minutes: 35, title: { en: 'Section 2: keywords, matching and directions', vi: 'Section 2: từ khoá, nối thông tin và chỉ đường' } },
  { id: 'ip-l-timed', block: 'listening', minutes: 35, title: { en: 'A full section against the clock', vi: 'Làm trọn một section có giới hạn thời gian' } },
  { id: 'ip-r-skim', block: 'reading', minutes: 35, title: { en: 'Skimming: get the main idea fast', vi: 'Skimming: nắm ý chính thật nhanh' } },
  { id: 'ip-r-tfng', block: 'reading', minutes: 40, title: { en: 'True / False / Not Given', vi: 'True / False / Not Given' } },
  { id: 'ip-r-scan', block: 'reading', minutes: 40, title: { en: 'Scanning and matching headings', vi: 'Scanning và nối tiêu đề' } },
  { id: 'ip-r-timed', block: 'reading', minutes: 40, title: { en: 'One passage in 20 minutes', vi: 'Một bài đọc trong 20 phút' } },
  { id: 'ip-w-paragraph', block: 'writing', minutes: 35, title: { en: 'Writing a clear paragraph', vi: 'Viết một đoạn văn rõ ràng' } },
  { id: 'ip-w-chart-sentences', block: 'writing', minutes: 40, title: { en: 'Describing a bar chart: five sentence patterns', vi: 'Mô tả biểu đồ cột: năm mẫu câu' } },
  { id: 'ip-w-opinion', block: 'writing', minutes: 40, title: { en: 'Task 2: an opinion paragraph', vi: 'Task 2: đoạn nêu quan điểm' } },
  { id: 'ip-w-task1-report', block: 'writing', minutes: 40, title: { en: 'Task 1: intro, overview and details', vi: 'Task 1: mở bài, tổng quan và chi tiết' } },
  { id: 'ip-w-task2-short', block: 'writing', minutes: 40, title: { en: 'Task 2: a short essay in four steps', vi: 'Task 2: bài luận ngắn trong bốn bước' } },
  { id: 'ip-s-part1-basics', block: 'speaking', minutes: 35, title: { en: 'Part 1: answer the question, then say a little more', vi: 'Part 1: trả lời đúng câu hỏi rồi nói thêm một chút' } },
  { id: 'ip-s-part1-develop', block: 'speaking', minutes: 35, title: { en: 'Part 1: idea, reason, example', vi: 'Part 1: ý chính, lý do, ví dụ' } },
  { id: 'ip-s-part2-plan', block: 'speaking', minutes: 40, title: { en: 'Part 2: plan in one minute, talk for one minute', vi: 'Part 2: lập dàn ý một phút, nói một phút' } },
  { id: 'ip-s-mock-check', block: 'speaking', minutes: 35, title: { en: 'Checking your own recording', vi: 'Tự kiểm tra bản ghi âm của bạn' } },
];

LESSONS.push(...PHASE2_LESSONS, ...PHASE3_LESSONS, ...PHASE4_LESSONS, ...PHASE5_LESSONS);

export const lessonMeta = (id: string): LessonMeta | undefined => LESSONS.find((l) => l.id === id);

export interface DayPlan {
  /** Grammar point and the words topic for each of study days 1-6 */
  grammar: string[];
  words: { topic: string; level: string }[];
  /** Each block's steps for the six study days; null leaves the block empty that day */
  listening: (DayStep | null)[];
  reading: (DayStep | null)[];
  writing: (DayStep | null)[];
  speaking: (DayStep | null)[];
  /** Day 7: a short test and a lighter review */
  review: Partial<Record<Block, DayStep[]>>;
}

export type DayStep = { lesson: string } | { practice: PracticeType; minutes?: number };

const L = (lesson: string): DayStep => ({ lesson });
const P = (practice: PracticeType, minutes?: number): DayStep => ({ practice, minutes });

const PHASE1_WEEKS: Record<number, DayPlan> = {
  // Week 1: present and past simple; family, home, work; dictation; short texts; a daily-routine paragraph; Part 1
  1: {
    grammar: ['present-simple', 'adverbs-frequency', 'past-simple', 'question-forms', 'there-is-are', 'prepositions-time'],
    words: [
      { topic: 'family', level: 'A1' }, { topic: 'family', level: 'A1' }, { topic: 'home', level: 'A1' },
      { topic: 'home', level: 'A2' }, { topic: 'work', level: 'A2' }, { topic: 'work', level: 'A2' },
    ],
    listening: [L('ip-l-dictation'), P('l-conv'), P('l-conv'), P('l-conv'), P('l-conv'), P('l-conv')],
    reading: [L('ip-r-skim'), P('r-short'), P('r-short'), P('r-short'), P('r-short'), P('r-short')],
    writing: [L('ip-w-paragraph'), P('w-para', 45), null, P('w-para', 45), null, P('w-para', 45)],
    speaking: [L('ip-s-part1-basics'), P('s-part1'), P('s-part1'), P('s-part1'), P('s-part1'), P('s-part1')],
    review: { listening: [P('l-conv')], reading: [P('r-short')], speaking: [P('s-part1')] },
  },
  // Week 2: present perfect, past continuous, future; food, hobbies, transport; Section 1; TFNG; Task 1 intro; Part 1 development
  2: {
    grammar: ['present-perfect', 'past-continuous', 'future-will', 'future-going-to', 'adverbs-frequency', 'question-forms'],
    words: [
      { topic: 'food', level: 'A2' }, { topic: 'food', level: 'A2' }, { topic: 'hobbies', level: 'A2' },
      { topic: 'hobbies', level: 'A2' }, { topic: 'transport', level: 'A2' }, { topic: 'transport', level: 'B1' },
    ],
    listening: [L('ip-l-form'), P('l-form'), P('l-form'), P('l-form'), P('l-form'), P('l-form')],
    reading: [L('ip-r-tfng'), P('r-tfng'), P('r-tfng'), P('r-tfng'), P('r-tfng'), P('r-tfng')],
    writing: [L('ip-w-chart-sentences'), P('w-task1', 45), null, P('w-task1', 45), null, P('w-para', 45)],
    speaking: [L('ip-s-part1-develop'), P('s-part1'), P('s-part1'), P('s-part1'), P('s-part1'), P('s-part1')],
    review: { listening: [P('l-form')], reading: [P('r-tfng')], speaking: [P('s-part1')] },
  },
  // Week 3: articles, countable nouns, quantifiers, comparison; weather, travel, shopping; Section 2; scanning, headings; Task 2 intro; Part 2
  3: {
    grammar: ['articles-a-an', 'countable-uncountable', 'quantifiers', 'comparatives', 'superlatives', 'article-the'],
    words: [
      { topic: 'weather', level: 'A2' }, { topic: 'weather', level: 'A2' }, { topic: 'travel', level: 'B1' },
      { topic: 'travel', level: 'B1' }, { topic: 'shopping', level: 'B1' }, { topic: 'shopping', level: 'B1' },
    ],
    listening: [L('ip-l-keywords'), P('l-mono'), P('l-mono'), P('l-mono'), P('l-mono'), P('l-mono')],
    reading: [L('ip-r-scan'), P('r-scan'), P('r-scan'), P('r-scan'), P('r-scan'), P('r-scan')],
    writing: [L('ip-w-opinion'), P('w-task2', 45), null, P('w-task2', 45), null, P('w-task2', 45)],
    speaking: [L('ip-s-part2-plan'), P('s-part2'), P('s-part1'), P('s-part2'), P('s-part1'), P('s-part2')],
    review: { listening: [P('l-mono')], reading: [P('r-scan')], speaking: [P('s-part2')] },
  },
  // Week 4: relative clauses, conditionals 0/1, passive; review; full sections; one passage in 20 minutes; Task 1 and 2; mock Part 1 and 2
  4: {
    grammar: ['defining-relative', 'zero-conditional', 'first-conditional', 'passive-basics', 'relative-pronouns', 'time-clauses'],
    words: [
      { topic: 'review', level: 'A2' }, { topic: 'review', level: 'B1' }, { topic: 'review', level: 'B1' },
      { topic: 'review', level: 'B1' }, { topic: 'review', level: 'B1' }, { topic: 'review', level: 'B1' },
    ],
    listening: [L('ip-l-timed'), P('l-full', 45), P('l-full', 45), P('l-form'), P('l-mono'), P('l-full', 45)],
    reading: [L('ip-r-timed'), P('r-passage', 45), P('r-passage', 45), P('r-passage', 45), P('r-passage', 45), P('r-passage', 45)],
    writing: [L('ip-w-task1-report'), P('w-task1', 50), L('ip-w-task2-short'), P('w-task2', 50), null, P('w-task2', 50)],
    speaking: [L('ip-s-mock-check'), P('s-mock', 45), P('s-part1'), P('s-mock', 45), P('s-part2'), P('s-mock', 45)],
    review: { listening: [P('l-full', 45)], reading: [P('r-passage', 45)], speaking: [P('s-mock', 45)] },
  },
};

const DEFAULT_PRACTICE_MINUTES: Record<PracticeType, number> = {
  'l-conv': 30, 'l-form': 30, 'l-mono': 30, 'l-full': 45, 'l-sec3': 35, 'l-sec4': 35, 'l-test30': 40, 'l-test40': 55,
  'r-short': 35, 'r-tfng': 35, 'r-scan': 40, 'r-passage': 45, 'r-two': 50, 'r-three': 65, 'r-ynng': 40, 'r-matchinfo': 40, 'r-summary': 40,
  'w-para': 45, 'w-task1': 45, 'w-task2': 45, 'w-line': 45, 'w-opinion': 50, 'w-advdis': 50, 'w-pie': 45, 'w-process': 45, 'w-map': 45, 'w-discuss': 55, 'w-problem': 55, 'w-twopart': 55,
  's-part1': 35, 's-part2': 40, 's-mock': 45, 's-full': 50,
};

const DICTATION_MINUTES = 10;
const WORDS_MINUTES = 15;
const GRAMMAR_MINUTES = 20;

function toStep(base: Pick<Step, 'phase' | 'week' | 'day' | 'block'>, item: DayStep): Step {
  if ('lesson' in item) {
    const meta = lessonMeta(item.lesson);
    if (!meta) throw new Error(`Unknown lesson ${item.lesson}`);
    return { ...base, kind: 'lesson', ref: { lessonId: item.lesson }, core: true, minutes: meta.minutes };
  }
  return { ...base, kind: 'practice', ref: { type: item.practice }, core: true, minutes: item.minutes ?? DEFAULT_PRACTICE_MINUTES[item.practice] };
}

const WEEK_PLANS: Record<number, DayPlan> = { ...PHASE1_WEEKS, ...PHASE2_WEEKS, ...PHASE3_WEEKS, ...PHASE4_WEEKS, ...PHASE5_WEEKS };

/** Steps of a phase in order: for each day, vocabulary and grammar, then listening, reading, writing, speaking */
export function phaseSteps(phase: number): Step[] {
  const weeks = [1, 2, 3, 4].map((n) => (phase - 1) * 4 + n);
  if (!weeks.every((week) => WEEK_PLANS[week])) return [];
  const steps: Step[] = [];
  for (const week of weeks) {
    const plan = WEEK_PLANS[week];
    for (let day = 1; day <= 6; day++) {
      const at = (block: Block) => ({ phase, week, day, block });
      const words = plan.words[day - 1];
      steps.push({ ...at('vocab-grammar'), kind: 'words', ref: { level: words.level, count: 15, topic: words.topic }, core: true, minutes: WORDS_MINUTES });
      steps.push({ ...at('vocab-grammar'), kind: 'grammar', ref: { pointId: plan.grammar[day - 1] }, core: true, minutes: GRAMMAR_MINUTES });
      steps.push({ ...at('listening'), kind: 'dictation', ref: {}, core: false, minutes: DICTATION_MINUTES });
      for (const block of ['listening', 'reading', 'writing', 'speaking'] as const) {
        const item = plan[block][day - 1];
        if (item) steps.push(toStep(at(block), item));
      }
    }
    // Day 7: review and a short test
    for (const block of BLOCKS) {
      for (const item of plan.review[block] ?? []) steps.push(toStep({ phase, week, day: 7, block }, item));
    }
  }
  return steps;
}

/** Phases that have a written syllabus */
export const WRITTEN_PHASES = [1, 2, 3, 4, 5];

/** Minutes of a whole phase, for estimating phases that are not written yet */
export const phaseMinutes = (phase: number): number => phaseSteps(phase).reduce((n, s) => n + s.minutes, 0);

