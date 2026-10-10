/**
 * IELTS Bank
 * Generates IELTS listening sections, reading passages, writing tasks and speaking sets with the AI.
 * Listening and reading answer keys must survive an independent solve, like TOEIC groups.
 */
import { z } from 'zod';
import { db } from '../db/client.js';
import { contentItems, type ContentItem, type User } from '../db/schema.js';
import { buildGenerationPrompt } from '../content/generators.js';
import { CONTENT_KINDS, contentTitle, ieltsListening, ieltsReading, type CefrLevel, type IeltsQuestion } from '../content/schemas.js';
import { runAIJson } from '../services/ai.js';
import { HttpError } from '../http/errors.js';
import { isCorrect, TFNG_VALUES, type IeltsSlot } from './ielts.js';

/** Long outputs (a 900-word passage with 13 questions) need more time than practice items */
const IELTS_GENERATE_TIMEOUT_MS = 150_000;
const MAX_GENERATION_ROUNDS = 2;
const FILL_CONCURRENCY = 3;

const IELTS_TOPICS = [
  'urban planning and green spaces',
  'the history of a scientific discovery',
  'animal migration',
  'renewable energy',
  'language learning in childhood',
  'ancient trade routes',
  'sleep and memory',
  'ocean plastic',
  'the psychology of advertising',
  'architecture and climate',
  'food security',
  'museums in the digital age',
  'volcanoes and early warning systems',
  'remote work and productivity',
  'the evolution of writing systems',
  'coral reefs',
  'space exploration',
  'traditional crafts',
  'public transport',
  'bees and pollination',
];

/** Everyday settings for listening sections 1 and 2 */
const EVERYDAY_TOPICS = [
  'booking a holiday cottage',
  'joining a sports club',
  'renting a flat',
  'registering for an evening course',
  'a guided tour of a museum',
  'a community festival',
  'lost property at a train station',
  'a library membership',
  'planning a school trip',
  'a volunteer programme at a nature reserve',
];

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const JSON_RULES = `Rules:
- Original material only; never copy published IELTS tests.
- Natural, correct British or international English.
- For every question write the explanation first, then the answer the explanation proves; exactly one correct answer.
- Gap-fill answers are copied word for word from the source text and respect "wordLimit" (1-3 words). Put that exact
  wording first in "answers" and add accepted variants after it (e.g. "15" and "fifteen", "colour" and "color").
- Questions follow the order of the information in the source text.
- Respond with ONLY one JSON object, no markdown fences, no commentary.`;

const MCQ = '{"type": "mcq", "prompt": "...", "options": ["...","...","...","..."], "explanation": "...", "answerIndex": 2}';
const GAP = '{"type": "gap", "prompt": "Name of the hotel: ____", "wordLimit": 2, "explanation": "...", "answers": ["Grand Plaza"]}';
const TFNG = '{"type": "tfng", "prompt": "a statement about the passage", "explanation": "...", "answer": "true" | "false" | "not_given"}';

const LISTENING_STYLE: Record<1 | 2 | 3 | 4, string> = {
  1: `Section 1: a conversation between two people in an everyday social context (for example an enquiry or a booking).
Script 18-30 lines. Include a name that is spelled out letter by letter (say the whole name first: "It's Harlow, H-A-R-L-O-W."),
a number or date, and an address or time.
Questions: 7 "gap" form/note completion questions, then 3 "mcq".`,
  2: `Section 2: a monologue in an everyday social context (a guide, an announcement or a talk about local facilities).
Script 12-20 lines (one speaker, "A" only). Questions: 5 "mcq", then 5 "gap" note completion questions.`,
  3: `Section 3: a conversation between two or three students (and possibly a tutor) about an assignment or course.
Script 18-30 lines. Questions: 6 "mcq" about opinions and decisions, then 4 "gap" summary completion questions.`,
  4: `Section 4: an academic lecture by one speaker. Script 12-20 lines ("A" only), clearly structured with signposting.
Questions: 10 "gap" note completion questions following the lecture's structure.`,
};

/**
 * Prompt for one listening section or reading passage
 */
