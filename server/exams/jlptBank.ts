/**
 * JLPT Bank
 * Generates JLPT question groups with the AI, has a second pass solve them without the key,
 * and stores the ones that agree for every learner to reuse
 */
import { z } from 'zod';
import { db } from '../db/client.js';
import { contentItems, type ContentItem, type User } from '../db/schema.js';
import { JA_RULES, JLPT_GUIDE } from '../content/generators.js';
import type { JlptLevel } from '../content/schemas.js';
import { GENERATE_TIMEOUT_MS, runAIJson } from '../services/ai.js';
import { HttpError } from '../http/errors.js';
import {
  MONDAI_SECTION,
  groupSize,
  jlptGroupSchema,
  kindOf,
  partTag,
  withoutReadings,
  type JlptListeningGroup,
  type JlptQuestionGroup,
  type Mondai,
} from './jlpt.js';

/** Everyday settings, picked at random so the bank stays varied */
const TOPICS = [
  'school and classes',
  'shopping at a supermarket',
  'a part-time job',
  'trains and buses',
  'weekend plans with friends',
  'cooking and restaurants',
  'weather and seasons',
  'a doctor and health',
  'moving to a new apartment',
  'a company meeting',
  'a library and books',
  'hobbies and sports',
  'a trip in Japan',
  'a town event or festival',
  'the post office and deliveries',
  'environment and recycling',
  'technology and smartphones',
  'work and career choices',
  'family and neighbours',
  'news and society',
];

/** Character counts of the official texts per level (jlpt.jp 大問のねらい) */
const LENGTH: Record<'short' | 'mid' | 'long' | 'integrated' | 'thematic' | 'info', Record<JlptLevel, string>> = {
  short: { N5: '80', N4: '100-200', N3: '150-200', N2: '200', N1: '200' },
  mid: { N5: '250', N4: '450', N3: '350', N2: '500', N1: '500' },
  long: { N5: '550', N4: '550', N3: '550', N2: '900', N1: '1000' },
  integrated: { N5: '600', N4: '600', N3: '600', N2: '600 in total', N1: '600 in total' },
  thematic: { N5: '900', N4: '900', N3: '900', N2: '900', N1: '1000' },
  info: { N5: '250', N4: '400', N3: '600', N2: '700', N1: '700' },
};

const Q = '{"prompt": "...", "options": ["...", "...", "...", "..."], "answerIndex": 0, "explanation": {"vi": "why, in Vietnamese", "en": "why, in English"}}';
const PASSAGE = '{"title": "optional title", "text": "..."}';
const SPEAKERS = '"speakers": {"A": {"name": "a Japanese name", "gender": "female" or "male"}, "B": {"name": "...", "gender": "female" or "male"}}';
const LISTEN_ITEM =
  '{"script": [{"speaker": "A", "text": "..."}, {"speaker": "B", "text": "..."}], "question": "...", "options": ["...", "...", "...", "..."], "answerIndex": 0, "explanation": {"vi": "...", "en": "..."}}';

/**
 * What to write for one group of a 大問
 */
