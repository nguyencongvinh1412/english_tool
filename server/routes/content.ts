/**
 * Content & AI Routes
 * Content bank (list, read, AI-generate), word definitions, and AI scoring for
 * writing and speaking. Scored attempts are recorded here, not by the client.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attempts, contentItems, type ContentItem, type User } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { GENERATE_TIMEOUT_MS, runAIJson, SCORING_TIMEOUT_MS } from '../services/ai.js';
import { recordAttempt } from '../services/progress.js';
import {
  CEFR_LEVELS,
  CONTENT_KINDS,
  CONTENT_KIND_IDS,
  WRITING_TASKS,
  contentTitle,
  isExamOnlyKind,
  speakingFeedback,
  speakingIelts,
  wordDefinition,
  writingFeedback,
  writingPrompt,
  type ContentKind,
} from '../content/schemas.js';
import { buildGenerationPrompt } from '../content/generators.js';
import { speakingScoringPrompt, writingScoringPrompt } from '../content/scoring.js';

const LIST_LIMIT = 60;
const MAX_RESPONSE_CHARS = 6000;
const MAX_TRANSCRIPT_CHARS = 2000;

/** Kinds the practice library serves; TOEIC exam groups are only reachable through exam sessions */
const LIBRARY_KINDS = CONTENT_KIND_IDS.filter((kind) => !isExamOnlyKind(kind)) as [ContentKind, ...ContentKind[]];

const listQuerySchema = z.object({
  kind: z.enum(LIBRARY_KINDS),
  level: z.enum(CEFR_LEVELS).optional(),
  writingTask: z.enum(WRITING_TASKS).optional(),
});

const generateSchema = z.object({
  kind: z.enum(LIBRARY_KINDS),
  level: z.enum(CEFR_LEVELS),
  topic: z.string().trim().max(100).optional(),
  writingTask: z.enum(WRITING_TASKS).optional(),
  model: z.string().max(100).optional(),
});

const defineSchema = z.object({
  word: z.string().trim().min(1).max(60),
  sentence: z.string().trim().max(500).optional(),
  model: z.string().max(100).optional(),
});

const scoreWritingSchema = z.object({
  contentId: z.string().min(1).max(100),
  response: z.string().trim().min(20, 'Write a little more before submitting').max(MAX_RESPONSE_CHARS),
  durationSec: z.number().int().min(0).max(4 * 60 * 60).optional(),
  model: z.string().max(100).optional(),
});

const scoreSpeakingSchema = z.object({
  contentId: z.string().min(1).max(100),
  answers: z
    .array(z.object({ question: z.string().trim().min(1).max(400), transcript: z.string().trim().max(MAX_TRANSCRIPT_CHARS) }))
    .min(1)
    .max(12),
  durationSec: z.number().int().min(0).max(4 * 60 * 60).optional(),
  model: z.string().max(100).optional(),
});

/**
 * Item fields for lists (no payload)
 */
function toSummary(item: ContentItem, best: number | undefined) {
  return {
    id: item.id,
    kind: item.kind,
    level: item.level,
    title: item.title,
    topic: item.topic,
    exam: item.exam,
    part: item.part,
    source: item.source,
    createdAt: item.createdAt,
    best: best ?? null,
  };
}

/**
 * Loads a published item of an expected kind
 * @throws HttpError 404 if missing or of another kind
 */
async function loadItem(id: string, kind?: ContentKind): Promise<ContentItem> {
  const [item] = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.status, 'published')))
    .limit(1);

  if (!item || (kind && item.kind !== kind) || (!kind && isExamOnlyKind(item.kind))) {
    throw new HttpError(404, 'This exercise was not found.', 'not_found');
  }
  return item;
}

/** Feedback language follows the learner's UI language */
const localeOf = (user: User) => user.uiLocale;

/**
 * Creates the content router
 * @returns Router mounted at /api
 */
