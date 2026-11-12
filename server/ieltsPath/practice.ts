/**
 * Practice exercises for the IELTS path. Writing and speaking come from fixed prompts (practiceContent.ts).
 * Listening and reading are written by the AI at the level of the phase, then solved by a second request that
 * never sees the answer key: a group the solver disagrees with is dropped. Groups are kept in a shared pool
 * (archived content items, one pool per exercise type and level) and each learner gets one they have not seen; a new
 * one is generated only when the pool has none left for them.
 */
import { and, eq, inArray, like, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { contentItems, examSessions, type ContentItem, type User } from '../db/schema.js';
import { contentTitle, fitWordLimits, gapQuestion, gapsMatchSource, ieltsSpeakers, matchQuestion, mcqQuestion, splitLongLines, tfngQuestion, type IeltsQuestion } from '../content/schemas.js';
import { HttpError } from '../http/errors.js';
import { runAIJson, SCORING_MAX_TOKENS } from '../services/ai.js';
import { generateIeltsGroup, verifyIelts } from '../exams/ieltsBank.js';
import type { IeltsBlueprint, IeltsComponent } from '../exams/ielts.js';
import { RESERVED_TESTS, testGroups, testPart } from './realTests.js';
import { phaseSteps, type PracticeType } from './syllabus.js';

const GENERATE_TIMEOUT_MS = 150_000;
const MAX_ROUNDS = 2;
/** Tries for each exercise when filling a pool in bulk */
const FILL_ATTEMPTS = 3;

const text = (max: number) => z.string().trim().min(1).max(max);
const lessonQuestion = z.discriminatedUnion('type', [mcqQuestion, tfngQuestion, gapQuestion, matchQuestion]);

/** A listening exercise: shorter than a test section, 5 to 10 questions */
export const pathListening = z
  .object({
    section: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    title: text(120),
    context: text(300),
    speakers: ieltsSpeakers,
    script: z.preprocess(splitLongLines, z.array(z.object({ speaker: z.enum(['A', 'B', 'C']), text: text(700) })).min(6).max(60)),
    questions: z.preprocess(fitWordLimits, z.array(lessonQuestion).min(5).max(10)),
  })
  .superRefine((group, ctx) => {
    const problem = gapsMatchSource(group.questions as IeltsQuestion[], group.script.map((l) => l.text).join(' '));
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['questions'] });
  });

/** A reading exercise: one short text, 5 to 13 questions */
export const pathReading = z
  .object({
    title: text(120),
    // The reader labels paragraphs A, B, C...: a letter the AI wrote in front is dropped
    paragraphs: z.preprocess((value) => (Array.isArray(value) ? value.map((p) => (typeof p === 'string' ? p.replace(/^[A-H]\.\s+/, '') : p)) : value), z.array(text(1800)).min(1).max(9)),
    questions: z.preprocess(fitWordLimits, z.array(lessonQuestion).min(5).max(13)),
  })
  .superRefine((group, ctx) => {
    const problem = gapsMatchSource(group.questions as IeltsQuestion[], group.paragraphs.join(' '));
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['questions'] });
  });

export const GENERATED_TYPES = ['l-conv', 'l-form', 'l-mono', 'l-sec3', 'l-sec4', 'r-short', 'r-tfng', 'r-scan', 'r-passage', 'r-ynng', 'r-matchinfo', 'r-summary'] as const;
export type GeneratedType = (typeof GENERATED_TYPES)[number];
/** Full-size test groups (a whole listening section or reading passage) for Gates 5 and 6 */
export const FULL_TYPES = ['g-l1', 'g-l2', 'g-l3', 'g-l4', 'g-r'] as const;
export type FullType = (typeof FULL_TYPES)[number];
/** Everything a pool can hold */
export type PoolType = GeneratedType | FullType;
export const isGenerated = (type: string): type is GeneratedType => (GENERATED_TYPES as readonly string[]).includes(type);
export const isFull = (type: string): type is FullType => (FULL_TYPES as readonly string[]).includes(type);
const FULL_SLOT = { 'g-l1': 'listening-1', 'g-l2': 'listening-2', 'g-l3': 'listening-3', 'g-l4': 'listening-4', 'g-r': 'reading' } as const;

