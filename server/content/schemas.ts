/**
 * Content Schemas
 * Shape of every content kind's payload. AI output and built-in items are validated
 * against these, so the frontend can trust what the API returns.
 */
import { z } from 'zod';

export const CEFR_LEVELS = ['A2', 'B1', 'B2', 'C1'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * List with a minimum length whose extra items are dropped instead of failing validation.
 * AI replies often add one more tip or correction than asked; that is not worth a retry.
 */
const capped = <T extends z.ZodType>(item: T, min: number, max: number) =>
  z
    .array(item)
    .min(min)
    .transform((list) => list.slice(0, max));

/** Four-option multiple choice question */
export const mcqQuestion = z.object({
  type: z.literal('mcq'),
  prompt: text(400),
  options: z.array(text(200)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: text(600),
});

/** True / False / Not Given statement (IELTS reading) */
export const tfngQuestion = z.object({
  type: z.literal('tfng'),
  prompt: text(400),
  answer: z.enum(['true', 'false', 'not_given']),
  explanation: text(600),
});

export const quizQuestion = z.discriminatedUnion('type', [mcqQuestion, tfngQuestion]);
export type QuizQuestion = z.infer<typeof quizQuestion>;

export const readingPassage = z.object({
  title: text(120),
  paragraphs: z.array(text(1500)).min(2).max(8),
  questions: capped(quizQuestion, 5, 8),
});

export const readingGapfill = z.object({
  title: text(120),
  /** Each prompt contains "____" where the answer goes */
  questions: z
    .array(mcqQuestion.refine((q) => q.prompt.includes('____'), 'prompt must contain ____'))
    .min(6)
    .max(12),
});

const speaker = z.object({ name: text(30), gender: z.enum(['female', 'male']) });

export const listeningQuiz = z.object({
  title: text(120),
  format: z.enum(['dialogue', 'monologue']),
  /** Speaker keys used in the script; a monologue has only A */
  speakers: z.object({ A: speaker, B: speaker.optional() }),
  script: z
    .array(z.object({ speaker: z.enum(['A', 'B']), text: text(600) }))
    .min(2)
    .max(30),
  questions: z.array(mcqQuestion).min(3).max(6),
});

export const speakingIelts = z.object({
  topic: text(80),
  part1: z.array(text(200)).min(3).max(5),
  part2: z.object({
    cueCard: text(160),
    bullets: z.array(text(160)).min(3).max(4),
    closing: text(200),
  }),
  part3: z.array(text(250)).min(2).max(4),
});

const chartSeries = z.object({ name: text(40), values: z.array(z.number().finite()) });

export const writingChart = z
  .object({
    type: z.enum(['bar', 'line']),
    title: text(160),
    unit: text(30),
    categories: z.array(text(30)).min(3).max(8),
    series: z.array(chartSeries).min(1).max(4),
  })
  .refine((chart) => chart.series.every((s) => s.values.length === chart.categories.length), {
    message: 'every series needs one value per category',
  });

export const WRITING_TASKS = ['email', 'ielts-task1', 'ielts-task2'] as const;
export type WritingTask = (typeof WRITING_TASKS)[number];

export const writingPrompt = z.object({
  taskType: z.enum(WRITING_TASKS),
  title: text(120),
  instructions: text(600),
  /** Essay question, chart description, or the email to reply to */
  prompt: text(1500),
  minWords: z.number().int().min(50).max(400),
  timeMinutes: z.number().int().min(5).max(60),
  chart: writingChart.optional(),
  email: z.object({ from: text(80), subject: text(120), body: text(1500) }).optional(),
});

/* ---------- TOEIC exam groups (one content item = one group of questions) ---------- */

/** Real recording for an imported listening group: a file and an optional time window */
export const audioSegment = z
  .object({
    assetId: z.uuid(),
    start: z.number().min(0).optional(),
    end: z.number().min(0).optional(),
  })
  .refine((a) => a.start === undefined || a.end === undefined || a.end > a.start, { message: 'end must be after start' });

/** Part 1 (imported tests only): a photo and four spoken statements */
export const toeicP1 = z.object({
  items: z
    .array(
      z.object({
        imageAssetId: z.uuid(),
        statements: z.array(text(200)).length(4),
        answerIndex: z.number().int().min(0).max(3),
        explanation: text(400),
      })
    )
    .min(1)
    .max(6),
  audio: audioSegment.optional(),
});

/** Part 2: spoken question, three spoken responses (AI groups have 5 items; imported tests may hold all 25) */
export const toeicP2 = z.object({
  items: z
    .array(
      z.object({
        question: text(200),
        options: z.array(text(200)).length(3),
        answerIndex: z.number().int().min(0).max(2),
        explanation: text(400),
      })
    )
    .min(1)
    .max(25),
  audio: audioSegment.optional(),
});

const toeicSpeakers = z.object({ A: speaker, B: speaker.optional(), C: speaker.optional() });
const toeicScriptLine = z.object({ speaker: z.enum(['A', 'B', 'C']), text: text(400) });

/** Part 3: conversation with three printed questions */
export const toeicP3 = z.object({
  speakers: toeicSpeakers,
  script: z.array(toeicScriptLine).min(5).max(14),
  questions: z.array(mcqQuestion).length(3),
  /** Chart, schedule or map printed with the questions, as text */
  graphic: text(1500).optional(),
  audio: audioSegment.optional(),
});

/** Part 4: short talk by one speaker with three printed questions */
export const toeicP4 = z.object({
  talkType: text(40),
  speakers: z.object({ A: speaker }),
  script: z
    .array(z.object({ speaker: z.literal('A'), text: text(400) }))
    .min(3)
    .max(10),
  questions: z.array(mcqQuestion).length(3),
  graphic: text(1500).optional(),
  audio: audioSegment.optional(),
});

/** Imported Parts 3-4 may omit the transcript when the book's recording is attached */
export const toeicP3Import = toeicP3
  .extend({ script: z.array(toeicScriptLine).max(14) })
  .refine((p) => p.audio || p.script.length >= 5, { message: 'add the transcript or attach the recording', path: ['script'] });

export const toeicP4Import = toeicP4
  .extend({ script: z.array(z.object({ speaker: z.literal('A'), text: text(400) })).max(10) })
  .refine((p) => p.audio || p.script.length >= 3, { message: 'add the transcript or attach the recording', path: ['script'] });

/** Part 5: ten incomplete sentences */
export const toeicP5 = z.object({
  questions: z.array(mcqQuestion.refine((q) => q.prompt.includes('____'), 'prompt must contain ____')).length(10),
});

/** Part 5 groups from imported tests may hold any number of sentences up to 30 */
export const toeicP5Import = z.object({
  questions: z.array(mcqQuestion.refine((q) => q.prompt.includes('____'), 'prompt must contain ____')).min(1).max(30),
});

/** Part 6: one text with four numbered blanks */
export const toeicP6 = z
  .object({
    title: text(120),
    passage: text(2500),
    questions: z.array(mcqQuestion).length(4),
  })
  .refine((p) => [1, 2, 3, 4].every((n) => p.passage.includes(`[${n}]`)), { message: 'passage must contain blanks [1] to [4]' });

/** Part 7: one to three texts with two to five questions */
export const toeicP7 = z.object({
  passages: z
    .array(z.object({ kind: text(40), title: text(120), text: text(2500) }))
    .min(1)
    .max(3),
  questions: z.array(mcqQuestion).min(2).max(5),
});

/* ---------- IELTS Academic exam groups ---------- */

/** Gap fill (note/form/sentence completion): the prompt has one "____"; any listed answer is accepted */
export const gapQuestion = z.object({
  type: z.literal('gap'),
  prompt: text(400).refine((p) => p.includes('____'), 'prompt must contain ____'),
  answers: z.array(text(60)).min(1).max(4),
  /** Maximum words in the answer ("NO MORE THAN TWO WORDS") */
  wordLimit: z.number().int().min(1).max(3),
  explanation: text(600),
});

export const ieltsQuestion = z.discriminatedUnion('type', [mcqQuestion, tfngQuestion, gapQuestion]);
export type IeltsQuestion = z.infer<typeof ieltsQuestion>;

/**
 * Normalises a typed or expected answer: case, punctuation and extra spaces do not matter
 */
export function normalizeAnswer(answer: string): string {
  return answer
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

/**
 * Gap answers must respect the word limit and appear in the source text, so they are checkable
 */
function gapsMatchSource(questions: IeltsQuestion[], source: string): string | null {
  const haystack = ` ${normalizeAnswer(source)} `;
  // Spelled-out names ("S-M-I-T-H") only match once spaces are ignored
  const compact = haystack.replace(/\s+/g, '');
  const appears = (answer: string) => haystack.includes(` ${normalizeAnswer(answer)} `) || compact.includes(normalizeAnswer(answer).replace(/\s+/g, ''));
  for (const [index, q] of questions.entries()) {
    if (q.type !== 'gap') continue;
    if (q.answers.some((a) => wordCount(a) > q.wordLimit)) return `question ${index + 1}: an answer is longer than wordLimit`;
    if (!q.answers.some(appears)) return `question ${index + 1}: the answer "${q.answers[0]}" must appear word for word in the source text`;
  }
  return null;
}

const ieltsSpeakers = z.object({ A: speaker, B: speaker.optional(), C: speaker.optional() });

/**
 * Raises a gap's word limit to fit its answers (up to three words), a common slip in generated questions
 */
function fitWordLimits(questions: unknown): unknown {
  if (!Array.isArray(questions)) return questions;
  return questions.map((q) => {
    if (!q || typeof q !== 'object' || q.type !== 'gap' || !Array.isArray(q.answers) || typeof q.wordLimit !== 'number') return q;
    const longest = Math.max(...q.answers.map((a: unknown) => (typeof a === 'string' ? wordCount(a) : 0)));
    return longest > q.wordLimit && longest <= 3 ? { ...q, wordLimit: longest } : q;
  });
}

/** Characters per script line; longer monologue paragraphs are split at sentence ends */
const SCRIPT_LINE_CHARS = 400;

/**
 * Splits long script lines into sentence groups so monologues read naturally line by line
 */
function splitLongLines(script: unknown): unknown {
  if (!Array.isArray(script)) return script;
  return script.flatMap((line) => {
    if (!line || typeof line !== 'object' || typeof line.text !== 'string' || line.text.length <= SCRIPT_LINE_CHARS) return [line];
    const sentences = line.text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [line.text];
    const chunks: string[] = [];
    for (const sentence of sentences) {
      const last = chunks.at(-1);
      if (last !== undefined && last.length + sentence.length <= SCRIPT_LINE_CHARS) chunks[chunks.length - 1] = last + sentence;
      else chunks.push(sentence);
    }
    return chunks.map((text) => ({ ...line, text: text.trim() }));
  });
}

/** One listening section (10 questions); the script is read by the voice service */
export const ieltsListening = z
  .object({
    section: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    title: text(120),
    /** What the learner is told before listening, e.g. "You will hear a student talking to a librarian." */
    context: text(300),
    speakers: ieltsSpeakers,
    script: z.preprocess(
      splitLongLines,
      z
        .array(z.object({ speaker: z.enum(['A', 'B', 'C']), text: text(700) }))
        .min(6)
        .max(60)
    ),
    questions: z.preprocess(fitWordLimits, z.array(z.discriminatedUnion('type', [mcqQuestion, gapQuestion])).length(10)),
  })
  .superRefine((group, ctx) => {
    const problem = gapsMatchSource(group.questions, group.script.map((l) => l.text).join(' '));
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['questions'] });
  });

/** One academic reading passage with 12-14 questions */
export const ieltsReading = z
  .object({
    title: text(120),
    paragraphs: z.array(text(1800)).min(4).max(9),
    questions: z.preprocess(fitWordLimits, z.array(ieltsQuestion).min(12).max(14)),
  })
  .superRefine((group, ctx) => {
    const problem = gapsMatchSource(group.questions, group.paragraphs.join(' '));
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['questions'] });
  });

