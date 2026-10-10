/**
 * HTTP Errors
 * Throw HttpError from any route; the error handler turns it into a JSON response
 */
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Error with an HTTP status and a client-safe message
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    /** Stable machine-readable code for the frontend, e.g. "quota_exceeded" */
    public readonly code?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Express error handler
 * - HttpError: status + message as-is
 * - ZodError: 400 with per-field issues
 * - Anything else: 500 without internal details
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  // Express identifies error handlers by their 4-argument signature
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: error.message,
      statusCode: error.statusCode,
      ...(error.code && { code: error.code }),
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request',
      statusCode: 400,
      code: 'validation_error',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // Malformed JSON body from express.json()
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Invalid JSON body', statusCode: 400 });
    return;
  }

  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'An unexpected error occurred. Please try again.',
    statusCode: 500,
  });
}