/** Levels a pool is kept at: the same exercise type is written harder as the path goes on */
export const POOL_LEVELS = ['A2', 'B1', 'B2'] as const;
export type PoolLevel = (typeof POOL_LEVELS)[number];
/** The level of the exercises of a phase: phase 1 catches up to B1, phases 2-3 work at B1, phases 4-6 at B2 (the real test) */
export const phaseLevel = (phase: number): PoolLevel => (phase <= 1 ? 'A2' : phase <= 3 ? 'B1' : 'B2');
/** Full-size gate groups are always written at the level of the test */
const FULL_LEVEL: PoolLevel = 'B2';
/** The level a pool type is drawn at for a phase */
export const levelFor = (type: PoolType, phase: number): PoolLevel => (isFull(type) ? FULL_LEVEL : phaseLevel(phase));

const MCQ = '{"type": "mcq", "prompt": "...", "options": ["...","...","...","..."], "explanation": "...", "answerIndex": 2}';
const GAP = '{"type": "gap", "prompt": "Name of the hotel: ____", "wordLimit": 2, "explanation": "...", "answers": ["Grand Plaza"]}';
const TFNG = '{"type": "tfng", "prompt": "a statement about the text", "explanation": "...", "answer": "true" | "false" | "not_given"}';
const MATCH = '{"type": "match", "prompt": "...", "options": ["item A","item B","item C","item D","item E"], "explanation": "...", "answerIndex": 1}';

/** How the language and the length change with the level; lengths in the recipes are multiplied by `scale` */
const STYLE: Record<PoolLevel, { scale: number; language: string }> = {
  A2: {
    scale: 0.85,
    language: 'Keep the language EASY (CEFR A2): short sentences (under 15 words), common everyday words, mostly present and past simple. At most one correction or distractor; the questions use the words of the source text.',
  },
  B1: {
    scale: 1,
    language: 'Language at about CEFR B1: sentences up to 20 words, everyday words plus a few topic words made clear by the context, a mix of tenses. Include two or three distractors (a correction, a negative, a "but") and paraphrase the source text in about half of the questions.',
  },
  B2: {
    scale: 1.3,
    language: 'Language at about CEFR B2, like the real IELTS Academic test: natural sentence length (up to 25-30 words), academic vocabulary with no explanation, complex sentences, passives and nominalisations. Include several distractors; paraphrase the source text in most questions; wrong multiple-choice options reuse words of the text with a changed meaning.',
  },
};

export const rulesFor = (level: PoolLevel): string => `Rules:
- Original material; natural, correct English. ${STYLE[level].language}
- For every question write the explanation first, then the answer the explanation proves; exactly one correct answer.
- Gap answers are copied word for word from the source text and respect "wordLimit" (1-3 words); put that exact wording first in "answers".
- Questions follow the order of the information in the source text.
- Respond with ONLY one JSON object, no markdown fences, no commentary.`;
/** The B1 rules, for tests and for the bank */
export const RULES = rulesFor('B1');

const TOPICS = ['a sports club', 'a language course', 'renting a room', 'a day trip', 'a library', 'a cooking class', 'a hotel booking', 'a community garden', 'a school open day', 'a bike shop', 'a local market', 'a holiday camp', 'a music festival', 'moving to a new town', 'a part-time job'];
const READ_TOPICS = ['a small town library', 'a bicycle scheme', 'a school garden', 'a family restaurant', 'a train journey', 'a city park', 'a young inventor', 'a weekend market', 'a village festival', 'a new bus service', 'sleep and school', 'a recycling project'];
/** Topics with more to say at B2: used instead of the everyday ones from phase 4 on */
const ACADEMIC_TOPICS = ['urban planning', 'the history of printing', 'migration of birds', 'renewable energy storage', 'the psychology of memory', 'ocean currents and climate', 'ancient trade routes', 'the economics of tourism', 'language and the brain', 'soil and food production', 'the design of bridges', 'sleep research'];
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** A length written for B1, scaled to the level */
type Scale = (base: number) => number;

interface Recipe {
  component: 'listening' | 'reading';
  /** Listening section style or reading text shape, as instructions; `n` scales the B1 lengths to the level */
  prompt: (topic: string, n: Scale) => string;
  topics: string[];
  /** Topics used at B2 instead of `topics` */
  academicTopics?: string[];
}