function ieltsPrompt(slot: IeltsSlot, level: CefrLevel): { system: string; user: string; topic: string } {
  const system = `You create original IELTS Academic practice test material at about CEFR ${level} difficulty.\n${JSON_RULES}`;

  if (slot === 'reading') {
    const topic = pick(IELTS_TOPICS);
    return {
      system,
      topic,
      user: `Topic: ${topic}
Write one IELTS Academic reading passage of 750-900 words in 5-7 paragraphs, in the style of a popular-science magazine.
Then EXACTLY 13 questions in three blocks, in this order:
1) 5 "tfng" (TRUE / FALSE / NOT GIVEN) statements; include at least one of each answer.
2) 4 "mcq" questions.
3) 4 "gap" sentence-completion questions ("Complete the sentences. Choose NO MORE THAN TWO WORDS from the passage").
JSON: {"title": "...", "paragraphs": ["...", "..."], "questions": [${TFNG}, ${MCQ}, ${GAP}]}`,
    };
  }

  const section = Number(slot.slice(-1)) as 1 | 2 | 3 | 4;
  const topic = section <= 2 ? pick(EVERYDAY_TOPICS) : pick(IELTS_TOPICS);
  return {
    system,
    topic,
    user: `Topic: ${topic}
Write IELTS Listening ${LISTENING_STYLE[section]}
The script is read aloud by text-to-speech: spoken style, no stage directions or sound effects. Include natural distractors
(a detail that is mentioned and then corrected). "context" is the one-sentence introduction the learner reads first.
JSON: {"section": ${section}, "title": "...", "context": "You will hear ...",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}, "B": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}],
 "questions": [${GAP}, ${MCQ}]}
Use exactly 10 questions. Omit "B" for a monologue; add "C" only for a third speaker.`,
  };
}

/**
 * The group as a test-taker sees it, for the solver
 */
function solverView(slot: IeltsSlot, payload: { script?: { speaker: string; text: string }[]; paragraphs?: string[]; questions: IeltsQuestion[] }) {
  const source = slot === 'reading' ? (payload.paragraphs ?? []).join('\n\n') : (payload.script ?? []).map((l) => `${l.speaker}: ${l.text}`).join('\n');
  const questions = payload.questions.map((q, i) => {
    if (q.type === 'mcq') return `${i + 1}. [choice] ${q.prompt}\n${q.options.map((o, j) => `${j}. ${o}`).join('\n')}`;
    if (q.type === 'tfng') return `${i + 1}. [true/false/not_given] ${q.prompt}`;
    return `${i + 1}. [gap, max ${q.wordLimit} word(s)] ${q.prompt}`;
  });
  return `${slot === 'reading' ? 'Passage' : 'Transcript'}:\n${source}\n\nQuestions:\n${questions.join('\n\n')}`;
}

/**
 * Solves the group without the key
 * @returns 1-based numbers of questions where the solver disagrees with the key
 */
async function verifyIelts(user: User, slot: IeltsSlot, payload: { questions: IeltsQuestion[] }, feature: string, model?: string): Promise<number[]> {
  const count = payload.questions.length;
  const solved = await runAIJson(
    user,
    {
      feature,
      model,
      timeoutMs: IELTS_GENERATE_TIMEOUT_MS,
      system: `You are an expert IELTS candidate. Answer every question from the text only.
[choice]: the 0-based option index. [true/false/not_given]: "true", "false" or "not_given".
[gap]: the missing words copied from the text, within the word limit.
Respond with ONLY one JSON object.`,
      messages: [{ role: 'user', content: `${solverView(slot, payload as never)}\n\nJSON: {"answers": [one answer per question, in order]}` }],
    },
    z.object({ answers: z.array(z.unknown()).length(count) })
  );

  return payload.questions.flatMap((question, i) => (isCorrect(question, solverAnswer(question, solved.answers[i])) ? [] : [i + 1]));
}

/**
 * The solver's reply in answer form; models sometimes send letters, booleans or lists
 */
function solverAnswer(question: IeltsQuestion, raw: unknown): number | string | undefined {
  const value = Array.isArray(raw) ? raw.join(' ') : typeof raw === 'boolean' ? String(raw) : raw;
  if (question.type === 'mcq') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^[A-D]$/i.test(value.trim())) return 'ABCD'.indexOf(value.trim().toUpperCase());
    return typeof value === 'string' && /^\d$/.test(value.trim()) ? Number(value) : undefined;
  }
  if (question.type === 'tfng') {
    if (typeof value !== 'string') return undefined;
    const index = TFNG_VALUES.indexOf(value.toLowerCase().trim().replace(/\s+/g, '_') as never);
    return index >= 0 ? index : undefined;
  }
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

