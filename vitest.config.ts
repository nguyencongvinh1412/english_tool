import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration
 * Server tests share one Postgres test database, so files run one at a time
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  test: {
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['server/test/setupEnv.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