export const RECIPES: Record<GeneratedType, Recipe> = {
  'l-conv': {
    component: 'listening', topics: TOPICS,
    prompt: (topic, n) => `Write a short IELTS-style Listening Section 1 conversation about ${topic}: two people, a customer asking an employee for information.
Script ${n(14)}-${n(20)} short lines. Include one name spelled letter by letter and one number or time. Include one detail that is corrected.
Exactly 6 questions: 4 "gap" (note completion) then 2 "mcq". JSON: {"section": 1, "title": "...", "context": "You will hear ...",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}, "B": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${GAP}, ${MCQ}]}`,
  },
  'l-form': {
    component: 'listening', topics: TOPICS,
    prompt: (topic, n) => `Write an IELTS-style Listening Section 1 phone call about ${topic} where the caller gives details for a booking form.
Script ${n(16)}-${n(22)} short lines. The caller spells the surname letter by letter (say the whole name first), gives a phone number, a date, an address
or postcode, and changes one detail ("Tuesday... no, Wednesday"). Exactly 8 "gap" questions (form completion) with wordLimit 1 or 2.
JSON: {"section": 1, "title": "...", "context": "You will hear a phone call about ... Complete the form.",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}, "B": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${GAP}]}`,
  },
  'l-mono': {
    component: 'listening', topics: TOPICS,
    prompt: (topic, n) => `Write an IELTS-style Listening Section 2 monologue about ${topic}: one speaker (a guide or an announcement, speaker "A" only).
Script ${n(12)}-${n(18)} lines, spoken style, with directions or a schedule. Exactly 8 questions in this order: 3 "mcq", then 5 "match" where the learner
matches 5 items spoken in the talk to a list of 5 options (repeat the same 5 options in each "match" question, each answer index used once).
JSON: {"section": 2, "title": "...", "context": "You will hear ...",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${MCQ}, ${MATCH}]}`,
  },
  'l-sec3': {
    component: 'listening', topics: ['a group presentation', 'a research project', 'choosing a course option', 'an essay plan', 'a lab report', 'a class survey', 'a study trip'],
    academicTopics: ['a dissertation on urban noise', 'a field study of coastal erosion', 'a marketing case study', 'an experiment on memory', 'a statistics assignment', 'a seminar on renewable energy', 'a literature review'],
    prompt: (topic, n) => `Write an IELTS-style Listening Section 3 conversation about ${topic}: two students (and no one else), discussing a task for their course.
Script ${n(18)}-${n(24)} lines in a natural, clear spoken style. Include one decision that changes ("Let's do X... no, Y is better"), a date or number, and advice from a tutor.
Exactly 10 questions: 6 "mcq" (opinions, decisions) then 4 "gap" (notes, "NO MORE THAN TWO WORDS").
JSON: {"section": 3, "title": "...", "context": "You will hear two students discussing ...",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}, "B": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${MCQ}, ${GAP}]}`,
  },
  'l-sec4': {
    component: 'listening', topics: ['green roofs', 'the history of the bicycle', 'bees and farming', 'recycling plastic', 'how sleep works', 'urban gardens', 'tidal energy'],
    academicTopics: ACADEMIC_TOPICS,
    prompt: (topic, n) => `Write an IELTS-style Listening Section 4: a short academic lecture about ${topic} by one speaker (speaker "A" only).
Script ${n(12)}-${n(16)} lines, clearly structured ("First... Second... Finally..."), with numbers and some technical words.
Exactly 10 "gap" questions (notes completion following the lecture, "NO MORE THAN TWO WORDS AND/OR A NUMBER").
JSON: {"section": 4, "title": "...", "context": "You will hear a lecture about ...",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${GAP}]}`,
  },
  'r-short': {
    component: 'reading', topics: READ_TOPICS,
    prompt: (topic, n) => `Write one short reading text about ${topic} of ${n(170)}-${n(220)} words in 3-4 paragraphs.
Exactly 6 questions: 3 "mcq" then 3 "gap" (sentence completion, "NO MORE THAN TWO WORDS").
JSON: {"title": "...", "paragraphs": ["...", "..."], "questions": [${MCQ}, ${GAP}]}`,
  },
  'r-tfng': {
    component: 'reading', topics: READ_TOPICS,
    prompt: (topic, n) => `Write one reading text about ${topic} of ${n(200)}-${n(250)} words in 3-4 paragraphs.
Exactly 8 questions: 6 "tfng" (include at least two true, two false and two not_given; a "false" statement must contradict the text, a "not_given"
statement must be about something the text does not mention) then 2 "gap".
JSON: {"title": "...", "paragraphs": ["...", "..."], "questions": [${TFNG}, ${GAP}]}`,
  },
  'r-scan': {
    component: 'reading', topics: READ_TOPICS, academicTopics: ACADEMIC_TOPICS,
    prompt: (topic, n) => `Write one reading text about ${topic} of ${n(250)}-${n(300)} words in exactly 4 paragraphs. Do not number or letter the paragraphs (the reader shows A, B, C, D itself). Include a few numbers and names. Exactly 7 questions: 4 "match" (matching headings: the prompt is "Paragraph A", etc.;
"options" is the same list of 6 headings in every question, 2 of them wrong; each correct answer index used once) then 3 "gap" (a number, a name or a place from the text).
JSON: {"title": "...", "paragraphs": ["...", "...", "...", "..."], "questions": [${MATCH}, ${GAP}]}`,
  },
  'r-ynng': {
    component: 'reading', topics: ['working from home', 'city life', 'learning languages', 'sport at school', 'public transport', 'social media', 'recycling', 'part-time jobs'],
    academicTopics: ['the value of a university degree', 'genetically modified crops', 'the four-day working week', 'nuclear power', 'tourism in fragile places', 'artificial intelligence in medicine', 'the decline of handwriting'],
    prompt: (topic, n) => `Write one reading text about ${topic} of ${n(300)}-${n(350)} words in 4 paragraphs. It is an opinion piece: the writer gives a clear view and also reports other people's views.
Exactly 10 questions: 8 "match" (Yes / No / Not Given about the WRITER'S VIEWS or claims; "options" is exactly ["Yes", "No", "Not Given"] in every question; "answerIndex" 0 = Yes (agrees with the writer's view), 1 = No (contradicts it), 2 = Not Given (the writer says nothing about it); include at least two of each) then 2 "gap".
JSON: {"title": "...", "paragraphs": ["...", "..."], "questions": [{"type": "match", "prompt": "The writer believes that ...", "options": ["Yes", "No", "Not Given"], "explanation": "...", "answerIndex": 0}, ${GAP}]}`,
  },
  'r-matchinfo': {
    component: 'reading', topics: ['a museum', 'a small business', 'a new bus service', 'a school project', 'a local festival', 'a nature reserve', 'a sports centre'],
    academicTopics: ACADEMIC_TOPICS,
    prompt: (topic, n) => `Write one reading text about ${topic} of ${n(300)}-${n(350)} words in exactly 5 paragraphs (do not letter them: the reader shows A, B, C, D, E itself). Each paragraph holds one clear piece of information (a reason, a date, an example, a problem, a plan).
Exactly 9 questions: 6 "match" ("Which paragraph contains ...?": the prompt is the information to find; "options" is exactly ["Paragraph A", "Paragraph B", "Paragraph C", "Paragraph D", "Paragraph E"] in every question; "answerIndex" is the right paragraph, 0 = A; a paragraph may be used once or not at all) then 3 "gap" ("NO MORE THAN TWO WORDS").
JSON: {"title": "...", "paragraphs": ["...", "...", "...", "...", "..."], "questions": [{"type": "match", "prompt": "a reason for a change", "options": ["Paragraph A", "Paragraph B", "Paragraph C", "Paragraph D", "Paragraph E"], "explanation": "...", "answerIndex": 2}, ${GAP}]}`,
  },
  'r-summary': {
    component: 'reading', topics: ['how bees make honey', 'the history of the bicycle', 'a new recycling method', 'how cities grow', 'sleep and learning', 'a wind farm', 'plastic in the sea'],
    academicTopics: ACADEMIC_TOPICS,
    prompt: (topic, n) => `Write one reading text about ${topic} of ${n(300)}-${n(350)} words in 4-5 paragraphs, clearly structured, in the style of a magazine article.
Exactly 10 "gap" questions in two blocks: (1) six sentences that together form a SUMMARY of the first half, each with one gap; (2) four note-style lines ("Cause: ____", "Result: ____") that form a TABLE of the second half. Answers are copied from the text ("NO MORE THAN TWO WORDS"); the summary sentences follow the order of the text.
JSON: {"title": "...", "paragraphs": ["...", "..."], "questions": [${GAP}]}`,
  },
  'r-passage': {
    component: 'reading', topics: READ_TOPICS, academicTopics: ACADEMIC_TOPICS,
    prompt: (topic, n) => `Write one reading passage about ${topic} of ${n(350)}-${n(420)} words in 5-6 paragraphs, in the style of a magazine article.
Exactly 10 questions: 4 "tfng" (at least one of each answer), 3 "mcq", then 3 "gap" (sentence completion, "NO MORE THAN TWO WORDS").
JSON: {"title": "...", "paragraphs": ["...", "..."], "questions": [${TFNG}, ${MCQ}, ${GAP}]}`,
  },
};

