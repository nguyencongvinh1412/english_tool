/**
 * JLPT Exam Engine
 * Test structure per level (N5-N1), group schemas, blueprint assembly from the content bank,
 * answer hiding, and scoring with estimated scaled scores and the pass/fail rules.
 *
 * The 大問 (question types) and times follow the official test guide (jlpt.jp, revised 2020).
 * The JLPT does not publish fixed question counts, so the counts below are typical numbers.
 */
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { contentItems, examSessions, type ContentItem, type ExamSession } from '../db/schema.js';
import { audioSegment, bilingual, jaText, speaker, type JlptLevel } from '../content/schemas.js';

export const MONDAI = [
  'kanji-reading',
  'orthography',
  'word-formation',
  'context',
  'paraphrase',
  'usage',
  'grammar-form',
  'sentence-order',
  'text-grammar',
  'reading-short',
  'reading-mid',
  'reading-long',
  'reading-integrated',
  'reading-thematic',
  'info-search',
  'listen-task',
  'listen-point',
  'listen-summary',
  'listen-expression',
  'listen-response',
  'listen-integrated',
] as const;
export type Mondai = (typeof MONDAI)[number];

export const JLPT_SECTIONS = ['vocab', 'grammar', 'reading', 'listening'] as const;
export type JlptSection = (typeof JLPT_SECTIONS)[number];
export type JlptMode = 'mini' | 'part' | 'full' | 'official';

export const MONDAI_SECTION: Record<Mondai, JlptSection> = {
  'kanji-reading': 'vocab',
  orthography: 'vocab',
  'word-formation': 'vocab',
  context: 'vocab',
  paraphrase: 'vocab',
  usage: 'vocab',
  'grammar-form': 'grammar',
  'sentence-order': 'grammar',
  'text-grammar': 'grammar',
  'reading-short': 'reading',
  'reading-mid': 'reading',
  'reading-long': 'reading',
  'reading-integrated': 'reading',
  'reading-thematic': 'reading',
  'info-search': 'reading',
  'listen-task': 'listening',
  'listen-point': 'listening',
  'listen-summary': 'listening',
  'listen-expression': 'listening',
  'listen-response': 'listening',
  'listen-integrated': 'listening',
};

/** Headings as printed in the test book */
export const MONDAI_JA: Record<Mondai, string> = {
  'kanji-reading': '漢字読み',
  orthography: '表記',
  'word-formation': '語形成',
  context: '文脈規定',
  paraphrase: '言い換え類義',
  usage: '用法',
  'grammar-form': '文の文法1（文法形式の判断）',
  'sentence-order': '文の文法2（文の組み立て）',
  'text-grammar': '文章の文法',
  'reading-short': '内容理解（短文）',
  'reading-mid': '内容理解（中文）',
  'reading-long': '内容理解（長文）',
  'reading-integrated': '統合理解',
  'reading-thematic': '主張理解（長文）',
  'info-search': '情報検索',
  'listen-task': '課題理解',
  'listen-point': 'ポイント理解',
  'listen-summary': '概要理解',
  'listen-expression': '発話表現',
  'listen-response': '即時応答',
  'listen-integrated': '統合理解（聴解）',
};

/**
 * Test papers of a level with their 大問 in order, as numbered in the book (問題1, 問題2...)
 */
export function papersOf(level: JlptLevel): { paper: string; mondai: Mondai[] }[] {
  const of = (sections: JlptSection[]) => MONDAI.filter((m) => MONDAI_COUNTS[level][m] && sections.includes(MONDAI_SECTION[m]));
  const listening = { paper: '聴解', mondai: of(['listening']) };
  if (level === 'N1' || level === 'N2') return [{ paper: '言語知識（文字・語彙・文法）・読解', mondai: of(['vocab', 'grammar', 'reading']) }, listening];
  return [
    { paper: '言語知識（文字・語彙）', mondai: of(['vocab']) },
    { paper: '言語知識（文法）・読解', mondai: of(['grammar', 'reading']) },
    listening,
  ];
}

