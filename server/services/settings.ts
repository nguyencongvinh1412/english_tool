/**
 * App settings an admin changes in the web UI, kept in the database with a short cache
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appSettings } from '../db/schema.js';

const CACHE_MS = 5_000;
const cache = new Map<string, { value: unknown; at: number }>();

/**
 * A setting's value, or undefined when it was never saved
 */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T | undefined;
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  cache.set(key, { value: row?.value, at: Date.now() });
  return row?.value as T | undefined;
}

/**
 * Saves a setting (replacing it) and drops the cached copy
 */
export async function putSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  cache.delete(key);
}

/** For tests: forget cached settings */
export const clearSettingsCache = (): void => cache.clear();
