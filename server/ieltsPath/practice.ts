/**
 * Practice exercises for the IELTS path. Writing and speaking come from fixed prompts (practiceContent.ts).
 * Listening and reading are written by the AI at the level of the phase, then solved by a second request that
 * never sees the answer key: a group the solver disagrees with is dropped. Groups are kept in a shared pool
 * (archived content items, one pool per exercise type) and each learner gets one they have not seen; a new one is
 * generated only when the pool has none left for them.
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { contentItems, examSessions, type ContentItem, type User } from '../db/schema.js';
import { contentTitle, fitWordLimits, gapQuestion, gapsMatchSource, ieltsSpeakers, matchQuestion, mcqQuestion, splitLongLines, tfngQuestion, type IeltsQuestion } from '../content/schemas.js';
import { HttpError } from '../http/errors.js';
import { runAIJson, SCORING_MAX_TOKENS } from '../services/ai.js';
import { generateIeltsGroup, verifyIelts } from '../exams/ieltsBank.js';
import type { IeltsBlueprint, IeltsComponent } from '../exams/ielts.js';
import type { PracticeType } from './syllabus.js';

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

export const GENERATED_TYPES = ['l-conv', 'l-form', 'l-mono', 'l-sec3', 'l-sec4', 'r-short', 'r-tfng', 'r-scan', 'r-passage'] as const;
export type GeneratedType = (typeof GENERATED_TYPES)[number];
/** Full-size test groups (a whole listening section or reading passage) for Gates 5 and 6 */
export const FULL_TYPES = ['g-l1', 'g-l2', 'g-l3', 'g-l4', 'g-r'] as const;
export type FullType = (typeof FULL_TYPES)[number];
/** Everything a pool can hold */
export type PoolType = GeneratedType | FullType;
export const isGenerated = (type: string): type is GeneratedType => (GENERATED_TYPES as readonly string[]).includes(type);
export const isFull = (type: string): type is FullType => (FULL_TYPES as readonly string[]).includes(type);
const FULL_SLOT = { 'g-l1': 'listening-1', 'g-l2': 'listening-2', 'g-l3': 'listening-3', 'g-l4': 'listening-4', 'g-r': 'reading' } as const;

const MCQ = '{"type": "mcq", "prompt": "...", "options": ["...","...","...","..."], "explanation": "...", "answerIndex": 2}';
const GAP = '{"type": "gap", "prompt": "Name of the hotel: ____", "wordLimit": 2, "explanation": "...", "answers": ["Grand Plaza"]}';
const TFNG = '{"type": "tfng", "prompt": "a statement about the text", "explanation": "...", "answer": "true" | "false" | "not_given"}';
const MATCH = '{"type": "match", "prompt": "...", "options": ["item A","item B","item C","item D","item E"], "explanation": "...", "answerIndex": 1}';

export const RULES = `Rules:
- Original material; natural, correct English. Keep the language EASY: short sentences (under 15 words), common everyday words,
  mostly present and past simple. Explain nothing in the text with difficult words.
- For every question write the explanation first, then the answer the explanation proves; exactly one correct answer.
- Gap answers are copied word for word from the source text and respect "wordLimit" (1-3 words); put that exact wording first in "answers".
- Questions follow the order of the information in the source text.
- Respond with ONLY one JSON object, no markdown fences, no commentary.`;

const TOPICS = ['a sports club', 'a language course', 'renting a room', 'a day trip', 'a library', 'a cooking class', 'a hotel booking', 'a community garden', 'a school open day', 'a bike shop', 'a local market', 'a holiday camp', 'a music festival', 'moving to a new town', 'a part-time job'];
const READ_TOPICS = ['a small town library', 'a bicycle scheme', 'a school garden', 'a family restaurant', 'a train journey', 'a city park', 'a young inventor', 'a weekend market', 'a village festival', 'a new bus service', 'sleep and school', 'a recycling project'];
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

