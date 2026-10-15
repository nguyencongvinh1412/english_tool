/**
 * Generates audio clips ahead of time for content learners hear often (English words and grammar example
 * sentences), so the voice server is rarely needed after launch. Run it where Kokoro is reachable:
 *   TTS_BASE_URL=http://localhost:8880 STORAGE_DRIVER=s3 S3_*=... DATABASE_URL=... npm run tts:warm
 * With STORAGE_DRIVER=s3 clips go to the bucket under tts/; otherwise to TTS_CACHE_DIR. Existing clips are skipped.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '../db/client.js';
import { vocabItems } from '../db/schema.js';
import { ensureClip } from '../services/tts.js';

const GRAMMAR_DIR = path.resolve('server/content/en/grammar');
/** The voice the app uses for one-off English speech */
const VOICE = 'af_heart';
const MAX_CLIP_CHARS = 600;
const CONCURRENCY = 2;

/** Same sentence splitting as the browser (src/shared/speech.ts), so clip texts match what learners request */
function splitSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.flatMap((s) => (s.length <= MAX_CLIP_CHARS ? [s] : (s.match(new RegExp(`.{1,${MAX_CLIP_CHARS}}(\\s|$)`, 'g')) ?? [s])));
}

/** English sentences under "example" / "examples" keys of a grammar point */
function collectExamples(node: unknown, out: Set<string>, key = ''): void {
  if (Array.isArray(node)) {
    for (const item of node) collectExamples(item, out, key);
  } else if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if ((key === 'example' || key === 'examples') && typeof record.en === 'string') out.add(record.en);
    for (const [k, v] of Object.entries(record)) collectExamples(v, out, k);
  }
}

async function main(): Promise<void> {
  const texts = new Set<string>();

  const words = await db.select({ term: vocabItems.term }).from(vocabItems).where(and(eq(vocabItems.language, 'en'), eq(vocabItems.kind, 'word')));
  for (const { term } of words) texts.add(term);

  const examples = new Set<string>();
  for (const file of (await readdir(GRAMMAR_DIR)).filter((f) => f.endsWith('.json'))) {
    collectExamples(JSON.parse(await readFile(path.join(GRAMMAR_DIR, file), 'utf8')), examples);
  }
  for (const example of examples) for (const sentence of splitSentences(example)) texts.add(sentence);

  const queue = [...texts];
  console.log(`${queue.length} clips to check (${words.length} words, ${examples.size} grammar examples)`);
  let done = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let text = queue.shift(); text !== undefined; text = queue.shift()) {
        try {
          await ensureClip(text, VOICE, 1);
        } catch (error) {
          failed++;
          console.warn(`✗ "${text.slice(0, 40)}": ${error instanceof Error ? error.message : error}`);
        }
        if (++done % 100 === 0) console.log(`${done}/${texts.size}`);
      }
    })
  );
  console.log(`Done: ${done - failed} ok, ${failed} failed`);
  await closeDb();
}

void main();
