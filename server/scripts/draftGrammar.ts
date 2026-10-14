/**
 * Drafts the explanation of every grammar point with the AI into server/content/en/grammar/<id>.json:
 *   npm run grammar:draft            # points without a draft
 *   npm run grammar:draft -- --all   # redraft everything
 *   npm run grammar:draft -- present-perfect past-simple
 * Uses CLIPROXY_* from .env. Drafts are loaded into the database on startup; points an admin has
 * edited or reviewed in the app keep their version.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import '../config.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { grammarContent, grammarDraftPrompt } from '../grammar/content.js';

const OUT_DIR = path.resolve(process.cwd(), 'server/content/en/grammar');
const CONCURRENCY = 4;
const MODEL = process.env.GRAMMAR_MODEL || process.env.CLIPROXY_MODEL || 'claude-haiku-5-5';

/**
 * JSON object in a reply (models sometimes wrap it in a code fence)
 */
function parseJson(reply: string): unknown {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  return JSON.parse(reply.slice(start, end + 1));
}

async function draft(id: string): Promise<void> {
  const point = GRAMMAR_POINTS.find((p) => p.id === id)!;
  const prompt = grammarDraftPrompt(point);
  const messages = [{ role: 'user' as const, content: prompt.user }];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    try {
      const reply = await sendChatMessage({ systemPrompt: prompt.system, messages, model: MODEL, timeoutMs: 360_000, maxTokens: 8192 });
      const content = grammarContent.parse(parseJson(reply));
      // Contrast notes must point at the confusable points
      content.contrastNotes = content.contrastNotes.filter((n) => point.contrasts?.includes(n.with));
      await writeFile(path.join(OUT_DIR, `${id}.json`), `${JSON.stringify(content, null, 2)}\n`);
      console.log(`✓ ${id} (${Math.round((Date.now() - started) / 1000)}s)`);
      return;
    } catch (error) {
      console.warn(`  ${id}: attempt ${attempt} invalid (${error instanceof Error ? error.message.slice(0, 160) : error})`);
    }
  }
  console.error(`✗ ${id}: no valid draft`);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const existing = new Set((await readdir(OUT_DIR)).map((f) => f.replace(/\.json$/, '')));
  const ids = args.includes('--all')
    ? GRAMMAR_POINTS.map((p) => p.id)
    : args.length > 0
      ? args
      : GRAMMAR_POINTS.map((p) => p.id).filter((id) => !existing.has(id));
  console.log(`Drafting ${ids.length} grammar points with ${MODEL}…`);
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) await draft(id);
    })
  );
}

void main();
