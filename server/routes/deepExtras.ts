/**
 * Deep Word extras: a situation to react to, examples about the learner's own life, and what each kind of exercise costs
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deepWordProgress, vocabItems } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { estimateCredits } from '../billing/pricing.js';
import { resolveModel } from '../services/aiAccess.js';
import { runAIJson } from '../services/ai.js';
import { prefsOf, type Profile } from '../deepword/service.js';

const itemId = z.string().min(4).max(200).startsWith('en:');
const body = z.object({ itemId, model: z.string().max(100).optional() });

const scenarioSchema = z.object({ situation: z.string().trim().min(20).max(400), situationVi: z.string().trim().min(5).max(500) });
const personalSchema = z.object({ examples: z.array(z.object({ text: z.string().trim().min(5).max(240), vi: z.string().trim().min(2).max(300) })).min(1).max(3) });

/** The learner's profile as a sentence for a prompt; empty when they gave nothing */
export function describeProfile(profile: Profile): string {
  const parts = [profile.work ? `works in: ${profile.work}` : '', profile.interests?.length ? `interests: ${profile.interests.join(', ')}` : '', profile.situations?.length ? `situations they meet: ${profile.situations.join(', ')}` : ''].filter(Boolean);
  return parts.join('; ');
}

/** Typical sizes of each exercise: prompt tokens and reply characters, to estimate what it costs on the learner's model */
const TYPICAL = {
  sentence: { input: 450, reply: 560 },
  speak: { input: 450, reply: 560 },
  paragraph: { input: 650, reply: 900 },
  // The situation is written first, then the answer is judged
  scenario: { input: 1000, reply: 960 },
} as const;

/**
 * Creates the Deep Word extras router
 * @returns Router mounted at /api
 */
export function createDeepExtrasRouter(): Router {
  const router = Router();

  /** POST /deep/scenario - A short situation in which the word fits, about the learner's own life when they said it */
  router.post('/deep/scenario', requireAuth, limitAiRequests, async (req, res) => {
    const input = body.parse(req.body);
    const user = currentUser(req);
    const [item] = await db.select().from(vocabItems).where(eq(vocabItems.id, input.itemId)).limit(1);
    if (!item || item.language !== 'en') throw new HttpError(404, 'Word not found.', 'not_found');
    const profile = describeProfile((await prefsOf(user.id)).profile);
    const reply = await runAIJson(
      user,
      {
        feature: 'deep-word-scenario',
        model: input.model,
        system: `You write short role-play situations for Vietnamese learners of English.
Write ONE situation of 2 sentences in which a person would naturally use the given word when answering. Say what the learner must answer at the end (for example: "Your manager asks: ..."). Keep the English simple and concrete; do not use the word in the situation.${profile ? ` Base it on the learner's life (${profile}).` : ''}
"situationVi" is a natural Vietnamese version.
Respond with ONLY one JSON object: {"situation": "...", "situationVi": "..."}`,
        messages: [{ role: 'user', content: `Word: ${item.term} (${item.pos ?? 'word'}: ${item.meaningsEn[0] ?? ''})` }],
      },
      scenarioSchema
    );
    res.json(reply);
  });

  /** POST /deep/personal-examples - Two examples about the learner's own life, kept with the open session */
  router.post('/deep/personal-examples', requireAuth, limitAiRequests, async (req, res) => {
    const input = body.parse(req.body);
    const user = currentUser(req);
    const [row] = await db
      .select({ item: vocabItems, progress: deepWordProgress })
      .from(deepWordProgress)
      .innerJoin(vocabItems, eq(vocabItems.id, deepWordProgress.itemId))
      .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, input.itemId)))
      .limit(1);
    if (!row) throw new HttpError(404, 'Start this word first.', 'not_started');
    const saved = (row.progress.sessionData as { personal?: { text: string; vi: string }[] }).personal;
    if (saved?.length) return void res.json({ examples: saved });

    const profile = describeProfile((await prefsOf(user.id)).profile);
    if (!profile) return void res.json({ examples: [] });
    const { examples } = await runAIJson(
      user,
      {
        feature: 'deep-word-content',
        model: input.model,
        system: `You write example sentences for Vietnamese learners of English, about the learner's own life (${profile}).
Write 2 short, natural sentences that use the given word, each with a natural Vietnamese translation in "vi".
Respond with ONLY one JSON object: {"examples": [{"text": "...", "vi": "..."}]}`,
        messages: [{ role: 'user', content: `Word: ${row.item.term} (${row.item.pos ?? 'word'}: ${row.item.meaningsEn[0] ?? ''})` }],
      },
      personalSchema
    );
    await db
      .update(deepWordProgress)
      .set({ sessionData: { ...(row.progress.sessionData as Record<string, unknown>), personal: examples } })
      .where(and(eq(deepWordProgress.userId, user.id), eq(deepWordProgress.itemId, input.itemId)));
    res.json({ examples });
  });

  /** GET /deep/costs - About how many credits each kind of exercise costs on the learner's model */
  router.get('/deep/costs', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const model = await resolveModel(user, z.string().max(100).optional().parse(req.query.model));
    const cost = (kind: keyof typeof TYPICAL) => Math.max(0.1, Math.round(estimateCredits(model, TYPICAL[kind].input, 'x'.repeat(TYPICAL[kind].reply)) * 10) / 10);
    res.json({ model, credits: { sentence: cost('sentence'), speak: cost('speak'), paragraph: cost('paragraph'), scenario: cost('scenario') } });
  });

  return router;
}
