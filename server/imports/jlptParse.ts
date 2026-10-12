/**
 * AI parsing of an imported JLPT test
 * Same steps as TOEIC (OCR, questions chunk by chunk, answer key, listening scripts), with prompts
 * that know the level's papers and 問題 so every question is tagged with its type.
 */
import { z } from 'zod';
import type { User } from '../db/schema.js';
import type { JlptLevel } from '../content/schemas.js';
import { runAIJson } from '../services/ai.js';
import { MONDAI, MONDAI_JA, papersOf } from '../exams/jlpt.js';
import { chunkPages, joinPages, ocrPages, pagesIn, PAGES_PER_CHUNK, PARSE_TIMEOUT_MS, type ImportRanges, type Progress } from './parse.js';
import type { ExtractedPage } from './extract.js';

const mondaiId = z.enum(MONDAI);

/* ---------- Lenient shapes returned by the AI (tightened in jlptDraft.ts) ---------- */

export const rawJlptGroup = z
  .object({
    mondai: mondaiId,
    /** First and last question; models also send one number, a longer list or nothing */
    numbers: z.union([z.number().int(), z.array(z.number().int())]).optional(),
    /** Models sometimes send the texts as plain strings */
    passages: z
      .array(z.union([z.string().transform((text) => ({ text })), z.object({ label: z.string().optional(), title: z.string().optional(), text: z.string().default('') })]))
      .optional(),
    questions: z
      .array(z.object({ number: z.number().int().min(1).max(99), prompt: z.string().default(''), options: z.array(z.string()).default([]) }))
      .default([]),
    /** Page with each question's picture (listening pictures, printed tables) */
    picturePages: z.array(z.object({ number: z.number().int(), page: z.number().int() })).optional(),
  })
  .transform((group) => {
    const listed = [...(Array.isArray(group.numbers) ? group.numbers : group.numbers !== undefined ? [group.numbers] : []), ...group.questions.map((q) => q.number)];
    const numbers: [number, number] = listed.length ? [Math.min(...listed), Math.max(...listed)] : [0, 0];
    return { ...group, numbers };
  });
export type RawJlptGroup = z.infer<typeof rawJlptGroup>;

export const rawJlptTranscript = z.object({
  mondai: mondaiId,
  number: z.number().int().min(1).max(99),
  /** Speaker as printed: 男, 女, 店員, F, M... */
  lines: z.array(z.object({ speaker: z.string().default('女'), text: z.string() })).default([]),
  question: z.string().optional(),
  /** Choices that are only spoken (概要理解, 発話表現, 即時応答) */
  options: z.array(z.string()).optional(),
});
export type RawJlptTranscript = z.infer<typeof rawJlptTranscript>;

const answerEntry = z.object({ mondai: mondaiId, number: z.number().int(), answer: z.coerce.number().int().min(1).max(4) });

export interface ParsedJlptTest {
  groups: RawJlptGroup[];
  answers: z.infer<typeof answerEntry>[];
  transcripts: RawJlptTranscript[];
}

/**
 * How the level's 問題 map to question type ids, for every prompt
 */
function structureGuide(level: JlptLevel): string {
  return papersOf(level)
    .map(({ paper, mondai }) => `${paper}: ${mondai.map((m, i) => `問題${i + 1} = "${m}" (${MONDAI_JA[m]})`).join(', ')}`)
    .join('\n');
}

const OCR_SYSTEM = `You transcribe scanned Japanese test pages (JLPT). Output only the page text, keeping 問題 headings, question numbers,
options 1-4 and line breaks. Leave out furigana printed above kanji. Wrap underlined words in [[ ]]. Mark pictures as [PICTURE].`;

const questionRules = (level: JlptLevel) => `You extract JLPT ${level} questions from book pages into JSON. Do NOT answer them.
The book's papers and 問題 (use these ids for "mondai"):
${structureGuide(level)}
Rules:
- Use the book's question numbers. Leave out furigana (small readings printed next to kanji) and page headers, examples (れい) and directions.
- Underlined words: wrap them in [[ ]]. If the text does not show the underline, infer the tested word (漢字読み/表記: the word the options spell).
- Blanks: write （\u3000）; sentence ordering: write each blank as ＿＿＿ and the starred one as ＿★＿.
- Vocabulary and grammar: one group per 問題 with all its questions.
- Reading: one group per text with "passages" (copy the full text; 統合理解: two passages labelled A and B) and the questions about it.
  文章の文法: the passage with its numbered blanks written （1）（2）... and each question's prompt "（1）".
- Listening (聴解): one group per 問題 with "questions" = [{"number", "prompt": "", "options": printed options or []}].
  If a question shows pictures, add {"number", "page"} to "picturePages" and use "1","2","3","4" as options when they are pictures.
- Options are the text after 1, 2, 3, 4 without the numbers. Copy text exactly; fix only obvious OCR errors.
- Include a group only if you can see its questions on these pages.
Respond with ONLY: {"groups": [{"mondai": "kanji-reading", "numbers": [1, 8], "questions": [{"number": 1, "prompt": "...[[...]]...", "options": ["...","...","...","..."]}]}]}`;