/** Exercise types that make up a test (more than one group) */
export const FULL_GROUPS: Partial<Record<PracticeType, GeneratedType[]>> = {
  'l-full': ['l-form', 'l-mono'],
  'l-test30': ['l-form', 'l-mono', 'l-sec3'],
  'l-test40': ['l-form', 'l-mono', 'l-sec3', 'l-sec4'],
  'r-two': ['r-passage', 'r-passage'],
  'r-three': ['r-passage', 'r-passage', 'r-passage'],
};

export const componentOf = (type: PracticeType): IeltsComponent =>
  type.startsWith('l-') ? 'listening' : type.startsWith('r-') ? 'reading' : type.startsWith('w-') ? 'writing' : 'speaking';

/** Group ids of the learner's earlier sessions: pool items they have already seen */
async function seenIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ blueprint: examSessions.blueprint }).from(examSessions).where(eq(examSessions.userId, userId));
  return new Set(rows.flatMap((r) => (r.blueprint as IeltsBlueprint).sections.flatMap((s) => s.groupIds)));
}

/** Items of a pool, by exercise type and level (the written prompts have no level: they are fixed) */
const poolOf = (type: PoolType | PracticeType, level?: PoolLevel | null) =>
  and(eq(contentItems.part, `path:${type}`), level ? eq(contentItems.level, level) : undefined, eq(contentItems.status, 'archived'));

