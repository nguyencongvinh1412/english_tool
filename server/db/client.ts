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
  if (!config.DATABASE_MIGRATION_URL) {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    return;
  }
  const migrationClient = postgres(config.DATABASE_MIGRATION_URL, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await migrationClient.end({ timeout: 5 });
  }
}

/**
 * Closes the connection pool (used by tests and graceful shutdown)
 */
export async function closeDb(): Promise<void> {
  await sqlClient.end({ timeout: 5 });
}