/** Content kinds, their skill and payload schema */
export const CONTENT_KINDS = {
  'reading-passage': { skill: 'reading', schema: readingPassage },
  'reading-gapfill': { skill: 'reading', schema: readingGapfill },
  'listening-quiz': { skill: 'listening', schema: listeningQuiz },
  'speaking-ielts': { skill: 'speaking', schema: speakingIelts },
  'writing-prompt': { skill: 'writing', schema: writingPrompt },
  'toeic-p1': { skill: 'listening', schema: toeicP1 },
  'toeic-p2': { skill: 'listening', schema: toeicP2 },
  'toeic-p3': { skill: 'listening', schema: toeicP3 },
  'toeic-p4': { skill: 'listening', schema: toeicP4 },
  'toeic-p5': { skill: 'reading', schema: toeicP5 },
  'toeic-p6': { skill: 'reading', schema: toeicP6 },
  'toeic-p7': { skill: 'reading', schema: toeicP7 },
  'ielts-listening': { skill: 'listening', schema: ieltsListening },
  'ielts-reading': { skill: 'reading', schema: ieltsReading },
} as const;

export type ContentKind = keyof typeof CONTENT_KINDS;
export const CONTENT_KIND_IDS = Object.keys(CONTENT_KINDS) as [ContentKind, ...ContentKind[]];

