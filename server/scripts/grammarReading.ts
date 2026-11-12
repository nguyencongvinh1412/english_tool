/**
 * Matches each grammar point of the app to the units of English Grammar in Use that cover it, so the grammar screens can
 * say "read more: unit 25". Only unit numbers are kept, never the book's text. The AI sees the titles of the units (from
 * docs/reference/books/egiu-units.json, read off the book's contents) and answers with numbers.
 *
 *   npm run grammar:reading        # writes server/content/en/grammar-reading.json
 */
import '../config.js';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { closeDb, db } from '../db/client.js';
import { users } from '../db/schema.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { runAIJson } from '../services/ai.js';

const units = JSON.parse(readFileSync(path.resolve('docs/reference/books/egiu-units.json'), 'utf8')) as Record<string, string>;
const OUT = path.resolve('server/content/en/grammar-reading.json');

async function main(): Promise<void> {
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error('No admin account to ask the AI with.');
  const list = Object.entries(units).map(([n, title]) => `${n} ${title}`).join('\n');
  const result: Record<string, number[]> = {};
  const batches: (typeof GRAMMAR_POINTS)[] = [];
  for (let i = 0; i < GRAMMAR_POINTS.length; i += 24) batches.push(GRAMMAR_POINTS.slice(i, i + 24));
  for (const batch of batches) {
    const points = batch.map((p) => `${p.id}: ${p.title.en} (${p.cefr})`).join('\n');
    const reply = await runAIJson(
      admin,
      {
        feature: 'grammar-reading',
        timeoutMs: 180_000,
        system: `You match grammar points to the units of "English Grammar in Use" that teach them. For each point give 1 to 3 unit numbers, the best match first; give an empty list when no unit really covers the point. Use only the unit numbers of the list. Answer ONLY with JSON: {"matches":{"<point id>":[unit numbers]}}.`,
        messages: [{ role: 'user', content: `UNITS:\n${list}\n\nGRAMMAR POINTS:\n${points}` }],
      },
      z.object({ matches: z.record(z.string(), z.array(z.number())) })
    );
    for (const point of batch) {
      const numbers = (reply.matches[point.id] ?? []).filter((n) => units[String(n)] !== undefined);
      result[point.id] = [...new Set(numbers)].slice(0, 3);
    }
    console.log(`matched ${Object.keys(result).length} of ${GRAMMAR_POINTS.length}`);
  }
  writeFileSync(OUT, `${JSON.stringify(Object.fromEntries(Object.entries(result).filter(([, v]) => v.length > 0)), null, 1)}\n`);
  for (const point of GRAMMAR_POINTS) console.log(`${point.id.padEnd(34)} ${(result[point.id] ?? []).map((n) => `${n} ${units[String(n)].slice(0, 36)}`).join(' | ') || '-'}`);
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
