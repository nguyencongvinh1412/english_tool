/**
 * Imports hand-checked groups from a book (pictures cut from its pages, recordings, questions with the book's answer
 * key) into the content bank. For personal use: the manifest and the files stay on this machine.
 *
 *   npm run book:import -- docs/reference/manifests/cambridge13-test3.json
 *
 * Manifest:
 *   {
 *     "assets": { "<name>": { "file": "/abs/path.png|.mp3", "kind": "image" | "audio", "crop": [x, y, width, height] } },
 *     "items":  [ { "id": "book-c13-t3-l4", "kind": "ielts-listening", "level": "B2", "part": "book:c13-t3", "title": "...",
 *                   "topic": "...", "payload": { ... { "$asset": "<name>", "alt": "..." } ... } } ]
 *   }
 * An object in a payload with "$asset" becomes the same object with "assetId" in place of "$asset". Items are checked
 * against the schema of their kind, stored archived and marked imported, so they stay out of the random bank and the
 * practice library; gates and mock tests point at them by id. Running it again updates the items and reuses the assets.
 */
import '../config.js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { closeDb, db } from '../db/client.js';
import { contentItems, mediaAssets, users } from '../db/schema.js';
import { CONTENT_KINDS, contentTitle } from '../content/schemas.js';
import { saveBuffer } from '../services/storage.js';

interface AssetSpec {
  file: string;
  kind: 'image' | 'audio';
  /** x, y, width, height in pixels of the page image */
  crop?: [number, number, number, number];
}

interface ItemSpec {
  id: string;
  kind: keyof typeof CONTENT_KINDS;
  level: string;
  part: string;
  title?: string;
  topic: string;
  payload: unknown;
}

interface Manifest {
  assets: Record<string, AssetSpec>;
  items: ItemSpec[];
}

const run = (command: string, args: string[]): void => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
};

/** The bytes to store for an asset: a cropped picture as WebP, a recording as it is */
function prepare(spec: AssetSpec): { data: Buffer; extension: string; mime: string } {
  if (spec.kind === 'audio') return { data: readFileSync(spec.file), extension: 'mp3', mime: 'audio/mpeg' };
  const dir = mkdtempSync(path.join(tmpdir(), 'book-import-'));
  try {
    let source = spec.file;
    if (spec.crop) {
      const [x, y, w, h] = spec.crop;
      source = path.join(dir, 'crop.png');
      run('ffmpeg', ['-y', '-loglevel', 'error', '-i', spec.file, '-vf', `crop=${w}:${h}:${x}:${y}`, source]);
    }
    const out = path.join(dir, 'out.webp');
    run('cwebp', ['-quiet', '-q', '88', source, '-o', out]);
    return { data: readFileSync(out), extension: 'webp', mime: 'image/webp' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Replaces every { "$asset": name } in a payload with the stored asset's id */
function resolve(value: unknown, ids: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => resolve(v, ids));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const ref = entries.find(([key]) => key === '$asset');
    if (ref) {
      const id = ids.get(String(ref[1]));
      if (!id) throw new Error(`Unknown asset "${String(ref[1])}"`);
      return { assetId: id, ...Object.fromEntries(entries.filter(([key]) => key !== '$asset').map(([k, v]) => [k, resolve(v, ids)])) };
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, resolve(v, ids)]));
  }
  return value;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run book:import -- <manifest.json>');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
  const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error('No admin account to attribute the files to.');

  const ids = new Map<string, string>();
  for (const [name, spec] of Object.entries(manifest.assets)) {
    const [existing] = await db.select().from(mediaAssets).where(eq(mediaAssets.originalName, name)).limit(1);
    if (existing) {
      ids.set(name, existing.id);
      console.log(`asset ${name}: kept`);
      continue;
    }
    const { data, extension, mime } = prepare(spec);
    const key = await saveBuffer(data, extension, mime);
    const [row] = await db.insert(mediaAssets).values({ kind: spec.kind, storageKey: key, mime, sizeBytes: data.length, originalName: name, uploadedBy: admin.id }).returning();
    ids.set(name, row.id);
    console.log(`asset ${name}: stored (${Math.round(data.length / 1024)} KB)`);
  }

  for (const item of manifest.items) {
    const config = CONTENT_KINDS[item.kind];
    if (!config) throw new Error(`Unknown kind ${item.kind}`);
    const parsed = config.schema.safeParse(resolve(item.payload, ids));
    if (!parsed.success) throw new Error(`${item.id}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    const payload = parsed.data as object;
    const title = item.title ?? contentTitle(item.kind, payload);
    await db
      .insert(contentItems)
      .values({ id: item.id, kind: item.kind, skill: config.skill, exam: 'ielts', language: 'en', part: item.part, level: item.level, title, topic: item.topic, payload, source: 'imported', status: 'archived', createdBy: admin.id })
      .onConflictDoUpdate({ target: contentItems.id, set: { title, payload, level: item.level, part: item.part, topic: item.topic } });
    console.log(`item ${item.id}: ${title}`);
  }
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
