/**
 * Authored IELTS Path lessons: a short teaching unit (what to know, annotated examples, useful phrases, a mini drill).
 * Drafts live in server/content/en/ielts-path/<id>.json and are loaded into skill_units, like the email course:
 * a changed file replaces the stored lesson unless an admin has edited it. The exercise that follows a lesson is its
 * own step in the syllabus.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { skillUnits } from '../db/schema.js';
import { unitDrill } from '../curriculum/units.js';
import { LESSONS } from './syllabus.js';

const DRAFT_DIR = path.resolve(process.cwd(), 'server/content/en/ielts-path');

const text = (max: number) => z.string().trim().min(1).max(max);
const bilingual = (max: number) => z.object({ en: text(max), vi: text(max) });

export const pathLessonContent = z.object({
  objectives: z.array(bilingual(220)).min(2).max(4),
  /** Short teaching sections; body uses **bold** for key words */
  learn: z.array(z.object({ heading: bilingual(120), body: bilingual(1500) })).min(2).max(5),
  /** Annotated examples: a sample answer, a transcript extract, a passage with the answer marked */
  examples: z.array(z.object({ title: bilingual(120), text: text(1400), note: bilingual(600) })).min(1).max(4),
  /** Useful phrases grouped by what they do */
  phrases: z.array(z.object({ use: bilingual(120), items: z.array(text(200)).min(2).max(8) })).max(5),
  drills: z.array(unitDrill).min(3).max(8),
});
export type PathLessonContent = z.infer<typeof pathLessonContent>;

/** The id a lesson is stored under (ids already start with "ip-") */
export const lessonRowId = (lessonId: string): string => lessonId;

export async function loadLesson(lessonId: string): Promise<PathLessonContent | null> {
  const [row] = await db.select({ content: skillUnits.content }).from(skillUnits).where(eq(skillUnits.id, lessonRowId(lessonId)));
  return row ? (row.content as PathLessonContent) : null;
}

/**
 * Loads new or changed lesson drafts into skill_units
 * @returns Lessons written
 */
export async function ensurePathLessons(dir = DRAFT_DIR): Promise<number> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return 0;
  }
  const known = new Set(LESSONS.map((l) => l.id));
  let written = 0;
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    if (!known.has(id)) continue;
    const raw = await readFile(path.join(dir, file), 'utf8');
    const parsed = pathLessonContent.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`IELTS lesson ${id} is invalid: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
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