/** Typical questions per 大問 in one test, in test order */
export const MONDAI_COUNTS: Record<JlptLevel, Partial<Record<Mondai, number>>> = {
  N5: {
    'kanji-reading': 7,
    orthography: 5,
    context: 6,
    paraphrase: 3,
    'grammar-form': 9,
    'sentence-order': 4,
    'text-grammar': 4,
    'reading-short': 2,
    'reading-mid': 2,
    'info-search': 1,
    'listen-task': 7,
    'listen-point': 6,
    'listen-expression': 5,
    'listen-response': 6,
  },
  N4: {
    'kanji-reading': 7,
    orthography: 5,
    context: 8,
    paraphrase: 4,
    usage: 4,
    'grammar-form': 13,
    'sentence-order': 4,
    'text-grammar': 4,
    'reading-short': 3,
    'reading-mid': 3,
    'info-search': 2,
    'listen-task': 8,
    'listen-point': 7,
    'listen-expression': 5,
    'listen-response': 8,
  },
  N3: {
    'kanji-reading': 8,
    orthography: 6,
    context: 11,
    paraphrase: 5,
    usage: 5,
    'grammar-form': 13,
    'sentence-order': 5,
    'text-grammar': 5,
    'reading-short': 4,
    'reading-mid': 6,
    'reading-long': 4,
    'info-search': 2,
    'listen-task': 6,
    'listen-point': 6,
    'listen-summary': 3,
    'listen-expression': 4,
    'listen-response': 9,
  },
  N2: {
    'kanji-reading': 5,
    orthography: 5,
    'word-formation': 3,
    context: 7,
    paraphrase: 5,
    usage: 5,
    'grammar-form': 12,
    'sentence-order': 5,
    'text-grammar': 5,
    'reading-short': 5,
    'reading-mid': 9,
    'reading-integrated': 2,
    'reading-thematic': 3,
    'info-search': 2,
    'listen-task': 5,
    'listen-point': 6,
    'listen-summary': 5,
    'listen-response': 12,
    'listen-integrated': 4,
  },
  N1: {
    'kanji-reading': 6,
    context: 7,
    paraphrase: 6,
    usage: 6,
    'grammar-form': 10,
    'sentence-order': 5,
    'text-grammar': 4,
    'reading-short': 4,
    'reading-mid': 9,
    'reading-long': 4,
    'reading-integrated': 2,
    'reading-thematic': 4,
    'info-search': 2,
    'listen-task': 5,
    'listen-point': 6,
    'listen-summary': 5,
    'listen-response': 11,
    'listen-integrated': 3,
  },
};

/** Minutes for the whole test (jlpt.jp) */
export const FULL_MINUTES: Record<JlptLevel, number> = { N5: 90, N4: 115, N3: 140, N2: 155, N1: 165 };

/** Minutes when one section is practised on its own (the official blocks split by question share) */
export const SECTION_MINUTES: Record<JlptLevel, Record<JlptSection, number>> = {
  N5: { vocab: 20, grammar: 20, reading: 20, listening: 30 },
  N4: { vocab: 25, grammar: 25, reading: 30, listening: 35 },
  N3: { vocab: 30, grammar: 30, reading: 40, listening: 40 },
  N2: { vocab: 35, grammar: 30, reading: 40, listening: 50 },
  N1: { vocab: 35, grammar: 30, reading: 45, listening: 55 },
};

export const MINI_MINUTES = 25;
/** One group of each, so a mini test touches every section */
const MINI_MONDAI: Mondai[] = ['kanji-reading', 'grammar-form', 'reading-mid', 'listen-task'];

/** Seconds after the deadline during which answers are still accepted */
export const DEADLINE_GRACE_SEC = 120;

/**
 * Questions (or listening items) in one generated group
 */
export function groupSize(mondai: Mondai, level: JlptLevel): number {
  const count = MONDAI_COUNTS[level][mondai] ?? 0;
  switch (mondai) {
    case 'sentence-order':
      return 4;
    case 'text-grammar':
    case 'reading-long':
    case 'reading-integrated':
    case 'reading-thematic':
    case 'info-search':
      return Math.max(1, count);
    case 'reading-short':
      return 1;
    case 'reading-mid':
      return level === 'N5' ? 2 : 3;
    case 'listen-task':
    case 'listen-point':
    case 'listen-summary':
    case 'listen-expression':
      return 3;
    case 'listen-response':
      return 6;
    case 'listen-integrated':
      return 2;
    default:
      return 5;
  }
}

