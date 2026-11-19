/**
 * Dictation passages for the learner's level. Passages cut from the listening books (`npm run book:dictation`) and
 * passages the AI wrote earlier live in the content bank as kind "dictation"; the learner gets one they have not done.
 * When none is left at the level, the AI writes a new one on a topic and it joins the bank.
 */
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts, contentItems, type User } from '../db/schema.js';
import { dictationPassage } from '../content/schemas.js';
import { activePath } from '../ieltsPath/service.js';
import { nextGate } from '../ieltsPath/gates.js';
import { runAIJson } from '../services/ai.js';

export const DICTATION_LEVELS = ['A2', 'B1', 'B2', 'C1'] as const;
export type DictationLevel = (typeof DICTATION_LEVELS)[number];

export interface DictationLessonView {
  id: string;
  title: string;
  level: DictationLevel;
  sentences: string[];
  /** Where it came from: a book, written by the AI, or one of the app's fixed lessons (the browser holds those: no sentences here) */
  origin: 'book' | 'ai' | 'builtin';
  /** Why this one: not done yet, or done before with a score under the pass mark */
  reason: 'new' | 'redo';
  /** The score of the last time, for a redo */
  previousPercent?: number;
}

/** A lesson done with less than this share of sentences typed right, without hints, is offered again */
export const PASS_PERCENT = 80;
/** In the automatic mode, how often a lesson to redo comes before a new one (when there is one to redo) */
const REDO_SHARE = 0.35;
export type DictationMode = 'auto' | 'new' | 'redo';

/** The CEFR level of the learner's profile as a dictation level */
const fromCefr = (cefr: string | null): DictationLevel => {
  const level = (cefr ?? '').toUpperCase();
  return level === 'A1' || level === 'A2' ? 'A2' : level === 'B2' ? 'B2' : level === 'C1' || level === 'C2' ? 'C1' : 'B1';
};

/** The level the learner works at: the phase of their IELTS path, else their profile level */
export async function dictationLevelOf(user: User): Promise<DictationLevel> {
  const path = await activePath(user.id);
  if (path && path.startPhase !== null) {
    const phase = Math.min(await nextGate(path), 7);
    return phase <= 1 ? 'A2' : phase <= 3 ? 'B1' : phase <= 5 ? 'B2' : 'C1';
  }
  return fromCefr(user.cefrLevel);
}

/** Levels to try, nearest first: the learner's own, then the one below and the one above */
const nearby = (level: DictationLevel): DictationLevel[] => {
  const at = DICTATION_LEVELS.indexOf(level);
  return [level, DICTATION_LEVELS[at - 1], DICTATION_LEVELS[at + 1]].filter((l): l is DictationLevel => l !== undefined);
};

const TOPICS = [
  'a weekend away', 'ordering food in a restaurant', 'a job interview', 'moving to a new flat', 'a visit to the doctor', 'learning a language',
  'a train journey', 'shopping online', 'a day at university', 'keeping fit', 'a family celebration', 'using public transport in a city',
  'a hobby that takes time', 'the weather and the seasons', 'volunteering in the community', 'a new phone or computer', 'a trip to a museum',
  'saving money', 'a problem at work', 'protecting the environment', 'a school project', 'a holiday by the sea', 'cooking at home', 'a lost bag at the airport',
];

const LEVEL_GUIDANCE: Record<DictationLevel, string> = {
  A2: 'CEFR A2. 6 sentences of 5 to 10 words each, simple everyday vocabulary, present and past simple.',
  B1: 'CEFR B1. 6 sentences of 9 to 14 words each, common phrasal verbs and linking words (because, although, so).',
  B2: 'CEFR B2. 6 sentences of 12 to 18 words each, a range of tenses, natural collocations and some abstract words.',
  C1: 'CEFR C1. 6 sentences of 15 to 22 words each, academic or professional vocabulary, complex structures.',
};

const toView = (row: { id: string; title: string; level: string | null; payload: unknown; source: string }, extra: Partial<DictationLessonView> = {}): DictationLessonView => ({
  id: row.id,
  title: row.title,
  level: DICTATION_LEVELS.find((l) => l === row.level) ?? 'B1',
  sentences: (row.payload as { sentences: string[] }).sentences,
  origin: row.source === 'ai' ? 'ai' : 'book',
  reason: 'new',
  ...extra,
});

interface Weak {
  ref: string;
  title: string | null;
  percent: number;
}

/** Lessons whose last attempt scored under the pass mark, the weakest first */
export async function weakLessons(user: User): Promise<Weak[]> {
  const rows = await db
    .select({ ref: attempts.contentRef, title: attempts.title, score: attempts.score, max: attempts.maxScore })
    .from(attempts)
    .where(and(eq(attempts.userId, user.id), eq(attempts.activity, 'dictation'), isNotNull(attempts.contentRef)))
    .orderBy(desc(attempts.completedAt));
  const latest = new Map<string, Weak>();
  for (const row of rows) {
    // Newest first: the first row of a lesson is its last attempt
    if (!row.ref || latest.has(row.ref) || !row.max || row.score === null) continue;
    latest.set(row.ref, { ref: row.ref, title: row.title, percent: Math.round((row.score / row.max) * 100) });
  }
  return [...latest.values()].filter((w) => w.percent < PASS_PERCENT).sort((a, b) => a.percent - b.percent);
}

