/**
 * Building the placement question bank from what the app already has: dictionary words (always available) and the
 * multiple-choice questions of published practice content. Everything is idempotent (stable ids, conflicts ignored),
 * so it can be re-run after new content is added. AI-written questions and hand-written ones can be added later;
 * the status column lets an admin retire a bad question.
 */
import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems, placementQuestions, vocabItems } from '../db/schema.js';
import { CEFR_ORDER } from '../progress/levels.js';

/** Words per level turned into questions */
const VOCAB_PER_LEVEL = 40;
const BATCH = 200;

type NewQuestion = typeof placementQuestions.$inferInsert;
const isLevel = (level: string | null): level is (typeof CEFR_ORDER)[number] => CEFR_ORDER.includes(level as (typeof CEFR_ORDER)[number]);

/** A stable pseudo-random number for a string, so a rebuild gives the same questions */
const hash = (text: string): number => parseInt(createHash('sha1').update(text).digest('hex').slice(0, 8), 16);
const byHash = (salt: string) => (a: string, b: string) => hash(salt + a) - hash(salt + b);

/** Options in a fixed shuffled order with the right one's index */
function shuffled(key: string, right: string, wrong: string[]): { options: string[]; answerIndex: number } {
  const options = [right, ...wrong].sort(byHash(key));
  return { options, answerIndex: options.indexOf(right) };
}

/** "What does this word mean?" from the dictionary, with wrong answers taken from other words of the same level */
async function vocabQuestions(): Promise<NewQuestion[]> {
  const out: NewQuestion[] = [];
  for (const level of CEFR_ORDER) {
    const rows = await db
      .select({ id: vocabItems.id, term: vocabItems.term, meanings: vocabItems.meaningsEn })
      .from(vocabItems)
      .where(and(eq(vocabItems.language, 'en'), eq(vocabItems.level, level), eq(vocabItems.kind, 'word')));
    const usable = rows.filter((r) => r.meanings[0] && r.meanings[0].length <= 90 && r.term.length <= 40);
    const meaningOf = (r: (typeof usable)[number]) => r.meanings[0];
    const sample = [...usable].sort((a, b) => hash(a.id) - hash(b.id)).slice(0, VOCAB_PER_LEVEL);
    for (const row of sample) {
      const wrong = usable
        .filter((o) => o.id !== row.id && meaningOf(o) !== meaningOf(row))
        .sort((a, b) => hash(row.id + a.id) - hash(row.id + b.id))
        .slice(0, 3)
        .map(meaningOf);
      if (wrong.length < 3) continue;
      out.push({ id: `vocab:${row.id}`, language: 'en', skill: 'vocabulary', level, prompt: row.term, source: 'vocab', ref: row.id, ...shuffled(row.id, meaningOf(row), wrong) });
    }
  }
  return out;
}

interface Mcq {
  type: string;
  prompt?: string;
  options?: string[];
  answerIndex?: number;
}
const isMcq = (q: Mcq): q is Required<Pick<Mcq, 'prompt' | 'options' | 'answerIndex'>> & Mcq =>
  (q.type === 'mcq' || q.type === 'choice') && typeof q.prompt === 'string' && Array.isArray(q.options) && q.options.length >= 3 && typeof q.answerIndex === 'number' && q.answerIndex < q.options.length;

/** Questions out of published practice content: grammar sets, reading passages, listening quizzes */
async function contentQuestions(): Promise<NewQuestion[]> {
  const rows = await db
    .select({ id: contentItems.id, kind: contentItems.kind, level: contentItems.level, payload: contentItems.payload })
    .from(contentItems)
    .where(and(eq(contentItems.language, 'en'), eq(contentItems.status, 'published'), inArray(contentItems.kind, ['grammar-practice', 'reading-passage', 'listening-quiz']), sql`${contentItems.importId} is null`));

  const out: NewQuestion[] = [];
  for (const row of rows) {
    if (!isLevel(row.level)) continue;
    const payload = row.payload as { items?: Mcq[]; questions?: Mcq[]; paragraphs?: string[]; script?: { speaker: string; text: string }[] };
    const skill = row.kind === 'grammar-practice' ? 'grammar' : row.kind === 'reading-passage' ? 'reading' : 'listening';
    const questions = (skill === 'grammar' ? payload.items : payload.questions) ?? [];
    const context = skill === 'reading' ? (payload.paragraphs ?? []).join('\n\n') : skill === 'listening' ? (payload.script ?? []).map((l) => l.text).join('\n') : null;
    questions.forEach((q, i) => {
      if (!isMcq(q)) return;
      out.push({ id: `content:${row.id}#${i}`, language: 'en', skill, level: row.level!, prompt: q.prompt, context, options: q.options, answerIndex: q.answerIndex, source: 'content', ref: row.id });
    });
  }
  return out;
}

/** Adds every question that is not in the bank yet; returns how many were new */
export async function buildBank(): Promise<{ added: number; vocabulary: number; content: number }> {
  const vocab = await vocabQuestions();
  const content = await contentQuestions();
  let added = 0;
  for (const list of [vocab, content]) {
    for (let i = 0; i < list.length; i += BATCH) {
      const rows = await db.insert(placementQuestions).values(list.slice(i, i + BATCH)).onConflictDoNothing().returning({ id: placementQuestions.id });
      added += rows.length;
    }
  }
  return { added, vocabulary: vocab.length, content: content.length };
}

/** How many questions with a status exist per skill and level, to show where the bank is thin */
export async function coverage(status: 'approved' | 'draft' = 'approved'): Promise<Record<string, Record<string, number>>> {
  const rows = await db
    .select({ skill: placementQuestions.skill, level: placementQuestions.level, n: sql<number>`count(*)::int` })
    .from(placementQuestions)
    .where(and(eq(placementQuestions.language, 'en'), eq(placementQuestions.status, status)))
    .groupBy(placementQuestions.skill, placementQuestions.level);
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.skill] ??= {})[r.level] = r.n;
  return out;
}
