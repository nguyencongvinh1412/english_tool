/**
 * Dictation Routes
 * The next dictation passage at the learner's level
 */
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { DICTATION_LEVELS, dictationSummary, nextDictation } from '../listening/dictation.js';

const nextSchema = z.object({
  mode: z.enum(['auto', 'new', 'redo']).optional(),
  level: z.enum(DICTATION_LEVELS).optional(),
  topic: z.string().trim().min(2).max(80).optional(),
  model: z.string().max(100).optional(),
});

export function createDictationRouter(): Router {
  const router = Router();
  /**
   * GET /dictation/summary - The learner's dictation level and how many lessons are worth doing again (under 80%)
   */
  router.get('/dictation/summary', requireAuth, async (req, res) => {
    res.json(await dictationSummary(currentUser(req)));
  });

  /**
   * POST /dictation/next - A passage the learner has not done at their level (from the books or the AI's earlier ones),
   * or a new one from the AI when none is left or a topic is asked for. mode redo gives one done with under 80%; auto
   * mostly gives a new one and now and then one to redo
   * @returns {Object} { lesson: { id, title, level, sentences, origin, reason, previousPercent? } }
   */
  router.post('/dictation/next', requireAuth, limitAiRequests, async (req, res) => {
    const body = nextSchema.parse(req.body ?? {});
    res.json({ lesson: await nextDictation(currentUser(req), body) });
  });

  return router;
}
