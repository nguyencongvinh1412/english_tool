/**
 * TTS Routes
 * Natural voices for listening content: generate (cached) clips and stream them back
 */
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, createRateLimiter, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { CLIP_FILE_PATTERN, TTS_VOICES, clipPath, ensureClip, ttsAvailable } from '../services/tts.js';

const MAX_LINES = 60;
const MAX_LINE_CHARS = 600;
/** Batch requests per user per minute; cached clips make repeats cheap, this only stops abuse */
const BATCH_PER_MINUTE = 120;
const CLIP_MAX_AGE_SEC = 365 * 24 * 60 * 60;

const batchSchema = z.object({
  lines: z
    .array(z.object({ text: z.string().trim().min(1).max(MAX_LINE_CHARS), voice: z.enum(TTS_VOICES) }))
    .min(1)
    .max(MAX_LINES),
  speed: z.number().min(0.5).max(1.5).default(1),
});

/**
 * Creates the TTS router
 * @returns Router mounted at /api/tts
 */
export function createTtsRouter(): Router {
  const router = Router();
  const limiter = createRateLimiter(BATCH_PER_MINUTE, 60_000);

  /**
   * GET /status - Whether natural voices are available (otherwise the browser voice is used)
   */
  router.get('/status', requireAuth, async (_req, res) => {
    res.json({ available: await ttsAvailable(), voices: TTS_VOICES });
  });

  /**
   * POST /batch - Clip URLs for each line, generating any that are not cached yet
   * @throws {503} tts_unavailable when the voice service is down
   */
  router.post('/batch', requireAuth, async (req, res) => {
    const userId = currentUser(req).id;
    limiter.check(userId);
    limiter.hit(userId);

    const body = batchSchema.parse(req.body);
    const clips: string[] = [];
    // Sequential: keeps line order and leaves CPU for other learners
    for (const line of body.lines) {
      const name = await ensureClip(line.text, line.voice, body.speed);
      clips.push(`/api/tts/audio/${name}`);
    }

    res.json({ clips });
  });

  /**
   * GET /audio/:file - A cached clip (supports Range requests for seeking)
   */
  router.get('/audio/:file', requireAuth, (req, res, next) => {
    const file = String(req.params.file);
    if (!CLIP_FILE_PATTERN.test(file)) {
      throw new HttpError(404, 'Audio not found.', 'not_found');
    }

    res.sendFile(
      clipPath(file),
      {
        // The dev cache lives in ".cache"; file names are already restricted to a hash
        dotfiles: 'allow',
        headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': `private, max-age=${CLIP_MAX_AGE_SEC}, immutable` },
      },
      (error) => {
        if (error && !res.headersSent) next(new HttpError(404, 'Audio not found.', 'not_found'));
      }
    );
  });

  return router;
}