/** AI scoring result shared by writing and speaking */
export const bandFeedback = z.object({
  overallBand: z.number().min(0).max(9),
  criteria: z
    .array(z.object({ key: text(40), name: text(80), band: z.number().min(0).max(9), comment: text(800) }))
    .min(4)
    .max(4),
  strengths: capped(text(400), 1, 5),
  improvements: capped(text(400), 1, 6),
});

export const writingFeedback = bandFeedback.extend({
  corrections: capped(z.object({ original: text(300), corrected: text(300), explanation: text(400) }), 0, 15),
  improvedVersion: text(4000),
});

export const speakingFeedback = bandFeedback.extend({
  answers: capped(z.object({ question: text(300), comment: text(600), betterAnswer: text(800) }), 0, 12),
});

export const wordDefinition = z.object({
  word: text(60),
  partOfSpeech: text(30),
  ipa: z.string().trim().max(60),
  meaning: text(300),
  example: text(300),
  translation: z.string().trim().max(200),
});

/** Exam-only kinds: never listed or served by the practice library (answers would leak) */
export const isExamOnlyKind = (kind: string): boolean => kind.startsWith('toeic-p') || kind === 'ielts-listening' || kind === 'ielts-reading';

/**
 * Display title for any payload: its own title or topic, else a part label
 */
export function contentTitle(kind: ContentKind, payload: object): string {
  if ('title' in payload && typeof payload.title === 'string') return payload.title;
  if ('topic' in payload && typeof payload.topic === 'string') return payload.topic;
  const part = kind.replace('toeic-p', '');
  if ('talkType' in payload && typeof payload.talkType === 'string') return `TOEIC Part ${part} · ${payload.talkType}`;
  return `TOEIC Part ${part}`;
}
