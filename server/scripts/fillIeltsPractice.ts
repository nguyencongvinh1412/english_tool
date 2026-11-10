/**
 * Fills the pools of generated IELTS path exercises (listening and reading) so learners do not wait for one:
 *   npm run ielts:fill                 # 4 more of each type
 *   npm run ielts:fill -- 8            # 8 more of each type
 *   npm run ielts:fill -- 6 l-conv r-tfng
 * Runs as the first admin account (its AI access); every exercise is solved by a second request and dropped when the
 * answers do not agree. Exercises stay in the shared pool, archived, so they never appear in the practice library.
 */
import '../config.js';
import { asc, eq } from 'drizzle-orm';
import { closeDb, db } from '../db/client.js';
import { users } from '../db/schema.js';
import { fillPool, GENERATED_TYPES, poolSizes, type GeneratedType } from '../ieltsPath/practice.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 4);
  const named = args.filter((a): a is GeneratedType => (GENERATED_TYPES as readonly string[]).includes(a));
  const types = named.length > 0 ? named : [...GENERATED_TYPES];
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error('No admin account to generate with.');

  console.log('Pool sizes before:', await poolSizes());
  for (const type of types) {
    const { created, failed } = await fillPool(admin, type, count);
    console.log(`${type}: +${created}${failed ? `, ${failed} failed` : ''}`);
  }
  console.log('Pool sizes after:', await poolSizes());
  await closeDb();
}

void main();