interface Recipe {
  component: 'listening' | 'reading';
  level: 'A2' | 'B1';
  /** Listening section style or reading text shape, as instructions */
  prompt: (topic: string) => string;
  topics: string[];
}

export const RECIPES: Record<GeneratedType, Recipe> = {
  'l-conv': {
    component: 'listening', level: 'A2', topics: TOPICS,
    prompt: (topic) => `Write a short IELTS-style Listening Section 1 conversation about ${topic}: two people, a customer asking an employee for information.
Script 14-20 short lines. Include one name spelled letter by letter and one number or time. Include one detail that is corrected.
Exactly 6 questions: 4 "gap" (note completion) then 2 "mcq". JSON: {"section": 1, "title": "...", "context": "You will hear ...",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}, "B": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${GAP}, ${MCQ}]}`,
  },
  'l-form': {
    component: 'listening', level: 'A2', topics: TOPICS,
    prompt: (topic) => `Write an IELTS-style Listening Section 1 phone call about ${topic} where the caller gives details for a booking form.
Script 16-22 short lines. The caller spells the surname letter by letter (say the whole name first), gives a phone number, a date, an address
or postcode, and changes one detail ("Tuesday... no, Wednesday"). Exactly 8 "gap" questions (form completion) with wordLimit 1 or 2.
JSON: {"section": 1, "title": "...", "context": "You will hear a phone call about ... Complete the form.",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}, "B": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${GAP}]}`,
  },
  'l-mono': {
    component: 'listening', level: 'B1', topics: TOPICS,
    prompt: (topic) => `Write an IELTS-style Listening Section 2 monologue about ${topic}: one speaker (a guide or an announcement, speaker "A" only).
Script 12-18 lines, spoken style, with directions or a schedule. Exactly 8 questions in this order: 3 "mcq", then 5 "match" where the learner
matches 5 items spoken in the talk to a list of 5 options (repeat the same 5 options in each "match" question, each answer index used once).
JSON: {"section": 2, "title": "...", "context": "You will hear ...",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${MCQ}, ${MATCH}]}`,
  },
  'l-sec3': {
    component: 'listening', level: 'B1', topics: ['a group presentation', 'a research project', 'choosing a course option', 'an essay plan', 'a lab report', 'a class survey', 'a study trip'],
    prompt: (topic) => `Write an IELTS-style Listening Section 3 conversation about ${topic}: two students (and no one else), discussing a task for their course.
Script 18-24 lines in a natural, clear spoken style. Include one decision that changes ("Let's do X... no, Y is better"), a date or number, and advice from a tutor.
Exactly 10 questions: 6 "mcq" (opinions, decisions) then 4 "gap" (notes, "NO MORE THAN TWO WORDS").
JSON: {"section": 3, "title": "...", "context": "You will hear two students discussing ...",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}, "B": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${MCQ}, ${GAP}]}`,
  },
  'l-sec4': {
    component: 'listening', level: 'B1', topics: ['green roofs', 'the history of the bicycle', 'bees and farming', 'recycling plastic', 'how sleep works', 'urban gardens', 'tidal energy'],
    prompt: (topic) => `Write an IELTS-style Listening Section 4: a short academic lecture about ${topic} by one speaker (speaker "A" only).
Script 12-16 lines, clearly structured ("First... Second... Finally..."), with numbers and some technical words explained.
Exactly 10 "gap" questions (notes completion following the lecture, "NO MORE THAN TWO WORDS AND/OR A NUMBER").
JSON: {"section": 4, "title": "...", "context": "You will hear a lecture about ...",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}], "questions": [${GAP}]}`,
  },
  'r-short': {
    component: 'reading', level: 'A2', topics: READ_TOPICS,
    prompt: (topic) => `Write one short reading text about ${topic} of 150-200 words in 3-4 paragraphs, for learners around CEFR A2-B1.
Exactly 6 questions: 3 "mcq" then 3 "gap" (sentence completion, "NO MORE THAN TWO WORDS").
JSON: {"title": "...", "paragraphs": ["...", "..."], "questions": [${MCQ}, ${GAP}]}`,
  },
  'r-tfng': {
    component: 'reading', level: 'A2', topics: READ_TOPICS,
    prompt: (topic) => `Write one reading text about ${topic} of 180-230 words in 3-4 paragraphs, for learners around CEFR A2-B1.
Exactly 8 questions: 6 "tfng" (include at least two true, two false and two not_given; a "false" statement must contradict the text, a "not_given"
statement must be about something the text does not mention) then 2 "gap".
JSON: {"title": "...", "paragraphs": ["...", "..."], "questions": [${TFNG}, ${GAP}]}`,
  },
  'r-scan': {
    component: 'reading', level: 'B1', topics: READ_TOPICS,
    prompt: (topic) => `Write one reading text about ${topic} of 250-300 words in exactly 4 paragraphs. Do not number or letter the paragraphs (the reader shows A, B, C, D itself). Include a few numbers and names. Exactly 7 questions: 4 "match" (matching headings: the prompt is "Paragraph A", etc.;
"options" is the same list of 6 headings in every question, 2 of them wrong; each correct answer index used once) then 3 "gap" (a number, a name or a place from the text).
JSON: {"title": "...", "paragraphs": ["...", "...", "...", "..."], "questions": [${MATCH}, ${GAP}]}`,
  },
  'r-passage': {
    component: 'reading', level: 'B1', topics: READ_TOPICS,
    prompt: (topic) => `Write one reading passage about ${topic} of 350-420 words in 5-6 paragraphs, in the style of a simple magazine article, for learners around CEFR B1.
Exactly 10 questions: 4 "tfng" (at least one of each answer), 3 "mcq", then 3 "gap" (sentence completion, "NO MORE THAN TWO WORDS").
JSON: {"title": "...", "paragraphs": ["...", "..."], "questions": [${TFNG}, ${MCQ}, ${GAP}]}`,
  },
};

