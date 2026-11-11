/**
 * Fills the pools of generated IELTS path exercises so learners do not wait for the AI.
 *
 *   npm run ielts:fill-phase -- 1              # what the steps of phase 1 draw, at the level of the phase, minus what the pool already has
 *   npm run ielts:fill-phase -- 4 --replace    # the same, after retiring the current groups of that level (they leave the pool, nothing is deleted)
 *   npm run ielts:fill-gates                   # what the retakes (version B) of Gates 1-4 and both versions of Gates 5-6 need
 *   npm run ielts:fill -- 4 l-conv r-short     # 4 more of the named types at B1; add A2 or B2 to choose the level
 *
 * Runs as the first admin account (its AI access); every exercise is solved by a second request and dropped when the
 * answers do not agree. Exercises stay in the shared pool, archived, so they never appear in the practice library.
 * Running a phase fill twice is safe: once the pool holds what the phase needs, nothing more is generated.
 */
import '../config.js';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { closeDb, db } from '../db/client.js';
import { contentItems, users } from '../db/schema.js';
import { fillPool, FULL_TYPES, GENERATED_TYPES, levelFor, phaseLevel, POOL_LEVELS, poolNeeds, poolSizes, type PoolLevel, type PoolType } from '../ieltsPath/practice.js';
import { WRITTEN_PHASES } from '../ieltsPath/syllabus.js';

const ALL_TYPES = [...GENERATED_TYPES, ...FULL_TYPES] as readonly string[];
/** Extra groups beyond what the steps draw, for the ones the answer check drops later and for learn-ahead */
const SPARE = 2;

type Job = [PoolType, PoolLevel, number];

/** What the retakes of Gates 1-4 and the full tests of Gates 5-6 need */
const gateJobs = (): Job[] => [
  ['l-form', levelFor('l-form', 1), 3], ['r-tfng', levelFor('r-tfng', 1), 3],
  ['l-mono', levelFor('l-mono', 2), 3], ['r-scan', levelFor('r-scan', 2), 3],
  ['l-sec3', levelFor('l-sec3', 3), 3], ['r-passage', levelFor('r-passage', 3), 3],
  ['l-sec4', levelFor('l-sec4', 4), 3], ['r-passage', levelFor('r-passage', 4), 3],
  ['g-l1', 'B2', 4], ['g-l2', 'B2', 4], ['g-l3', 'B2', 4], ['g-l4', 'B2', 4], ['g-r', 'B2', 12],
];

/** What the steps of a phase need at its level, minus what the pool holds */
function phaseJobs(phase: number, sizes: Record<string, number>): Job[] {
  const level = phaseLevel(phase);
  return Object.entries(poolNeeds(phase))
    .map(([type, count]): Job => [type as PoolType, level, Math.max(0, count + SPARE - (sizes[`${type}@${level}`] ?? 0))])
    .filter(([, , n]) => n > 0);
}

/** Retires the current groups of the types a phase uses at its level: they leave the pool but stay in the database */
async function retire(phase: number): Promise<number> {
  const level = phaseLevel(phase);
  const parts = Object.keys(poolNeeds(phase)).map((type) => `path:${type}`);
  if (parts.length === 0) return 0;
  const rows = await db.update(contentItems).set({ status: 'draft' }).where(and(inArray(contentItems.part, parts), eq(contentItems.level, level), eq(contentItems.status, 'archived'))).returning({ id: contentItems.id });
  return rows.length;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error('No admin account to generate with.');

  const phaseAt = args.indexOf('--phase');
  const phase = phaseAt >= 0 ? Number(args[phaseAt + 1]) : null;
  if (phase !== null && !WRITTEN_PHASES.includes(phase)) throw new Error(`Phase ${args[phaseAt + 1]} has no written syllabus (phases ${WRITTEN_PHASES.join(', ')}).`);
  if (phase !== null && args.includes('--replace')) console.log(`Retired ${await retire(phase)} groups of phase ${phase} (${phaseLevel(phase)}).`);

  const sizes = await poolSizes();
  console.log('Pool sizes before:', sizes);
  let jobs: Job[];
  if (phase !== null) {
    jobs = phaseJobs(phase, sizes);
    console.log(`Phase ${phase} at ${phaseLevel(phase)} needs:`, Object.fromEntries(jobs.map(([type, , n]) => [type, n])));
  } else if (args.includes('--gates')) {
    jobs = gateJobs();
  } else {
    const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 4);
    const level = (args.find((a): a is PoolLevel => (POOL_LEVELS as readonly string[]).includes(a)) ?? 'B1') as PoolLevel;
    const named = args.filter((a): a is PoolType => ALL_TYPES.includes(a));
    jobs = (named.length > 0 ? named : [...GENERATED_TYPES]).map((type): Job => [type, level, count]);
  }
  for (const [type, level, n] of jobs) {
    const { created, failed } = await fillPool(admin, type, level, n);
    console.log(`${type} ${level}: +${created}${failed ? `, ${failed} failed` : ''}`);
  }
  console.log('Pool sizes after:', await poolSizes());
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