/* ---------- Scoring rules ---------- */

/** Scored sections: N4-N5 report language knowledge and reading together */
export type ScoreSection = 'language' | 'reading' | 'listening' | 'language-reading';

export const PASS_MARK: Record<JlptLevel, number> = { N1: 100, N2: 90, N3: 95, N4: 90, N5: 80 };

const combinedLanguage = (level: JlptLevel) => level === 'N4' || level === 'N5';

export function scoreSectionOf(level: JlptLevel, section: JlptSection): ScoreSection {
  if (section === 'listening') return 'listening';
  if (combinedLanguage(level)) return 'language-reading';
  return section === 'reading' ? 'reading' : 'language';
}

/** Scaled maximum and the sectional pass mark (基準点) */
const SCORE_RANGE: Record<ScoreSection, { max: number; minimum: number }> = {
  language: { max: 60, minimum: 19 },
  reading: { max: 60, minimum: 19 },
  listening: { max: 60, minimum: 19 },
  'language-reading': { max: 120, minimum: 38 },
};

/** Scored sections of a level in report order */
export function scoreSections(level: JlptLevel): ScoreSection[] {
  return combinedLanguage(level) ? ['language-reading', 'listening'] : ['language', 'reading', 'listening'];
}

/* ---------- Group schemas ---------- */

/** A blank to fill: full-width brackets around an ideographic space, also written with half-width or plain spaces */
const BLANK = /[（(][\s\u3000]*[）)]/;
/** Text with an underlined target: [[...]] */
const UNDERLINE = /\[\[(.+?)\]\]/;
/** Kana reading of furigana markup: 学校{がっこう} -> がっこう */
const readingOf = (value: string) => value.replace(/[㐀-䶿一-鿿豈-﫿々〆ヵヶ]+\{([^}]+)\}/g, '$1').replace(/\s/g, '');
/** Text without readings: 学校{がっこう} -> 学校 */
export const withoutReadings = (value: string) => value.replace(/\{[^}]*\}/g, '');

const question = z.object({
  prompt: jaText(1200),
  options: z.array(jaText(400)).min(3).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: bilingual(500),
});

const passage = z.object({ label: z.string().trim().max(20).optional(), title: jaText(100).optional(), text: jaText(4000) });

const listeningItem = z.object({
  /** Said before the recording (発話表現: the picture's situation) */
  situation: jaText(400).optional(),
  script: z.array(z.object({ speaker: z.enum(['A', 'B']), text: jaText(500) })).max(30),
  question: jaText(400).optional(),
  options: z.array(jaText(300)).min(3).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: bilingual(500),
});

export const jlptQuestionGroup = z.object({
  passages: z.array(passage).max(2).optional(),
  questions: z.array(question).min(1).max(10),
});

export const jlptListeningGroup = z.object({
  speakers: z.object({ A: speaker, B: speaker.optional() }),
  items: z.array(listeningItem).min(1).max(8),
});

/* ---------- Imported groups ---------- */

/** Book text: furigana optional (printed readings are dropped when extracting) */
const plain = (max: number) => z.string().trim().min(1).max(max);
const imageId = z.uuid().optional();

const importQuestion = z.object({
  prompt: z.string().trim().max(1200).default(''),
  options: z.array(plain(400)).min(3).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: bilingual(500),
  /** A printed picture or table for this question */
  imageAssetId: imageId,
});

const importPassage = z
  .object({
    label: z.string().trim().max(20).optional(),
    title: z.string().trim().max(200).optional(),
    text: z.string().trim().max(8000).default(''),
    /** Notices, tables and timetables are often kept as a picture */
    imageAssetId: imageId,
  })
  .refine((p) => p.text || p.imageAssetId, { message: 'add the text or crop it as a picture', path: ['text'] });

const importItem = z.object({
  situation: plain(400).optional(),
  script: z.array(z.object({ speaker: z.enum(['A', 'B']), text: plain(800) })).max(40).default([]),
  question: plain(400).optional(),
  /** With a picture the options may just be "1"-"4" */
  options: z.array(plain(300)).min(3).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: bilingual(500),
  imageAssetId: imageId,
});

