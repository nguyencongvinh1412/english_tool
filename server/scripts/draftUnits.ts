/**
 * Drafts curriculum lessons with the AI into server/content/en/units/<id>.json:
 *   npm run units:draft             # lessons without a draft
 *   npm run units:draft -- --all    # redraft everything
 *   npm run units:draft -- email-request email-complaint
 * Uses CLIPROXY_* from .env. Drafts are loaded into the database on startup; lessons an admin has
 * edited in the app keep their version.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import '../config.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { UNITS, unitContent, unitDraftPrompt } from '../curriculum/units.js';

const OUT_DIR = path.resolve(process.cwd(), 'server/content/en/units');
const CONCURRENCY = 3;
const MODEL = process.env.UNITS_MODEL || process.env.CLIPROXY_MODEL || 'claude-sonnet-5-5';

/** JSON object in a reply (models sometimes wrap it in a code fence) */
function parseJson(reply: string): unknown {
  return JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1));
}

async function draft(id: string): Promise<void> {
  const meta = UNITS.find((u) => u.id === id);
  if (!meta) {
    console.error(`✗ ${id}: unknown lesson`);
    return;
  }
  const prompt = unitDraftPrompt(meta);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    try {
      const reply = await sendChatMessage({ systemPrompt: prompt.system, messages: [{ role: 'user', content: prompt.user }], model: MODEL, timeoutMs: 360_000, maxTokens: 8192 });
      const content = unitContent.parse(parseJson(reply));
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
  const ids = args.includes('--all') ? UNITS.map((u) => u.id) : args.length > 0 ? args : UNITS.map((u) => u.id).filter((id) => !existing.has(id));
  console.log(`Drafting ${ids.length} lessons with ${MODEL}…`);
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) await draft(id);
    })
  );
}

void main();