/** Exercise types that make up a test (more than one group) */
const FULL_GROUPS: Partial<Record<PracticeType, GeneratedType[]>> = { 'l-full': ['l-form', 'l-mono'] };

export const componentOf = (type: PracticeType): IeltsComponent =>
  type.startsWith('l-') ? 'listening' : type.startsWith('r-') ? 'reading' : type.startsWith('w-') ? 'writing' : 'speaking';

/** Group ids of the learner's earlier sessions: pool items they have already seen */
async function seenIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ blueprint: examSessions.blueprint }).from(examSessions).where(eq(examSessions.userId, userId));
  return new Set(rows.flatMap((r) => (r.blueprint as IeltsBlueprint).sections.flatMap((s) => s.groupIds)));
}

/** Items of a pool, by exercise type */
const poolOf = (type: PracticeType) => and(eq(contentItems.part, `path:${type}`), eq(contentItems.status, 'archived'));

/** A full-size group from the IELTS bank generator, moved out of the bank into the pool */
async function generateFull(user: User, type: FullType, model?: string): Promise<ContentItem> {
  const item = await generateIeltsGroup(user, FULL_SLOT[type], 'B2', 'path-practice', model);
  const [moved] = await db.update(contentItems).set({ status: 'archived', part: `path:${type}`, language: 'en' }).where(eq(contentItems.id, item.id)).returning();
  return moved;
}