/**
 * Schema for a group imported from a book: any number of questions, pictures allowed,
 * and a real recording in place of a transcript
 */
export function jlptImportSchema(mondai: Mondai): z.ZodType {
  const options = optionCount(mondai);
  if (isListening(mondai)) {
    return z
      .object({ speakers: z.object({ A: speaker, B: speaker.optional() }), audio: audioSegment.optional(), items: z.array(importItem).min(1).max(20) })
      .superRefine((group, ctx) => {
        group.items.forEach((item, i) => {
          const at = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['items', i] });
          if (item.options.length !== options) at(`each item needs exactly ${options} options`);
          if (item.answerIndex >= item.options.length) at('answerIndex is out of range');
          if (!group.audio && item.script.length === 0 && !item.situation) at('add the transcript or attach the recording');
        });
      });
  }
  return z
    .object({ passages: z.array(importPassage).max(3).optional(), questions: z.array(importQuestion).min(1).max(40) })
    .superRefine((group, ctx) => {
      if ((MONDAI_SECTION[mondai] === 'reading' || mondai === 'text-grammar') && !group.passages?.length) {
        ctx.addIssue({ code: 'custom', message: 'the reading text is missing', path: ['passages'] });
      }
      group.questions.forEach((q, i) => {
        const at = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['questions', i] });
        if (q.options.length !== options) at(`each question needs exactly ${options} options`);
        if (q.answerIndex >= q.options.length) at('answerIndex is out of range');
        if (!q.prompt && !q.imageAssetId && MONDAI_SECTION[mondai] !== 'reading' && mondai !== 'text-grammar') at('the question text is missing');
        if (['kanji-reading', 'orthography', 'paraphrase'].includes(mondai) && !UNDERLINE.test(q.prompt)) at('mark the underlined word with [[ ]]');
      });
    });
}

export type JlptQuestionGroup = z.infer<typeof jlptQuestionGroup>;
export type JlptListeningGroup = z.infer<typeof jlptListeningGroup>;

const isListening = (mondai: Mondai) => MONDAI_SECTION[mondai] === 'listening';

/** Options per question: spoken choices in 発話表現 and 即時応答 are three */
const optionCount = (mondai: Mondai) => (mondai === 'listen-expression' || mondai === 'listen-response' ? 3 : 4);

/**
 * Schema for one generated group of a 大問, with the checks the app can make on its own
 */
export function jlptGroupSchema(mondai: Mondai, level: JlptLevel, size = groupSize(mondai, level)): z.ZodType {
  const options = optionCount(mondai);

  if (isListening(mondai)) {
    return jlptListeningGroup.superRefine((group, ctx) => {
      if (group.items.length !== size) ctx.addIssue({ code: 'custom', message: `items must contain exactly ${size} entries`, path: ['items'] });
      group.items.forEach((item, i) => {
        const at = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['items', i] });
        if (item.options.length !== options) at(`each item needs exactly ${options} options`);
        if (item.answerIndex >= item.options.length) at('answerIndex is out of range');
        if (mondai === 'listen-response' && (item.script.length !== 1 || item.script[0].speaker !== 'A')) at('a quick-response item has one line by speaker A');
        if (mondai === 'listen-expression' && (!item.situation || !item.question || item.script.length > 0)) at('an expression item has a situation and a question and no script');
        if (!['listen-response', 'listen-expression'].includes(mondai) && (item.script.length < 2 || !item.question)) at('the item needs a script and a question');
      });
    });
  }

  return jlptQuestionGroup.superRefine((group, ctx) => {
    if (group.questions.length !== size) ctx.addIssue({ code: 'custom', message: `questions must contain exactly ${size} entries`, path: ['questions'] });
    const needsPassage = MONDAI_SECTION[mondai] === 'reading' || mondai === 'text-grammar';
    const passages = group.passages ?? [];
    if (needsPassage && passages.length !== (mondai === 'reading-integrated' ? 2 : 1)) {
      ctx.addIssue({ code: 'custom', message: mondai === 'reading-integrated' ? 'give exactly two passages (A and B)' : 'give exactly one passage', path: ['passages'] });
    }
    group.questions.forEach((q, i) => {
      const at = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['questions', i] });
      if (q.options.length !== options) at(`each question needs exactly ${options} options`);
      if (q.answerIndex >= q.options.length) at('answerIndex is out of range');

      const target = UNDERLINE.exec(q.prompt)?.[1];
      if (['kanji-reading', 'orthography', 'paraphrase'].includes(mondai) && !target) at('underline the tested word with [[ ]]');
      if (mondai === 'kanji-reading' && target && readingOf(target) !== readingOf(q.options[q.answerIndex] ?? '')) {
        at('the correct option must be the reading of the underlined word');
      }
      if (mondai === 'orthography' && target && readingOf(q.options[q.answerIndex] ?? '') !== readingOf(target)) {
        at('the correct option must be the underlined word written in kanji');
      }
      if (['context', 'grammar-form', 'word-formation'].includes(mondai) && !BLANK.test(q.prompt)) at('mark the blank with （　）');
      if (mondai === 'sentence-order' && (q.prompt.match(/★/g) ?? []).length !== 1) at('mark the asked position with one ★');
      if (mondai === 'text-grammar' && !passages[0]?.text.includes(`（${i + 1}）`)) at(`the passage needs the blank （${i + 1}）`);
    });
  });
}

