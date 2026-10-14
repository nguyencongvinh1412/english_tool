/**
 * Grammar data loading: AI drafts from server/content/en/grammar into grammar_points.
 * A changed draft file replaces the stored content unless an admin has edited the point.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, ne, or, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { grammarPoints } from '../db/schema.js';
import { GRAMMAR_POINTS } from './map.js';
import { grammarContent } from './content.js';

const DRAFT_DIR = path.resolve(process.cwd(), 'server/content/en/grammar');

/**
 * Loads new or changed drafts
 * @returns Points written
 */
export async function ensureGrammar(dir = DRAFT_DIR): Promise<number> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    console.warn('Grammar drafts not found; run npm run grammar:draft');
    return 0;
  }
  const known = new Set(GRAMMAR_POINTS.map((p) => p.id));
  let written = 0;
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    if (!known.has(id)) continue;
    const raw = await readFile(path.join(dir, file), 'utf8');
    const parsed = grammarContent.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`Grammar draft ${id} is invalid: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const hash = createHash('sha256').update(raw).digest('hex');
    const inserted = await db.insert(grammarPoints).values({ id, content: parsed.data, seedHash: hash }).onConflictDoNothing().returning({ id: grammarPoints.id });
    if (inserted.length) {
      written++;
      continue;
    }
    const updated = await db
      .update(grammarPoints)
      .set({ content: parsed.data, seedHash: hash, status: 'draft', updatedAt: new Date() })
      .where(and(eq(grammarPoints.id, id), eq(grammarPoints.edited, false), or(isNull(grammarPoints.seedHash), ne(grammarPoints.seedHash, hash))))
      .returning({ id: grammarPoints.id });
    written += updated.length;
  }
  return written;
}
