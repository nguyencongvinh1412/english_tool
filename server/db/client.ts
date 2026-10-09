/**
 * Database Client
 * Single postgres-js pool shared by the whole server
 */
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { config } from '../config.js';
import * as schema from './schema.js';

/** Migrations folder, resolved from the app root in both dev (tsx) and Docker */
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'server/db/migrations');

/**
 * prepare: false keeps the client compatible with Supabase's transaction pooler,
 * which does not support prepared statements
 */
const sqlClient = postgres(config.DATABASE_URL, {
  prepare: false,
  max: 10,
  onnotice: () => {},
});

export const db = drizzle(sqlClient, { schema });

export type Database = typeof db;

/**
 * Applies pending migrations
 * Safe to run on every startup; already-applied migrations are skipped
 */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

/**
 * Closes the connection pool (used by tests and graceful shutdown)
 */
export async function closeDb(): Promise<void> {
  await sqlClient.end({ timeout: 5 });
}