/* ---------- Blueprint ---------- */

export interface JlptBlueprint {
  exam: 'jlpt';
  level: JlptLevel;
  /** groupIds keeps the shape other exams use; takes[i] is how many questions of group i are used */
  sections: { mondai: Mondai; groupIds: string[]; takes: number[] }[];
  /** Set for tests imported from a book */
  importId?: string;
}

/**
 * 大問 of a level for a mode, with the questions wanted from each
 */
export function mondaiFor(level: JlptLevel, mode: JlptMode, section?: JlptSection): { mondai: Mondai; questions: number }[] {
  const all = MONDAI.filter((m) => MONDAI_COUNTS[level][m]);
  if (mode === 'mini') return MINI_MONDAI.filter((m) => MONDAI_COUNTS[level][m]).map((m) => ({ mondai: m, questions: groupSize(m, level) }));
  return all.filter((m) => mode === 'full' || MONDAI_SECTION[m] === section).map((m) => ({ mondai: m, questions: MONDAI_COUNTS[level][m]! }));
}

/** Time limit in seconds */
export function jlptTimeLimit(level: JlptLevel, mode: JlptMode, section?: JlptSection): number {
  if (mode === 'full') return FULL_MINUTES[level] * 60;
  if (mode === 'part' && section) return SECTION_MINUTES[level][section] * 60;
  return MINI_MINUTES * 60;
}

/** Bank part tag of a 大問 */
export const partTag = (mondai: Mondai) => `jlpt-${mondai}`;
export const kindOf = (mondai: Mondai) => (isListening(mondai) ? 'jlpt-listening' : 'jlpt-group');

/**
 * Published bank groups per level and 大問
 */
export async function jlptBankCounts(): Promise<Record<JlptLevel, Partial<Record<Mondai, number>>>> {
  const rows = await db
    .select({ level: contentItems.level, part: contentItems.part, count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(and(eq(contentItems.exam, 'jlpt'), eq(contentItems.status, 'published'), ne(contentItems.source, 'imported')))
    .groupBy(contentItems.level, contentItems.part);

  const counts: Record<string, Partial<Record<Mondai, number>>> = { N5: {}, N4: {}, N3: {}, N2: {}, N1: {} };
  for (const row of rows) {
    if (row.level && row.part && counts[row.level]) counts[row.level][row.part.replace('jlpt-', '') as Mondai] = row.count;
  }
  return counts as Record<JlptLevel, Partial<Record<Mondai, number>>>;
}

/** Groups a full test of the level needs per 大問 */
export const fullTestGroups = (level: JlptLevel, mondai: Mondai) => Math.ceil((MONDAI_COUNTS[level][mondai] ?? 0) / groupSize(mondai, level));

/**
 * Group ids this user has already met in JLPT sessions
 */
async function seenGroupIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ blueprint: examSessions.blueprint })
    .from(examSessions)
    .where(and(eq(examSessions.userId, userId), eq(examSessions.exam, 'jlpt')));
  return new Set(rows.flatMap((row) => (row.blueprint as JlptBlueprint).sections.flatMap((s) => s.groupIds)));
}

