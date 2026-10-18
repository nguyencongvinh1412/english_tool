/**
 * Express Application
 * Builds the app without listening, so tests can drive it with supertest
 */
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, IS_PRODUCTION } from './config.js';
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
import { createMediaRouter } from './routes/media.js';
import { createImportRouter } from './routes/imports.js';
import { createVocabRouter } from './routes/vocab.js';
import { createWordBankRouter } from './routes/wordBank.js';
import { createGrammarRouter } from './routes/grammar.js';
import { createBillingRouter } from './routes/billing.js';
import { createMapsRouter } from './routes/maps.js';
import { createMapsAiRouter } from './routes/mapsAi.js';

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
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  // Security headers; the CSP allows only our own scripts plus Google Fonts
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // pdf.js decodes some scanned images with WebAssembly
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          workerSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      // Media and fonts are same-origin; COEP would block Google Fonts
      crossOriginEmbedderPolicy: false,
    })
  );

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
  app.use('/api', createBillingRouter());
  // The AI routes come first: /maps/propose and /maps/drafts/... must not be read as /maps/:id
  app.use('/api', createMapsAiRouter());
  app.use('/api', createMapsRouter());
  app.use('/api/admin/imports', createImportRouter());
  app.use('/api/admin', createAdminRouter());
  app.use('/api/chat', createChatRouter());
  app.use('/api', createProgressRouter());
  app.use('/api', createContentRouter());
  app.use('/api', createExamRouter());
  app.use('/api/tts', createTtsRouter());
  app.use('/api', createMediaRouter());
  app.use('/api', createVocabRouter());
  app.use('/api', createWordBankRouter());
  app.use('/api', createGrammarRouter());

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
