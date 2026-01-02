/**
 * Server Entry Point
 * Express server for English learning tool API
 * Serves both API endpoints and static frontend in production
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createChatRouter } from './routes/chat.js';

/** Load environment variables from .env file */
dotenv.config();

/** Get directory name for ES modules */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Server configuration constants */
const DEFAULT_PORT = 3001;
const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** API route prefixes */
const API_PREFIX = '/api';
const CHAT_ROUTE = '/chat';
const HEALTH_ROUTE = '/health';

/** Create Express application */
const app = express();

/** Middleware configuration */
app.use(cors());
app.use(express.json());

/**
 * Request logging middleware
 * Logs incoming requests for debugging and monitoring
 */
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

/**
 * Health check endpoint
 * @route GET /api/health
 * @returns {Object} Health status and timestamp
 */
app.get(`${API_PREFIX}${HEALTH_ROUTE}`, (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/** Mount chat routes */
app.use(`${API_PREFIX}${CHAT_ROUTE}`, createChatRouter());

/**
 * Serve static files in production
 * In production, the frontend is built and served from the dist folder
 */
if (IS_PRODUCTION) {
  // Serve static files from the dist folder
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  // Handle SPA routing - serve index.html for all non-API routes
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

/** Start the server */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${IS_PRODUCTION ? 'production' : 'development'}`);
  console.log(`Health check: http://localhost:${PORT}${API_PREFIX}${HEALTH_ROUTE}`);
  console.log(`Chat endpoint: http://localhost:${PORT}${API_PREFIX}${CHAT_ROUTE}`);
});