/** Which real groups (see realTests.ts) can stand in for an exercise type */
const REAL_SOURCE: Partial<Record<GeneratedType, { kind: 'ielts-listening' | 'ielts-reading'; section?: number }>> = {
  'l-form': { kind: 'ielts-listening', section: 1 },
  'l-mono': { kind: 'ielts-listening', section: 2 },
  'l-sec3': { kind: 'ielts-listening', section: 3 },
  'l-sec4': { kind: 'ielts-listening', section: 4 },
  'r-passage': { kind: 'ielts-reading' },
};

/**
 * The fixed written and spoken exercises that a real task can stand in for from phase 4 on: a Task 1 or Task 2 of a
 * Cambridge test, a whole Speaking test of one
 */
const REAL_STATIC: Partial<Record<PracticeType, { kind: 'writing-prompt' | 'speaking-ielts'; taskType?: string }>> = {
  'w-task1': { kind: 'writing-prompt', taskType: 'ielts-task1' },
  'w-task2': { kind: 'writing-prompt', taskType: 'ielts-task2' },
  's-mock': { kind: 'speaking-ielts' },
  's-full': { kind: 'speaking-ielts' },
};

/** A real group of the matching kind the learner has not seen, from the tests not kept for a gate or a mock week */
async function unseenReal(type: PoolType | PracticeType, taken: Set<string>): Promise<string | null> {
  const source = isGenerated(type) ? REAL_SOURCE[type] : REAL_STATIC[type as PracticeType];
  if (!source) return null;
  const section = 'section' in source ? source.section : undefined;
  const taskType = 'taskType' in source ? source.taskType : undefined;
  const rows = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.source, 'imported'),
        eq(contentItems.status, 'archived'),
        eq(contentItems.kind, source.kind),
        like(contentItems.part, 'book:%'),
        notInArray(contentItems.part, RESERVED_TESTS.map(testPart)),
        section ? sql`${contentItems.payload}->>'section' = ${String(section)}` : undefined,
        taskType ? sql`${contentItems.payload}->>'taskType' = ${taskType}` : undefined
      )
    );
  const fresh = rows.filter((r) => !taken.has(r.id));
  return fresh.length > 0 ? fresh[Math.floor(Math.random() * fresh.length)].id : null;
}

