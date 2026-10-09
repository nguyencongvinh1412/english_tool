/**
 * Express Application
 * Builds the app without listening, so tests can drive it with supertest
 */
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { IS_PRODUCTION } from './config.js';
import { checkOrigin } from './auth/middleware.js';
import { errorHandler, HttpError } from './http/errors.js';
import { createAuthRouter } from './routes/auth.js';
import { createMeRouter } from './routes/me.js';
import { createAdminRouter } from './routes/admin.js';
import { createChatRouter } from './routes/chat.js';
import { createProgressRouter } from './routes/progress.js';
import { createContentRouter } from './routes/content.js';
import { createExamRouter } from './routes/exams.js';
import { createTtsRouter } from './routes/tts.js';

/** Get directory name for ES modules */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Maximum JSON body size (chat history with long messages) */
const JSON_BODY_LIMIT = '1mb';

/**
 * Creates the Express application
 * @param options.logRequests - Log each request (off in tests)
 * @returns Configured Express app
 */
export function createApp(options: { logRequests?: boolean } = {}) {
  const app = express();

  // Behind Docker / a tunnel, trust the first proxy for req.ip and req.protocol
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  if (options.logRequests) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Health check endpoint
   * @route GET /api/health
   */
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api', checkOrigin);
  app.use('/api/auth', createAuthRouter());
  app.use('/api/me', createMeRouter());
  app.use('/api/admin', createAdminRouter());
  app.use('/api/chat', createChatRouter());
  app.use('/api', createProgressRouter());
  app.use('/api', createContentRouter());
  app.use('/api', createExamRouter());
  app.use('/api/tts', createTtsRouter());

  // Unknown API routes return JSON 404 instead of the SPA
  app.use('/api', () => {
    throw new HttpError(404, 'Not found', 'not_found');
  });

  /**
   * Serve the built frontend in production, with SPA fallback
   */
  if (IS_PRODUCTION) {
    const distPath = path.join(__dirname, '..', 'dist');
    app.use(express.static(distPath));

    // Express 5 requires named wildcard parameter
    app.get('/{*path}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