/**
 * Questions in a stored group (listening counts items)
 */
const questionsIn = (item: ContentItem) => {
  const payload = item.payload as { questions?: unknown[]; items?: unknown[] };
  return (payload.questions ?? payload.items ?? []).length;
};

/**
 * Picks groups for each 大問, unseen first, using only as many questions as the test needs
 * @returns The blueprint, or the groups missing per 大問
 */
export async function assembleJlpt(
  userId: string,
  level: JlptLevel,
  mode: JlptMode,
  section?: JlptSection
): Promise<{ blueprint: JlptBlueprint } | { missing: Partial<Record<Mondai, number>> }> {
  const seen = await seenGroupIds(userId);
  const sections: JlptBlueprint['sections'] = [];
  const missing: Partial<Record<Mondai, number>> = {};

  for (const { mondai, questions } of mondaiFor(level, mode, section)) {
    const items = await db
      .select()
      .from(contentItems)
      .where(
        and(
          eq(contentItems.exam, 'jlpt'),
          eq(contentItems.part, partTag(mondai)),
          eq(contentItems.level, level),
          eq(contentItems.status, 'published'),
          ne(contentItems.source, 'imported')
        )
      );

    const shuffled = items
      .map((item) => ({ item, key: (seen.has(item.id) ? 1 : 0) + Math.random() }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.item);

    const groupIds: string[] = [];
    const takes: number[] = [];
    let remaining = questions;
    for (const item of shuffled) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, questionsIn(item));
      if (take === 0) continue;
      groupIds.push(item.id);
      takes.push(take);
      remaining -= take;
    }
    if (remaining > 0) missing[mondai] = Math.ceil(remaining / groupSize(mondai, level));
    sections.push({ mondai, groupIds, takes });
  }

  return Object.keys(missing).length > 0 ? { missing } : { blueprint: { exam: 'jlpt', level, sections } };
}

/**
 * Blueprint of an imported test: its groups by question type, in book order
 */
export async function jlptOfficialBlueprint(importId: string): Promise<JlptBlueprint | null> {
  const items = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.importId, importId), eq(contentItems.status, 'published'), eq(contentItems.exam, 'jlpt')))
    .orderBy(asc(contentItems.importOrder));
  if (items.length === 0) return null;

  const mondaiOf = (item: ContentItem) => (item.part ?? '').replace('jlpt-', '') as Mondai;
  const sections = MONDAI.map((mondai) => {
    const own = items.filter((item) => mondaiOf(item) === mondai);
    return { mondai, groupIds: own.map((item) => item.id), takes: own.map(questionsIn) };
  }).filter((section) => section.groupIds.length > 0);
  return { exam: 'jlpt', level: items[0].level as JlptLevel, sections, importId };
}

/**
 * Time for an imported test: each section's time scaled by how many of its official questions the book has
 * (a complete test gets the official time)
 */
export function jlptOfficialTimeLimit(blueprint: JlptBlueprint): number {
  const level = blueprint.level;
  const minutes = JLPT_SECTIONS.reduce((sum, section) => {
    const official = mondaiFor(level, 'part', section).reduce((n, m) => n + m.questions, 0);
    const present = blueprint.sections.filter((s) => MONDAI_SECTION[s.mondai] === section).reduce((n, s) => n + s.takes.reduce((a, b) => a + b, 0), 0);
    return sum + (official ? (SECTION_MINUTES[level][section] * Math.min(present, official)) / official : 0);
  }, 0);
  return Math.min(FULL_MINUTES[level], Math.max(5, Math.ceil(minutes))) * 60;
}

/**
 * Loads every group in a blueprint, keyed by id
 */
export async function loadJlptGroups(blueprint: JlptBlueprint): Promise<Map<string, ContentItem>> {
  const ids = blueprint.sections.flatMap((s) => s.groupIds);
  if (ids.length === 0) return new Map();
  const items = await db.select().from(contentItems).where(inArray(contentItems.id, ids));
  return new Map(items.map((item) => [item.id, item]));
}