/** A full-size group from the IELTS bank generator, moved out of the bank into the pool */
async function generateFull(user: User, type: FullType, model?: string): Promise<ContentItem> {
  const item = await generateIeltsGroup(user, FULL_SLOT[type], FULL_LEVEL, 'path-practice', model);
  const [moved] = await db.update(contentItems).set({ status: 'archived', part: `path:${type}`, language: 'en' }).where(eq(contentItems.id, item.id)).returning();
  return moved;
}

async function generate(user: User, type: PoolType, level: PoolLevel, model?: string): Promise<ContentItem> {
  if (isFull(type)) return generateFull(user, type, model);
  const recipe = RECIPES[type];
  const topic = pick(level === 'B2' && recipe.academicTopics ? recipe.academicTopics : recipe.topics);
  const scale: Scale = (base) => Math.round(base * STYLE[level].scale);
  const schema = recipe.component === 'listening' ? pathListening : pathReading;
  const system = `You create original IELTS practice material for learners at about CEFR ${level}.\n${rulesFor(level)}`;
  const feature = 'path-practice';
  let payload: unknown = null;
  for (let round = 1; round <= MAX_ROUNDS && payload === null; round++) {
    const candidate = await runAIJson(user, { feature, model, system, messages: [{ role: 'user', content: `Topic: ${topic}\n${recipe.prompt(topic, scale)}` }], timeoutMs: GENERATE_TIMEOUT_MS, maxTokens: SCORING_MAX_TOKENS }, schema);
    const disagreements = await verifyIelts(user, recipe.component === 'reading' ? 'reading' : 'listening-1', candidate as { questions: IeltsQuestion[] }, feature, model);
    if (disagreements.length === 0) payload = candidate;
    else console.warn(`Path practice ${type} ${level} rejected (round ${round}): solver disagreed on questions ${disagreements.join(', ')}`);
  }
  if (payload === null) throw new HttpError(502, 'Generated questions failed the answer check. Please try again.', 'ai_invalid_output');
  const kind = recipe.component === 'listening' ? 'ielts-listening' : 'ielts-reading';
  const [item] = await db
    .insert(contentItems)
    .values({ kind, skill: recipe.component, exam: 'ielts', part: `path:${type}`, level, language: 'en', title: contentTitle(kind, payload as object), topic, payload, source: 'ai', status: 'archived', createdBy: user.id })
    .returning();
  return item;
}