async function generate(user: User, type: PoolType, model?: string): Promise<ContentItem> {
  if (isFull(type)) return generateFull(user, type, model);
  const recipe = RECIPES[type];
  const topic = pick(recipe.topics);
  const schema = recipe.component === 'listening' ? pathListening : pathReading;
  const system = `You create original IELTS practice material for learners at about CEFR ${recipe.level}.\n${RULES}`;
  const feature = 'path-practice';
  let payload: unknown = null;
  for (let round = 1; round <= MAX_ROUNDS && payload === null; round++) {
    const candidate = await runAIJson(user, { feature, model, system, messages: [{ role: 'user', content: `Topic: ${topic}\n${recipe.prompt(topic)}` }], timeoutMs: GENERATE_TIMEOUT_MS, maxTokens: SCORING_MAX_TOKENS }, schema);
    const disagreements = await verifyIelts(user, recipe.component === 'reading' ? 'reading' : 'listening-1', candidate as { questions: IeltsQuestion[] }, feature, model);
    if (disagreements.length === 0) payload = candidate;
    else console.warn(`Path practice ${type} rejected (round ${round}): solver disagreed on questions ${disagreements.join(', ')}`);
  }
  if (payload === null) throw new HttpError(502, 'Generated questions failed the answer check. Please try again.', 'ai_invalid_output');
  const kind = recipe.component === 'listening' ? 'ielts-listening' : 'ielts-reading';
  const [item] = await db
    .insert(contentItems)
    .values({ kind, skill: recipe.component, exam: 'ielts', part: `path:${type}`, level: recipe.level, language: 'en', title: contentTitle(kind, payload as object), topic, payload, source: 'ai', status: 'archived', createdBy: user.id })
    .returning();
  return item;
}

async function groupFor(user: User, type: PracticeType | PoolType, taken: Set<string>, model?: string, options: { generate?: boolean; repeat?: boolean } = {}): Promise<string> {
  const pool = await db.select({ id: contentItems.id }).from(contentItems).where(poolOf(type as PracticeType));
  const fresh = pool.filter((p) => !taken.has(p.id));
  if (fresh.length > 0) return fresh[Math.floor(Math.random() * fresh.length)].id;
  if (options.repeat === false && !(options.generate ?? true)) throw new HttpError(503, 'The exercises of this test are still being prepared. Ask the admin to fill them (npm run ielts:fill-gates).', 'gate_not_ready');
  if ((options.generate ?? true) && (isGenerated(type) || isFull(type))) {
    try {
      return (await generate(user, type, model)).id;
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
 * Groups for a gate: one unseen group per entry of `types`, never a repeat the learner has seen and never generated on
 * the spot for full-size groups (they take minutes; the admin fills the pool beforehand). Short groups are generated when
 * the pool has none.
 * @throws HttpError 503 gate_not_ready when the pool cannot supply them
 */
export async function gateGroups(user: User, types: PoolType[], model?: string): Promise<string[]> {
  const taken = await seenIds(user.id);
  const ids: string[] = [];
  for (const type of types) {
    const id = await groupFor(user, type, taken, model, { generate: !isFull(type), repeat: false });
    taken.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * The blueprint sections for a practice step, for the learner
 * @throws HttpError when no exercise can be made (the AI is unavailable and the pool is empty)
 */
export async function practiceSections(user: User, type: PracticeType, model?: string): Promise<IeltsBlueprint['sections']> {
  const taken = await seenIds(user.id);
  const types = FULL_GROUPS[type] ?? [type];
  const ids: string[] = [];
  for (const t of types) {
    const id = await groupFor(user, t, taken, model);
    taken.add(id);
    ids.push(id);
  }
  return [{ component: componentOf(type), groupIds: ids }];
}

/** How many unseen groups each generated type has left for a learner (for the fill script) */
export async function poolSizes(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const type of [...GENERATED_TYPES, ...FULL_TYPES]) {
    const rows = await db.select({ id: contentItems.id }).from(contentItems).where(poolOf(type as PracticeType));
    out[type] = rows.length;
  }
  return out;
}

/** Fills the pool of one type by generating `count` more groups (admin script) */
export async function fillPool(user: User, type: PoolType, count: number, model?: string): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;
  for (let i = 0; i < count; i++) {
    // The answer check drops some groups: a few tries for each
    for (let attempt = 1; attempt <= FILL_ATTEMPTS; attempt++) {
      try {
        await generate(user, type, model);
        created++;
        break;
      } catch (error) {
        console.error(`Could not generate ${type} (try ${attempt} of ${FILL_ATTEMPTS}):`, error instanceof Error ? error.message : error);
        if (attempt === FILL_ATTEMPTS) failed++;
      }
    }
  }
  return { created, failed };
}