type Payload = Record<string, unknown>;

/**
 * Group payload limited to the questions the test uses, with answers removed while in progress
 */
function visiblePayload(payload: Payload, take: number, reveal: boolean): Payload {
  const strip = (q: Payload) => (reveal ? q : Object.fromEntries(Object.entries(q).filter(([key]) => key !== 'answerIndex' && key !== 'explanation')));
  const result: Payload = { ...payload };
  if (Array.isArray(payload.questions)) result.questions = (payload.questions as Payload[]).slice(0, take).map(strip);
  if (Array.isArray(payload.items)) result.items = (payload.items as Payload[]).slice(0, take).map(strip);
  return result;
}

/**
 * Session view for the client: answers hidden while in progress, full review after submit
 */
export function jlptSessionView(session: ExamSession, groups: Map<string, ContentItem>) {
  const blueprint = session.blueprint as JlptBlueprint;
  const reveal = session.status === 'submitted';
  return {
    id: session.id,
    exam: 'jlpt' as const,
    level: blueprint.level,
    mode: session.mode as JlptMode,
    status: session.status,
    timeLimitSec: session.timeLimitSec,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    deadline: new Date(session.startedAt.getTime() + session.timeLimitSec * 1000),
    answers: session.answers as Record<string, number>,
    flags: session.flags as string[],
    result: session.result as JlptResult | null,
    sections: blueprint.sections.map((section) => ({
      mondai: section.mondai,
      section: MONDAI_SECTION[section.mondai],
      groups: section.groupIds.flatMap((id, i) => {
        const item = groups.get(id);
        return item ? [{ id, payload: visiblePayload(item.payload as Payload, section.takes[i], reveal) }] : [];
      }),
    })),
  };
}

/* ---------- Scoring ---------- */

export interface JlptResult {
  level: JlptLevel;
  mondai: { mondai: Mondai; section: JlptSection; correct: number; total: number }[];
  sections: { id: ScoreSection; correct: number; total: number; scaled: number; max: number; minimum: number; passedMinimum: boolean }[];
  /** Set for a full test */
  total: number | null;
  passMark: number;
  passed: boolean | null;
}

/**
 * Scores answers: each scored section is scaled linearly from its share of correct answers.
 * The real JLPT uses equating per test form, so this is an estimate.
 */
export function scoreJlpt(blueprint: JlptBlueprint, groups: Map<string, ContentItem>, answers: Record<string, number>, fullTest: boolean): JlptResult {
  const level = blueprint.level;
  const mondai = blueprint.sections.map((section) => {
    let correct = 0;
    let total = 0;
    section.groupIds.forEach((id, i) => {
      const item = groups.get(id);
      if (!item) return;
      const payload = item.payload as { questions?: { answerIndex: number }[]; items?: { answerIndex: number }[] };
      (payload.questions ?? payload.items ?? []).slice(0, section.takes[i]).forEach((q, index) => {
        total++;
        if (answers[`${id}:${index}`] === q.answerIndex) correct++;
      });
    });
    return { mondai: section.mondai, section: MONDAI_SECTION[section.mondai], correct, total };
  });

  const sections = scoreSections(level).flatMap((id) => {
    const rows = mondai.filter((m) => scoreSectionOf(level, m.section) === id);
    if (rows.length === 0) return [];
    const correct = rows.reduce((sum, r) => sum + r.correct, 0);
    const total = rows.reduce((sum, r) => sum + r.total, 0);
    const { max, minimum } = SCORE_RANGE[id];
    const scaled = total === 0 ? 0 : Math.round((correct / total) * max);
    return [{ id, correct, total, scaled, max, minimum, passedMinimum: scaled >= minimum }];
  });

  // A pass/fail needs the whole test, not just one question type per section
  const complete = fullTest && sections.length === scoreSections(level).length;
  const total = complete ? sections.reduce((sum, s) => sum + s.scaled, 0) : null;
  return {
    level,
    mondai,
    sections,
    total,
    passMark: PASS_MARK[level],
    passed: total === null ? null : total >= PASS_MARK[level] && sections.every((s) => s.passedMinimum),
  };
}
