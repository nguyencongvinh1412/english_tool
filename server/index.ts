/**
 * Server Entry Point
 * Applies migrations, ensures an admin exists, then starts listening
 */
import { config, IS_PRODUCTION } from './config.js';
import { closeDb, runMigrations } from './db/client.js';
import { ensureBootstrapAdmin } from './services/users.js';
import { createApp } from './app.js';

/**
 * Boots the server
 */
async function main(): Promise<void> {
  await runMigrations();
  await ensureBootstrapAdmin();

  const app = createApp({ logRequests: true });

  const server = app.listen(config.PORT, () => {
    console.log(`Server running on http://localhost:${config.PORT}`);
    console.log(`Environment: ${IS_PRODUCTION ? 'production' : 'development'}`);
  });

  /** Close HTTP server and DB pool on container stop */
  const shutdown = (): void => {
    server.close(() => {
      closeDb().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
