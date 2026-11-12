/**
 * Second pass over the example sentences that `book:topic-words` took from the book: the AI judges each one (a whole,
 * natural sentence that uses the word itself, in the sense of its card, not an exercise prompt or an OCR slip) and
 * writes a new one where it is not. Database only.
 *
 *   npm run book:topic-examples
 */
import '../config.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { closeDb, db } from '../db/client.js';
import { users, vocabItems } from '../db/schema.js';
import { runAIJson, SCORING_MAX_TOKENS } from '../services/ai.js';

const verdict = z.object({ items: z.array(z.object({ term: z.string(), keep: z.boolean(), example: z.string().trim().min(8).max(260), exampleVi: z.string().trim().min(3).max(300) })) });

async function main(): Promise<void> {
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error('No admin account.');
  const audit = JSON.parse(readFileSync(path.resolve('docs/reference/manifests/cvi-words.json'), 'utf8')) as Record<string, { term: string; example: string; fromBook: boolean }[]>;
  let kept = 0;
  let rewritten = 0;
  for (const [unit, rows] of Object.entries(audit)) {
    const deck = `en-topic-${unit}`;
    const todo = rows.filter((r) => r.fromBook);
    for (let i = 0; i < todo.length; i += 20) {
      const chunk = todo.slice(i, i + 20);
      const cards = await db.select().from(vocabItems).where(eq(vocabItems.deck, deck));
      const byTerm = new Map(cards.map((c) => [c.term, c]));
      const payload = chunk.map((r) => ({ term: r.term, meaning: byTerm.get(r.term)?.meaningVi ?? '', sentence: r.example }));
      const out = await runAIJson(admin, {
        feature: 'topic-words',
        timeoutMs: 240_000,
        maxTokens: SCORING_MAX_TOKENS,
        system: `You check example sentences for vocabulary cards (IELTS B1 to C1). For each item decide "keep": true only if "sentence" is a complete, natural English sentence (not an exercise instruction or question prompt, not a heading, not garbled by OCR) that contains the word itself (not just a longer word that starts with the same letters) used in the sense of "meaning". If keep is false, write a new natural example sentence with the word in that sense (10 to 22 words). "example" is the kept or new sentence, "exampleVi" its Vietnamese translation. Answer ONLY with JSON: {"items":[{"term":"...","keep":true,"example":"...","exampleVi":"..."}]} with one item per input, in order.`,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }, verdict);
      for (const v of out.items) {
        const card = byTerm.get(v.term);
        if (!card) continue;
        if (v.keep) kept++;
        else rewritten++;
        await db.update(vocabItems).set({ example: v.example, exampleVi: v.exampleVi }).where(and(eq(vocabItems.deck, deck), eq(vocabItems.term, v.term)));
      }
    }
    console.log(`unit ${unit}: done`);
  }
  console.log(`kept ${kept}, rewritten ${rewritten}`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