function mondaiTask(mondai: Mondai, level: JlptLevel, size: number): string {
  const questions = `exactly ${size} question${size > 1 ? 's' : ''}`;
  const reading = (length: string, kind: string) =>
    `Write ${kind} of about ${length} Japanese characters (not counting readings) as "passages": [${PASSAGE}], then ${questions} about it, in text order, answerable only from the text.
JSON: {"passages": [${PASSAGE}], "questions": [${Q}]}`;

  switch (mondai) {
    case 'kanji-reading':
      return `問題 漢字読み: ${questions}. Each prompt is a natural sentence with ONE word written in kanji, underlined with [[ ]]. Underline the whole word with its okurigana,
e.g. "[[学校{がっこう}]]へ行{い}きます。" or "毎朝{まいあさ}[[走{はし}ります]]。". The four options are hiragana readings of the whole underlined word
(がっこう, はしります): the correct one equals its reading; the distractors are plausible misreadings (long/short vowels, voicing, small っ, other on/kun readings).
JSON: {"questions": [${Q}]}`;
    case 'orthography':
      return `問題 表記: ${questions}. Each prompt is a sentence with ONE word written in hiragana, underlined with [[ ]], e.g. "[[がっこう]]へ行{い}きます。".
The four options are ways to write it in kanji (each with its reading in braces, e.g. 学校{がっこう}): the correct spelling and three wrong ones using look-alike or same-sound kanji; all four options carry the same reading.
JSON: {"questions": [${Q}]}`;
    case 'word-formation':
      return `問題 語形成: ${questions}. Each prompt is a sentence where a prefix or suffix is missing, shown as （\u3000）, e.g. "（\u3000）社会{しゃかい}". Options are four prefixes or suffixes; one is correct.
JSON: {"questions": [${Q}]}`;
    case 'context':
      return `問題 文脈規定: ${questions}. Each prompt is a sentence with one word missing, shown as （\u3000）. Options are four words of the same part of speech; only one fits the context.
JSON: {"questions": [${Q}]}`;
    case 'paraphrase':
      return `問題 言い換え類義: ${questions}. Each prompt is a sentence with an expression underlined with [[ ]]. Options are four sentences or expressions; the correct one has the closest meaning.
JSON: {"questions": [${Q}]}`;
    case 'usage':
      return `問題 用法: ${questions}. Each prompt is just the tested word (with its reading). Options are four sentences using that word; only one uses it correctly and naturally.
JSON: {"questions": [${Q}]}`;
    case 'grammar-form':
      return `問題 文の文法1（文法形式の判断）: ${questions}. Each prompt is a sentence (or a short two-person exchange written as 「A：…」「B：…」 on one line) with a grammar point missing, shown as （\u3000）.
Options are four grammar forms; one is correct. Test grammar typical of the level.
JSON: {"questions": [${Q}]}`;
    case 'sentence-order':
      return `問題 文の文法2（文の組み立て）: ${questions}. Each prompt is a sentence with four blanks written "＿＿＿" in a row, one of which is "＿★＿", e.g.
"きのう\u3000＿＿＿\u3000＿＿＿\u3000＿★＿\u3000＿＿＿\u3000です。". The four options are the four pieces that fill the blanks; arranged correctly they make one natural sentence.
answerIndex is the option that goes in the ★ blank. Use exactly one ★ per prompt.
JSON: {"questions": [${Q}]}`;
    case 'text-grammar':
      return `問題 文章の文法: write one passage (a letter, diary or essay of about ${LENGTH.mid[level]} characters) with ${size} blanks marked （1）, （2）... in order.
Then ${questions}: question n has the prompt "（n）" and four options for that blank (words, grammar or sentence connectors); one fits the flow of the text.
JSON: {"passages": [${PASSAGE}], "questions": [${Q}]}`;
    case 'reading-short':
      return reading(LENGTH.short[level], 'one short text (a note, email, notice or explanation)');
    case 'reading-mid':
      return reading(LENGTH.mid[level], 'one text (an essay, explanation or letter)');
    case 'reading-long':
      return reading(LENGTH.long[level], 'one long text (an essay, commentary or story)');
    case 'reading-thematic':
      return reading(LENGTH.thematic[level], 'one argumentative text (an editorial or opinion essay) with a clear claim');
    case 'reading-integrated':
      return `問題 統合理解: write two short texts, A and B, about the same question with different views (about ${LENGTH.integrated[level]} characters together) as
"passages": [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}], then ${questions} that compare them (e.g. what both say, how A and B differ).
JSON: {"passages": [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}], "questions": [${Q}]}`;
    case 'info-search':
      return `問題 情報検索: write one information sheet of about ${LENGTH.info[level]} characters (a notice, schedule, price list or course guide) as plain text with line breaks;
lists or tables are written as lines like "・コースA\u3000月曜日{げつようび}\u300010時{じ}～\u30001,000円{えん}". Then ${questions} where the reader must find and combine details for a person's situation.
JSON: {"passages": [${PASSAGE}], "questions": [${Q}]}`;
    case 'listen-task':
      return `問題 課題理解: ${size} items. Each item is a short conversation (6-10 turns) where someone must decide what to do; "question" asks what the person will do first or next
(e.g. 女{おんな}の人{ひと}はこのあと何{なに}をしますか。). Four options printed in the test book; all four are mentioned or implied, one is right.
JSON: {${SPEAKERS}, "items": [${LISTEN_ITEM}]}`;
    case 'listen-point':
      return `問題 ポイント理解: ${size} items. Each item is a conversation or short talk (6-10 turns); "question" asks for a reason, feeling or specific point
(e.g. 男{おとこ}の人{ひと}はどうして遅{おく}れましたか。). Four printed options; the distractors appear in the talk too.
JSON: {${SPEAKERS}, "items": [${LISTEN_ITEM}]}`;
    case 'listen-summary':
      return `問題 概要理解: ${size} items. Each item is a monologue or conversation (6-10 lines); "question" asks for the speaker's main point or what the talk is about.
The four options are spoken, not printed.
JSON: {${SPEAKERS}, "items": [${LISTEN_ITEM}]}`;
    case 'listen-expression':
      return `問題 発話表現: ${size} items. Instead of a picture, "situation" describes the scene in one Japanese sentence (who, where, what is happening, e.g. 友{とも}だちの家{いえ}に来{き}ました。);
"question" is "何{なん}と言{い}いますか。" or similar; "script" is an empty list. Three spoken options; one is what the person should say.
JSON: {${SPEAKERS}, "items": [{"situation": "...", "script": [], "question": "...", "options": ["...", "...", "..."], "answerIndex": 0, "explanation": {"vi": "...", "en": "..."}}]}`;
    case 'listen-response':
      return `問題 即時応答: ${size} items. Each item is ONE short line by speaker A (a question, request or remark) in "script"; no "question".
Three spoken responses by B as options; one is the natural reply, the others are plausible but wrong (wrong politeness, answer to a different question, same words used wrongly).
JSON: {${SPEAKERS}, "items": [{"script": [{"speaker": "A", "text": "..."}], "options": ["...", "...", "..."], "answerIndex": 0, "explanation": {"vi": "...", "en": "..."}}]}`;
    case 'listen-integrated':
      return `問題 統合理解: ${size} items. Each item is a longer conversation (10-16 turns) comparing several options (plans, products, courses) and choosing one;
"question" asks which one a person chooses. Four printed options.
JSON: {${SPEAKERS}, "items": [${LISTEN_ITEM}]}`;
  }
}