/** Content kind and labels per slot */
function slotKind(slot: IeltsSlot) {
  if (slot === 'reading') return { kind: 'ielts-reading' as const, part: 'ielts-reading' };
  if (slot === 'speaking') return { kind: 'speaking-ielts' as const, part: 'ielts-speaking' };
  if (slot === 'writing-task1') return { kind: 'writing-prompt' as const, part: 'ielts-w1' };
  if (slot === 'writing-task2') return { kind: 'writing-prompt' as const, part: 'ielts-w2' };
  return { kind: 'ielts-listening' as const, part: `ielts-l${slot.slice(-1)}` };
}

/**
 * Generates and stores one group for a slot
 * @throws HttpError 502 when no generated group passes validation and the answer check
 */
export async function generateIeltsGroup(user: User, slot: IeltsSlot, level: CefrLevel, feature: string, model?: string): Promise<ContentItem> {
  const { kind, part } = slotKind(slot);
  let payload: unknown = null;
  let topic: string;

  if (kind === 'writing-prompt' || kind === 'speaking-ielts') {
    topic = pick(IELTS_TOPICS);
    const prompt = buildGenerationPrompt(kind, level, topic, slot === 'writing-task1' ? 'ielts-task1' : slot === 'writing-task2' ? 'ielts-task2' : undefined);
    payload = await runAIJson(
      user,
      { feature, model, system: prompt.system, messages: [{ role: 'user', content: prompt.user }], timeoutMs: IELTS_GENERATE_TIMEOUT_MS },
      CONTENT_KINDS[kind].schema
    );
    if (kind === 'writing-prompt' && (payload as { taskType: string }).taskType !== (slot === 'writing-task1' ? 'ielts-task1' : 'ielts-task2')) {
      throw new HttpError(502, 'The AI returned a different task type. Please try again.', 'ai_invalid_output');
    }
  } else {
    const prompt = ieltsPrompt(slot, level);
    topic = prompt.topic;
    const schema = kind === 'ielts-reading' ? ieltsReading : ieltsListening;
    for (let round = 1; round <= MAX_GENERATION_ROUNDS && payload === null; round++) {
      const candidate = await runAIJson(
        user,
        { feature, model, system: prompt.system, messages: [{ role: 'user', content: prompt.user }], timeoutMs: IELTS_GENERATE_TIMEOUT_MS },
        schema
      );
      if (kind === 'ielts-listening' && (candidate as { section: number }).section !== Number(slot.slice(-1))) continue;
      const disagreements = await verifyIelts(user, slot, candidate as { questions: IeltsQuestion[] }, feature, model);
      if (disagreements.length === 0) payload = candidate;
      else console.warn(`IELTS ${slot} group rejected (round ${round}): solver disagreed on questions ${disagreements.join(', ')}`);
    }
    if (payload === null) throw new HttpError(502, 'Generated questions failed the answer check. Please try again.', 'ai_invalid_output');
  }

  const [item] = await db
    .insert(contentItems)
    .values({
      kind,
      skill: CONTENT_KINDS[kind].skill,
      exam: 'ielts',
      part,
      level,
      title: contentTitle(kind, payload as object),
      topic,
      payload,
      source: 'ai',
      createdBy: user.id,
    })
    .returning();
  return item;
}

/**
 * Generates several groups with limited parallelism
 */
export async function generateIeltsGroups(
  user: User,
  requests: { slot: IeltsSlot; count: number }[],
  level: CefrLevel,
  feature: string,
  model?: string
): Promise<{ created: ContentItem[]; failed: number }> {
  const queue = requests.flatMap((r) => Array<IeltsSlot>(r.count).fill(r.slot));
  const created: ContentItem[] = [];
  let failed = 0;

  const worker = async () => {
    for (let slot = queue.shift(); slot !== undefined; slot = queue.shift()) {
      try {
        created.push(await generateIeltsGroup(user, slot, level, feature, model));
      } catch (error) {
        failed++;
        console.error(`Failed to generate IELTS ${slot} group:`, error instanceof Error ? error.message : error);
        if (error instanceof Error && 'statusCode' in error && [403, 429].includes(Number(error.statusCode))) {
          failed += queue.length;
          queue.length = 0;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: FILL_CONCURRENCY }, worker));
  return { created, failed };
}
