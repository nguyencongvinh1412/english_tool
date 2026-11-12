/**
 * Where to read more about a grammar point: the unit numbers of English Grammar in Use that cover it (numbers only;
 * made by `npm run grammar:reading`). The book itself is not served.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(process.cwd(), 'server/content/en/grammar-reading.json');
let cache: Record<string, number[]> | null = null;

export function readMoreUnits(pointId: string): number[] {
  cache ??= existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, number[]>) : {};
  return cache[pointId] ?? [];
}