/**
 * System and user prompts for one group
 */
function buildPrompt(mondai: Mondai, level: JlptLevel, topic: string, size: number) {
  const system = `You write original JLPT ${level} mock-test questions for Vietnamese learners. ${JLPT_GUIDE[level]}
${JA_RULES}
Test rules:
- Match the official JLPT ${level} style and difficulty; every question has exactly one correct option; distractors are plausible but clearly wrong to a careful reader.
- Spread the correct answers over different positions.
- Prompts, options and texts are in Japanese (readings in braces as above); explanations in Vietnamese and English.
- Listening scripts are natural spoken Japanese read by text-to-speech: no stage directions, no speaker names inside the lines.`;
  return { system, user: `Topic or setting: ${topic}\n${mondaiTask(mondai, level, size)}` };
}

const LETTERS = ['1', '2', '3', '4'];

/**
 * The group as a test-taker meets it, without the key or readings
 */
function describeForSolver(mondai: Mondai, group: JlptQuestionGroup | JlptListeningGroup): { context: string; questions: string[] } {
  if ('items' in group) {
    return {
      context: 'Listening test. Each item gives the transcript of what is heard.',
      questions: group.items.map((item) =>
        [
          item.situation && `Situation: ${withoutReadings(item.situation)}`,
          ...item.script.map((line) => `${line.speaker}: ${withoutReadings(line.text)}`),
          item.question && `Question: ${withoutReadings(item.question)}`,
          ...item.options.map((o, i) => `${LETTERS[i]}. ${withoutReadings(o)}`),
        ]
          .filter(Boolean)
          .join('\n')
      ),
    };
  }
  const texts = (group.passages ?? []).map((p) => `${p.label ? `[${p.label}] ` : ''}${p.title ? `${withoutReadings(p.title)}\n` : ''}${withoutReadings(p.text)}`);
  return {
    context: [`JLPT ${MONDAI_SECTION[mondai]} questions (${mondai}). [[ ]] marks an underlined word; （\u3000） is a blank; ★ is the asked blank.`, ...texts].join('\n\n'),
    questions: group.questions.map((q) => `${withoutReadings(q.prompt)}\n${q.options.map((o, i) => `${LETTERS[i]}. ${withoutReadings(o)}`).join('\n')}`),
  };
}