async function groupFor(user: User, type: PoolType | PracticeType, level: PoolLevel | null, taken: Set<string>, model?: string, options: { generate?: boolean; repeat?: boolean; preferReal?: boolean } = {}): Promise<string> {
  if (options.preferReal) {
    const real = await unseenReal(type, taken);
    if (real) return real;
  }
  const pool = await db.select({ id: contentItems.id }).from(contentItems).where(poolOf(type, level));
  const fresh = pool.filter((p) => !taken.has(p.id));
  if (fresh.length > 0) return fresh[Math.floor(Math.random() * fresh.length)].id;
  if (options.repeat === false && !(options.generate ?? true)) throw new HttpError(503, 'The exercises of this test are still being prepared. Ask the admin to fill them (npm run ielts:fill-gates).', 'gate_not_ready');
  if ((options.generate ?? true) && (isGenerated(type) || isFull(type))) {
    try {
      return (await generate(user, type, level ?? levelFor(type, 1), model)).id;
    } catch (error) {
      // Practice: better a repeat than nothing when the AI cannot help right now. A gate never repeats an exercise.
      if (options.repeat !== false && pool.length > 0) return pool[Math.floor(Math.random() * pool.length)].id;
      throw error;
    }
  }
  if (options.repeat === false) throw new HttpError(503, 'The exercises of this test are still being prepared. Ask the admin to fill them (npm run ielts:fill-gates).', 'gate_not_ready');
  if (pool.length === 0) throw new HttpError(503, 'This exercise is not available yet.', 'practice_unavailable');
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/**
 * Groups for a gate: one unseen group per entry of `types` at the level of the phase the gate closes, never a repeat
 * the learner has seen and never generated on the spot for full-size groups (they take minutes; the admin fills the
 * pool beforehand). Short groups are generated when the pool has none.
 * @throws HttpError 503 gate_not_ready when the pool cannot supply them
 */
export async function gateGroups(user: User, types: PoolType[], gate: number, model?: string): Promise<string[]> {
  const taken = await seenIds(user.id);
  const ids: string[] = [];
  for (const type of types) {
    const id = await groupFor(user, type, levelFor(type, gate), taken, model, { generate: !isFull(type), repeat: false });
    taken.add(id);
    ids.push(id);
  }
  return ids;
}

/** Written exercises stand in for a whole real test of Writing when the test is not in the bank */
const STATIC_FALLBACK: Partial<Record<PracticeType, PracticeType[]>> = { 'w-full': ['w-line', 'w-discuss'] };

/** The groups of a real test for a whole-test exercise type */
function realTestIds(type: PracticeType, test: string): string[] | null {
  const groups = testGroups(test);
  if (type === 'l-test40') return groups.listening;
  if (type === 'r-three') return groups.reading;
  if (type === 'w-full') return groups.writing;
  if (type === 's-full') return groups.speaking;
  return null;
}

/**
 * The blueprint sections for a practice step of a phase, for the learner. A step that names a real test (a mock week)
 * runs that whole test; one that does not takes, from phase 4 on, real sections and passages the learner has not seen
 * before generated ones.
 * @throws HttpError when no exercise can be made (the AI is unavailable and the pool is empty)
 */
export async function practiceSections(user: User, type: PracticeType, phase: number, model?: string, test?: string): Promise<IeltsBlueprint['sections']> {
  const component = componentOf(type);
  if (test) {
    const ids = realTestIds(type, test);
    if (ids) {
      const found = await db.select({ id: contentItems.id }).from(contentItems).where(inArray(contentItems.id, ids));
      if (found.length === ids.length) return [{ component, groupIds: ids }];
    }
  }
  const taken = await seenIds(user.id);
  const types: (GeneratedType | PracticeType)[] = FULL_GROUPS[type] ?? STATIC_FALLBACK[type] ?? [type];
  const ids: string[] = [];
  for (const t of types) {
    const level = isGenerated(t) ? levelFor(t, phase) : null;
    const id = await groupFor(user, t, level, taken, model, { preferReal: level === 'B2' || (phase >= 4 && t in REAL_STATIC) });
    taken.add(id);
    ids.push(id);
  }
  return [{ component, groupIds: ids }];
}

/** Pool sizes, as "type@level" (for the fill script) */
export async function poolSizes(): Promise<Record<string, number>> {
  const rows = await db.select({ part: contentItems.part, level: contentItems.level }).from(contentItems).where(eq(contentItems.status, 'archived'));
  const out: Record<string, number> = {};
  for (const row of rows) {
    const type = row.part?.replace(/^path:/, '');
    if (!row.part?.startsWith('path:') || !(isGenerated(type ?? '') || isFull(type ?? ''))) continue;
    const key = `${type}@${row.level}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** How many groups of each generated type the practice steps of a phase draw (full tests count their parts) */
export function poolNeeds(phase: number): Partial<Record<GeneratedType, number>> {
  const needs: Partial<Record<GeneratedType, number>> = {};
  for (const step of phaseSteps(phase)) {
    if (step.kind !== 'practice') continue;
    const type = (step.ref as { type: PracticeType }).type;
    for (const t of FULL_GROUPS[type] ?? [type]) if (isGenerated(t)) needs[t] = (needs[t] ?? 0) + 1;
  }
  return needs;
}

/** Fills the pool of one type at a level by generating `count` more groups (admin script) */
export async function fillPool(user: User, type: PoolType, level: PoolLevel, count: number, model?: string): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;
  for (let i = 0; i < count; i++) {
    // The answer check drops some groups: a few tries for each
    for (let attempt = 1; attempt <= FILL_ATTEMPTS; attempt++) {
      try {
        await generate(user, type, level, model);
        created++;
        break;
      } catch (error) {
        console.error(`Could not generate ${type} ${level} (try ${attempt} of ${FILL_ATTEMPTS}):`, error instanceof Error ? error.message : error);
        if (attempt === FILL_ATTEMPTS) failed++;
      }
    }
  }
  return { created, failed };
}