export function createContentRouter(): Router {
  const router = Router();

  /**
   * GET /content?kind=&level=&writingTask= - Published items with the caller's best score
   */
  router.get('/content', requireAuth, async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    const user = currentUser(req);

    const items = await db
      .select()
      .from(contentItems)
      .where(
        and(
          eq(contentItems.kind, query.kind),
          eq(contentItems.status, 'published'),
          query.level ? eq(contentItems.level, query.level) : undefined,
          query.writingTask ? sql`${contentItems.payload}->>'taskType' = ${query.writingTask}` : undefined
        )
      )
      // Built-in items first, then the newest generated ones
      .orderBy(sql`${contentItems.source} = 'builtin' desc`, desc(contentItems.createdAt))
      .limit(LIST_LIMIT);

    const bestRows = items.length
      ? await db
          .select({
            contentRef: attempts.contentRef,
            best: sql<number>`round(max(${attempts.score} / ${attempts.maxScore} * 100))::int`,
          })
          .from(attempts)
          .where(
            and(
              eq(attempts.userId, user.id),
              inArray(
                attempts.contentRef,
                items.map((item) => item.id)
              ),
              sql`${attempts.maxScore} > 0`
            )
          )
          .groupBy(attempts.contentRef)
      : [];
    const best = new Map(bestRows.map((row) => [row.contentRef, row.best]));

    res.json({ items: items.map((item) => toSummary(item, best.get(item.id))) });
  });

  /**
   * GET /content/:id - One item with its payload
   */
  router.get('/content/:id', requireAuth, async (req, res) => {
    const item = await loadItem(String(req.params.id));
    res.json({ item: { ...toSummary(item, undefined), payload: item.payload } });
  });

  /**
   * POST /content/generate - Ask the AI for a new item and add it to the shared bank
   */
  router.post('/content/generate', requireAuth, limitAiRequests, async (req, res) => {
    const body = generateSchema.parse(req.body);
    const user = currentUser(req);
    const definition = CONTENT_KINDS[body.kind];
    const prompt = buildGenerationPrompt(body.kind, body.level, body.topic, body.writingTask);

    const payload = await runAIJson(
      user,
      {
        feature: 'generate',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        model: body.model,
        timeoutMs: GENERATE_TIMEOUT_MS,
      },
      definition.schema
    );

    // Writing generation must return the requested task type
    if (body.kind === 'writing-prompt' && body.writingTask && 'taskType' in payload && payload.taskType !== body.writingTask) {
      throw new HttpError(502, 'The AI returned a different task type. Please try again.', 'ai_invalid_output');
    }

    const title = contentTitle(body.kind, payload);
    const [item] = await db
      .insert(contentItems)
      .values({
        kind: body.kind,
        skill: definition.skill,
        exam: prompt.target.exam,
        part: prompt.target.part,
        level: body.level,
        title,
        topic: body.topic ?? null,
        payload,
        source: 'ai',
        createdBy: user.id,
      })
      .returning();

    res.status(201).json({ item: { ...toSummary(item, undefined), payload: item.payload } });
  });

  /**
   * POST /ai/define - Learner-friendly definition of a word in context
   */
  router.post('/ai/define', requireAuth, limitAiRequests, async (req, res) => {
    const body = defineSchema.parse(req.body);
    const user = currentUser(req);
    const vietnamese = localeOf(user) === 'vi';

    const definition = await runAIJson(
      user,
      {
        feature: 'define',
        model: body.model,
        system: `You are a concise English dictionary for Vietnamese learners. Explain the word as it is used in the sentence.
${vietnamese ? 'Write "meaning" in simple English and "translation" in Vietnamese.' : 'Write "meaning" in simple English and "translation" as an empty string.'}
Respond with ONLY one JSON object.`,
        messages: [
          {
            role: 'user',
            content: `Word: ${body.word}\nSentence: ${body.sentence ?? '(none)'}\nJSON: {"word": "base form", "partOfSpeech": "noun", "ipa": "/.../", "meaning": "...", "example": "a new example sentence", "translation": "..."}`,
          },
        ],
      },
      wordDefinition
    );

    res.json({ definition });
  });

  /**
   * POST /ai/score-writing - Band-score a writing response and record the attempt
   */
  router.post('/ai/score-writing', requireAuth, limitAiRequests, async (req, res) => {
    const body = scoreWritingSchema.parse(req.body);
    const user = currentUser(req);
    const item = await loadItem(body.contentId, 'writing-prompt');
    const task = writingPrompt.parse(item.payload);
    const prompt = writingScoringPrompt(task, body.response, localeOf(user));

    const feedback = await runAIJson(
      user,
      {
        feature: 'score-writing',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        model: body.model,
        timeoutMs: SCORING_TIMEOUT_MS,
      },
      writingFeedback
    );

    const words = body.response.split(/\s+/).filter(Boolean).length;
    const result = await recordAttempt(user.id, {
      activity: 'writing-task',
      contentRef: item.id,
      title: item.title,
      score: feedback.overallBand,
      maxScore: 9,
      durationSec: body.durationSec,
      details: { taskType: task.taskType, words, response: body.response, feedback },
    });

    res.json({ feedback, ...result });
  });

  /**
   * POST /ai/score-speaking - Band-score IELTS speaking transcripts and record the attempt
   */
  router.post('/ai/score-speaking', requireAuth, limitAiRequests, async (req, res) => {
    const body = scoreSpeakingSchema.parse(req.body);
    const user = currentUser(req);
    const item = await loadItem(body.contentId, 'speaking-ielts');
    const set = speakingIelts.parse(item.payload);

    if (body.answers.every((a) => !a.transcript)) {
      throw new HttpError(400, 'Answer at least one question before asking for a score.', 'empty_answers');
    }

    const prompt = speakingScoringPrompt(set, body.answers, localeOf(user));
    const feedback = await runAIJson(
      user,
      {
        feature: 'score-speaking',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        model: body.model,
        timeoutMs: SCORING_TIMEOUT_MS,
      },
      speakingFeedback
    );

    const result = await recordAttempt(user.id, {
      activity: 'speaking-ielts',
      contentRef: item.id,
      title: set.topic,
      score: feedback.overallBand,
      maxScore: 9,
      durationSec: body.durationSec,
      details: { answers: body.answers, feedback },
    });

    res.json({ feedback, ...result });
  });

  return router;
}