/** One lesson to do again: a passage of the bank, or one of the fixed lessons the browser holds */
async function redoView(weak: Weak): Promise<DictationLessonView | null> {
  const [row] = await db.select().from(contentItems).where(and(eq(contentItems.id, weak.ref), eq(contentItems.kind, 'dictation'))).limit(1);
  const extra = { reason: 'redo' as const, previousPercent: weak.percent };
  if (row) return toView(row, extra);
  // Not in the bank: a fixed lesson of the app (its sentences live in the browser)
  return weak.title ? { id: weak.ref, title: weak.title, level: 'B1', sentences: [], origin: 'builtin', ...extra } : null;
}

/** A passage of the bank the learner has not done, preferring their own level, or null */
async function unseen(user: User, level: DictationLevel): Promise<DictationLessonView | null> {
  const done = await db.select({ ref: attempts.contentRef }).from(attempts).where(and(eq(attempts.userId, user.id), eq(attempts.activity, 'dictation')));
  const seen = new Set(done.map((d) => d.ref).filter((r): r is string => r !== null));
  // Own level first; the neighbouring levels only count as a second choice
  for (const wanted of nearby(level)) {
    const rows = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.kind, 'dictation'), eq(contentItems.language, 'en'), eq(contentItems.level, wanted), inArray(contentItems.status, ['archived', 'published'])));
    const fresh = rows.filter((r) => !seen.has(r.id));
    if (fresh.length > 0) return toView(fresh[Math.floor(Math.random() * fresh.length)]);
  }
  return null;
}

/** The AI writes a passage at the level on a topic and the bank keeps it */
async function writeOne(user: User, level: DictationLevel, topic: string | undefined, model: string | undefined): Promise<DictationLessonView> {
  const chosen = topic?.trim() || TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const passage = await runAIJson(
    user,
    {
      feature: 'dictation-generate',
      model,
      timeoutMs: 120_000,
      system: `You write short English listening passages for dictation practice for Vietnamese learners.
Rules: the passage is coherent, natural and factually reasonable; ${LEVEL_GUIDANCE[level]} Write every number and time as words (e.g. "twenty", "half past seven"); no digits, abbreviations, symbols, emojis or quotation marks inside sentences.
Answer ONLY with JSON: {"title":"<3 to 6 words>","sentences":["...", "..."]}`,
      messages: [{ role: 'user', content: `Topic: ${chosen}` }],
    },
    dictationPassage
  );
  const id = `ai-dict-${crypto.randomUUID()}`;
  await db.insert(contentItems).values({ id, kind: 'dictation', skill: 'listening', exam: 'none', language: 'en', part: 'ai:dictation', level, title: passage.title, topic: chosen, payload: passage, source: 'ai', status: 'published', createdBy: user.id });
  return { id, title: passage.title, level, sentences: passage.sentences, origin: 'ai', reason: 'new' };
}

/**
 * The next dictation passage for the learner
 * @param mode - new: one not done yet; redo: one done with a score under the pass mark; auto: mostly new, sometimes a redo
 * @param level - Overrides the level worked out from the learner's path or profile
 * @param topic - Asks for a new passage on this topic (written by the AI) instead of one from the bank
 */
export async function nextDictation(user: User, options: { mode?: DictationMode; level?: DictationLevel; topic?: string; model?: string } = {}): Promise<DictationLessonView> {
  const level = options.level ?? (await dictationLevelOf(user));
  const mode = options.topic ? 'new' : (options.mode ?? 'auto');
  const weak = mode === 'new' ? [] : await weakLessons(user);
  const redo = async (): Promise<DictationLessonView | null> => {
    // A random one of those to redo, so the same passage does not come back every time
    for (const pick of [...weak].sort(() => Math.random() - 0.5)) {
      const view = await redoView(pick);
      if (view) return view;
    }
    return null;
  };

  if (mode === 'redo') {
    const view = await redo();
    if (view) return view;
  }
  if (mode === 'auto' && weak.length > 0 && Math.random() < REDO_SHARE) {
    const view = await redo();
    if (view) return view;
  }
  if (!options.topic) {
    const found = await unseen(user, level);
    if (found) return found;
    // Nothing new at the level: doing a weak one again comes before spending AI credits on a new passage
    if (mode === 'auto' && weak.length > 0) {
      const view = await redo();
      if (view) return view;
    }
  }
  return writeOne(user, level, options.topic, options.model);
}

/** What the picker shows: the learner's level and how many lessons are worth doing again */
export async function dictationSummary(user: User): Promise<{ level: DictationLevel; weak: number }> {
  return { level: await dictationLevelOf(user), weak: (await weakLessons(user)).length };
}
