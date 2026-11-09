/**
 * Loads lesson drafts from server/content/en/units into skill_units.
 * A changed draft file replaces the stored lesson unless an admin has edited it.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { skillUnits } from '../db/schema.js';
import { UNITS, unitContent } from './units.js';

const DRAFT_DIR = path.resolve(process.cwd(), 'server/content/en/units');

/**
 * Loads new or changed drafts
 * @returns Lessons written
 */
export async function ensureSkillUnits(dir = DRAFT_DIR): Promise<number> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    console.warn('Lesson drafts not found; run npm run units:draft');
    return 0;
  }
  const known = new Set(UNITS.map((u) => u.id));
  let written = 0;
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    if (!known.has(id)) continue;
    const raw = await readFile(path.join(dir, file), 'utf8');
    const parsed = unitContent.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`Lesson draft ${id} is invalid: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const hash = createHash('sha256').update(raw).digest('hex');
    const inserted = await db.insert(skillUnits).values({ id, content: parsed.data, seedHash: hash }).onConflictDoNothing().returning({ id: skillUnits.id });
    if (inserted.length) {
      written++;
      continue;
    }
    const updated = await db
      .update(skillUnits)
      .set({ content: parsed.data, seedHash: hash, status: 'draft', updatedAt: new Date() })
      .where(and(eq(skillUnits.id, id), eq(skillUnits.edited, false), or(isNull(skillUnits.seedHash), ne(skillUnits.seedHash, hash))))
      .returning({ id: skillUnits.id });
    written += updated.length;
  }
  return written;
}
