/**
 * Exam Bank
 * Generates TOEIC groups with the AI and stores them for every learner to reuse
 */
import { db } from '../db/client.js';
import { contentItems, type ContentItem, type User } from '../db/schema.js';
import { buildGenerationPrompt } from '../content/generators.js';
import { contentTitle, type CefrLevel } from '../content/schemas.js';
import { GENERATE_TIMEOUT_MS, runAIJson } from '../services/ai.js';
import { PART_CONFIG, partSchema, type ToeicPart } from './toeic.js';
import { verifyAnswerKey } from './verify.js';
import { HttpError } from '../http/errors.js';

/** Typical TOEIC settings, picked at random so the bank stays varied */
const TOEIC_TOPICS = [
  'office equipment and supplies',
  'hiring and job interviews',
  'business travel arrangements',
  'restaurant reservations and catering',
  'a product launch',
  'a shipping delay',
  'an industry conference',
  'staff training',
  'renting office space',
  'banking and invoices',
  'a medical clinic appointment',
  'a marketing campaign',
  'a customer complaint',
  'IT support and software updates',
  'a factory and manufacturing',
  'retail sales and promotions',
  'hotel bookings',
  'airport and flight changes',
  'a quarterly budget meeting',
  'a company press release',
];

/** Parallel AI calls when filling several groups at once */
const FILL_CONCURRENCY = 3;

/** Generate-and-verify rounds before giving up on one group */
const MAX_GENERATION_ROUNDS = 2;

/**
 * Generates and stores one group for a part; the answer key must survive an independent solve
 * @throws HttpError 502 if no generated group passes verification
 */
export async function generateGroup(user: User, part: ToeicPart, level: CefrLevel, feature: string): Promise<ContentItem> {
  const kind = PART_CONFIG[part].kind;
  const topic = TOEIC_TOPICS[Math.floor(Math.random() * TOEIC_TOPICS.length)];
  const prompt = buildGenerationPrompt(kind, level, topic, undefined);

  let payload: unknown = null;
  for (let round = 1; round <= MAX_GENERATION_ROUNDS && payload === null; round++) {
    const candidate = await runAIJson(
      user,
      {
        feature,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        timeoutMs: GENERATE_TIMEOUT_MS,
      },
      partSchema(part)
    );

    const disagreements = await verifyAnswerKey(user, part, candidate as object, feature);
    if (disagreements.length === 0) {
      payload = candidate;
    } else {
      console.warn(`TOEIC part ${part} group rejected (round ${round}): solver disagreed on questions ${disagreements.join(', ')}`);
    }
  }

  if (payload === null) {
    throw new HttpError(502, 'Generated questions failed the answer check. Please try again.', 'ai_invalid_output');
  }

  const [item] = await db
    .insert(contentItems)
    .values({
      kind,
      skill: PART_CONFIG[part].section,
      exam: 'toeic',
      part: `toeic-${part}`,
      level,
      title: contentTitle(kind, payload as object),
      topic,
      payload,
      source: 'ai',
      createdBy: user.id,
    })
    .returning();

  return item;
}

/**
 * Generates several groups with limited parallelism
 * @returns Groups created and the number that failed
 */
export async function generateGroups(
  user: User,
  requests: { part: ToeicPart; count: number }[],
  level: CefrLevel,
  feature: string
): Promise<{ created: ContentItem[]; failed: number }> {
  const queue = requests.flatMap((r) => Array<ToeicPart>(r.count).fill(r.part));
  const created: ContentItem[] = [];
  let failed = 0;

  const worker = async () => {
    for (let part = queue.shift(); part !== undefined; part = queue.shift()) {
      try {
        created.push(await generateGroup(user, part, level, feature));
      } catch (error) {
        failed++;
        console.error(`Failed to generate TOEIC part ${part} group:`, error instanceof Error ? error.message : error);
        // Quota or model errors will fail every remaining request too
        if (error instanceof Error && 'statusCode' in error && [403, 429].includes(Number(error.statusCode))) {
          failed += queue.length;
          queue.length = 0;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: FILL_CONCURRENCY }, worker));
  return { created, failed };
}
