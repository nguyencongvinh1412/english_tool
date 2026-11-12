/**
 * Model speaking answers imported from a book (content kind "speaking-model"): a topic with its questions of Parts 1 to
 * 3, a sample answer for each, and the topic's vocabulary. Study material the learner reads, not a test.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { contentItems } from "../db/schema.js";
import { speakingModel } from "../content/schemas.js";
import { HttpError } from "../http/errors.js";

export interface SpeakingModelSummary {
  id: string;
  group: string;
  topic: string;
  counts: { 1: number; 2: number; 3: number };
}

const rows = () =>
  db
    .select()
    .from(contentItems)
    .where(eq(contentItems.kind, "speaking-model"))
    .orderBy(asc(contentItems.id));

export async function listSpeakingModels(): Promise<SpeakingModelSummary[]> {
  return (await rows()).flatMap((row) => {
    const parsed = speakingModel.safeParse(row.payload);
    if (!parsed.success) return [];
    const count = (part: 1 | 2 | 3) =>
      parsed.data.items.filter((i) => i.part === part).length;
    return [
      {
        id: row.id,
        group: parsed.data.group,
        topic: parsed.data.topic,
        counts: { 1: count(1), 2: count(2), 3: count(3) },
      },
    ];
  });
}

export async function getSpeakingModel(id: string) {
  const [row] = await db
    .select()
    .from(contentItems)
    .where(
      and(eq(contentItems.id, id), eq(contentItems.kind, "speaking-model")),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "This topic does not exist.", "not_found");
  return { id: row.id, ...speakingModel.parse(row.payload) };
}
