import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration
 * `npm run db:generate` writes SQL migrations from server/db/schema.ts
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