/**
 * Extracts question groups chunk by chunk
 */
async function extractGroups(user: User, level: JlptLevel, pages: ExtractedPage[], onProgress: Progress): Promise<RawJlptGroup[]> {
  const chunks = chunkPages(pages);
  const groups: RawJlptGroup[] = [];
  for (let i = 0; i < chunks.length; i++) {
    await onProgress('questions', i, chunks.length);
    const reply = await runAIJson(
      user,
      { feature: 'import-parse', timeoutMs: PARSE_TIMEOUT_MS, system: questionRules(level), messages: [{ role: 'user', content: joinPages(chunks[i]) }] },
      z.object({ groups: z.array(rawJlptGroup).default([]) })
    );
    groups.push(...reply.groups);
  }
  await onProgress('questions', chunks.length, chunks.length);
  return groups;
}

/**
 * Reads the answer key (正答表 / 解答) per 問題
 */
async function extractAnswers(user: User, level: JlptLevel, pages: ExtractedPage[]): Promise<ParsedJlptTest['answers']> {
  if (pages.length === 0) return [];
  const reply = await runAIJson(
    user,
    {
      feature: 'import-parse',
      timeoutMs: PARSE_TIMEOUT_MS,
      system: `You read JLPT ${level} answer keys (正答表, 解答). The papers and 問題:
${structureGuide(level)}
Return every question with its 問題 id, its number and the answer (1-4). Skip examples (れい). If the pages hold several tests, use only the first.
Respond with ONLY: {"answers": [{"mondai": "kanji-reading", "number": 1, "answer": 3}]}`,
      messages: [{ role: 'user', content: joinPages(pages) }],
    },
    z.object({ answers: z.array(answerEntry).default([]) })
  );
  return reply.answers;
}

/**
 * Reads listening scripts (スクリプト)
 */
async function extractTranscripts(user: User, level: JlptLevel, pages: ExtractedPage[], onProgress: Progress): Promise<RawJlptTranscript[]> {
  const entries: RawJlptTranscript[] = [];
  for (let start = 0; start < pages.length; start += PAGES_PER_CHUNK) {
    await onProgress('transcripts', start, pages.length);
    const reply = await runAIJson(
      user,
      {
        feature: 'import-parse',
        timeoutMs: PARSE_TIMEOUT_MS,
        system: `You extract JLPT ${level} listening scripts (聴解スクリプト) into JSON. Listening 問題: ${papersOf(level).at(-1)!.mondai.map((m, i) => `問題${i + 1} = "${m}"`).join(', ')}.
One entry per question (1番, 2番...; skip れい): "lines" = the conversation as [{"speaker": "男" | "女" | the printed label, "text": "..."}],
"question" = the question the narrator asks, and "options" = the spoken choices when they are read aloud (概要理解, 発話表現, 即時応答).
Leave out furigana. Respond with ONLY: {"entries": [{"mondai": "listen-task", "number": 1, "lines": [...], "question": "...", "options": ["..."]}]}`,
        messages: [{ role: 'user', content: joinPages(pages.slice(start, start + PAGES_PER_CHUNK)) }],
      },
      z.object({ entries: z.array(rawJlptTranscript).default([]) })
    );
    entries.push(...reply.entries);
  }
  await onProgress('transcripts', pages.length, pages.length);
  return entries;
}

/**
 * Runs all AI steps over the marked page ranges
 */
export async function parseJlptTest(
  user: User,
  level: JlptLevel,
  allPages: ExtractedPage[],
  ranges: ImportRanges,
  onProgress: Progress
): Promise<{ pages: ExtractedPage[]; parsed: ParsedJlptTest }> {
  const pages = await ocrPages(user, allPages, onProgress, OCR_SYSTEM);
  const groups = await extractGroups(user, level, pagesIn(pages, ranges.questions), onProgress);
  await onProgress('answers', 0, 1);
  const answers = ranges.answers ? await extractAnswers(user, level, pagesIn(pages, ranges.answers)) : [];
  const transcripts = ranges.transcripts ? await extractTranscripts(user, level, pagesIn(pages, ranges.transcripts), onProgress) : [];
  return { pages, parsed: { groups, answers, transcripts } };
}
