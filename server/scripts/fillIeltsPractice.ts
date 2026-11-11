/**
 * Fills the pools of generated IELTS path exercises (listening and reading) so learners do not wait for one:
 *   npm run ielts:fill                 # 4 more of each type
 *   npm run ielts:fill -- 8            # 8 more of each type
 *   npm run ielts:fill -- 6 l-conv r-tfng
 *   npm run ielts:fill -- --gates      # the exercises the gate retakes and Gates 5-6 need (takes a long time)
 *   npm run ielts:fill -- --phase2     # the exercises of phase 2 (weeks 5-8)
 * Runs as the first admin account (its AI access); every exercise is solved by a second request and dropped when the
 * answers do not agree. Exercises stay in the shared pool, archived, so they never appear in the practice library.
 */
import '../config.js';
import { asc, eq } from 'drizzle-orm';
import { closeDb, db } from '../db/client.js';
import { users } from '../db/schema.js';
import { fillPool, FULL_TYPES, GENERATED_TYPES, poolSizes, type PoolType } from '../ieltsPath/practice.js';

const ALL_TYPES = [...GENERATED_TYPES, ...FULL_TYPES] as readonly string[];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 4);
  const named = args.filter((a): a is PoolType => ALL_TYPES.includes(a));
  const types = named.length > 0 ? named : [...GENERATED_TYPES];
  const gates = args.includes('--gates');
  const phase2 = args.includes('--phase2');
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error('No admin account to generate with.');

  console.log('Pool sizes before:', await poolSizes());
  // --gates: what the retakes (version B) of Gates 1-4 and both versions of Gates 5-6 need
  const plan: [PoolType, number][] = phase2
    ? [['l-form', 6], ['l-mono', 6], ['l-sec3', 10], ['l-sec4', 6], ['r-tfng', 6], ['r-scan', 6], ['r-short', 4], ['r-passage', 16]]
    : gates
    ? [['l-form', 3], ['r-tfng', 3], ['l-mono', 3], ['r-scan', 3], ['l-sec3', 3], ['l-sec4', 3], ['r-passage', 6], ['g-l1', 4], ['g-l2', 4], ['g-l3', 4], ['g-l4', 4], ['g-r', 12]]
    : types.map((type) => [type, count]);
  for (const [type, n] of plan) {
    const { created, failed } = await fillPool(admin, type, n);
    console.log(`${type}: +${created}${failed ? `, ${failed} failed` : ''}`);
  }
  console.log('Pool sizes after:', await poolSizes());
  await closeDb();
}

void main();