/**
 * Solves the group without the key
 * @returns Question numbers (1-based) where the solver disagreed
 */
async function verifyKey(user: User, mondai: Mondai, group: JlptQuestionGroup | JlptListeningGroup, feature: string, model?: string): Promise<number[]> {
  const { context, questions } = describeForSolver(mondai, group);
  const key = 'items' in group ? group.items.map((i) => i.answerIndex) : group.questions.map((q) => q.answerIndex);
  const solved = await runAIJson(
    user,
    {
      feature,
      model,
      timeoutMs: GENERATE_TIMEOUT_MS,
      system: `You are an expert JLPT test-taker. Answer each question with the single best option.
If two options are equally acceptable or none is correct, answer -1 for that question. Respond with ONLY one JSON object.`,
      messages: [
        {
          role: 'user',
          content: `${context}\n\nQuestions:\n${questions.map((q, i) => `(${i + 1})\n${q}`).join('\n\n')}\n\nJSON: {"answers": [0-based option index or -1 for each question, in order]}`,
        },
      ],
    },
    z.object({ answers: z.array(z.number().int().min(-1).max(3)).length(key.length) })
  );
  return key.flatMap((answer, i) => (solved.answers[i] === answer ? [] : [i + 1]));
}

const MAX_ROUNDS = 2;
const FILL_CONCURRENCY = 3;

/**
 * Generates, checks and stores one group
 * @throws HttpError 502 if no generated group passes the answer check
 */
export async function generateJlptGroup(user: User, level: JlptLevel, mondai: Mondai, feature: string, model?: string): Promise<ContentItem> {
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const size = groupSize(mondai, level);
  const prompt = buildPrompt(mondai, level, topic, size);

  let payload: JlptQuestionGroup | JlptListeningGroup | null = null;
  for (let round = 1; round <= MAX_ROUNDS && payload === null; round++) {
    const candidate = (await runAIJson(
      user,
      { feature, system: prompt.system, messages: [{ role: 'user', content: prompt.user }], timeoutMs: GENERATE_TIMEOUT_MS, model },
      jlptGroupSchema(mondai, level, size)
    )) as JlptQuestionGroup | JlptListeningGroup;
    const disagreements = await verifyKey(user, mondai, candidate, feature, model);
    if (disagreements.length === 0) payload = candidate;
    else console.warn(`JLPT ${level} ${mondai} group rejected (round ${round}): solver disagreed on ${disagreements.join(', ')}`);
  }
  if (payload === null) throw new HttpError(502, 'Generated questions failed the answer check. Please try again.', 'ai_invalid_output');

  const [item] = await db
    .insert(contentItems)
    .values({
      kind: kindOf(mondai),
      skill: MONDAI_SECTION[mondai] === 'listening' ? 'listening' : 'reading',
      exam: 'jlpt',
      language: 'ja',
      part: partTag(mondai),
      level,
      title: `JLPT ${level} · ${mondai}`,
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
 * @returns Groups created and the number that failed
 */
export async function generateJlptGroups(
  user: User,
  level: JlptLevel,
  requests: { mondai: Mondai; count: number }[],
  feature: string,
  model?: string
): Promise<{ created: ContentItem[]; failed: number }> {
  const queue = requests.flatMap((r) => Array<Mondai>(r.count).fill(r.mondai));
  const created: ContentItem[] = [];
  let failed = 0;

  const worker = async () => {
    for (let mondai = queue.shift(); mondai !== undefined; mondai = queue.shift()) {
      try {
        created.push(await generateJlptGroup(user, level, mondai, feature, model));
      } catch (error) {
        failed++;
        console.error(`Failed to generate JLPT ${level} ${mondai} group:`, error instanceof Error ? error.message : error);
        // Quota or model errors will fail every remaining request too
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
