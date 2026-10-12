/**
 * Word Bank Routes
 * English words a learner saves (reviewed as their own deck), the match game, AI feedback on a sentence
 * using a word, and vocabulary statistics
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { srsCards, vocabItems, wordBank } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { runAIJson } from '../services/ai.js';
import { enWordId, toPublicItem } from '../vocab/data.js';
import { MASTERED_DAYS } from '../vocab/srs.js';
import { statusOf } from './vocab.js';

const MATCH_PAIRS = 6;
/** Cards forgotten this often count as hard words */
const LEECH_LAPSES = 3;
const FORECAST_DAYS = 7;

const saveSchema = z.object({
  word: z.string().trim().min(1).max(60),
  partOfSpeech: z.string().trim().max(40).optional(),
  ipa: z.string().trim().max(80).optional(),
  meaning: z.string().trim().max(300).optional(),
  translation: z.string().trim().max(300).optional(),
  example: z.string().trim().max(300).optional(),
  context: z.string().trim().max(500).optional(),
  source: z.enum(['reading', 'listening', 'manual']).default('manual'),
});

const sentenceSchema = z.object({
  itemId: z.string().min(3).max(200),
  sentence: z.string().trim().min(3).max(400),
  model: z.string().max(100).optional(),
});

const sentenceFeedback = z.object({
  correct: z.boolean(),
  /** Short comment in the learner's language */
  feedback: z.string().trim().min(1).max(600),
  /** The sentence fixed or made more natural (same as the input when it is already good) */
  improved: z.string().trim().max(400),
});

const POS = /^(noun|verb|adjective|adverb|preposition|conjunction|pronoun|determiner|interjection|phrasal verb|phrase)$/i;

/**
 * Creates the word bank router
 * @returns Router mounted at /api
 */
export function createWordBankRouter(): Router {
  const router = Router();

  /**
   * GET /vocab/en/bank - Saved words, newest first, with the learner's progress
   */
  router.get('/vocab/en/bank', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const rows = await db
      .select({ item: vocabItems, saved: wordBank, card: srsCards })
      .from(wordBank)
      .innerJoin(vocabItems, eq(vocabItems.id, wordBank.itemId))
      .leftJoin(srsCards, and(eq(srsCards.itemId, wordBank.itemId), eq(srsCards.userId, user.id)))
      .where(eq(wordBank.userId, user.id))
      .orderBy(desc(wordBank.createdAt));
    const now = Date.now();
    res.json({
      words: rows.map(({ item, saved, card }) => ({
        ...toPublicItem(item),
        status: statusOf(card),
        source: saved.source,
        context: saved.context,
        savedAt: saved.createdAt,
      })),
      due: rows.filter((r) => !r.card || r.card.dueAt.getTime() <= now).length,
    });
  });

  /**
   * POST /vocab/en/bank - Save a word (from a definition the learner looked up). Words outside the
   * word lists get their own entry; a missing Vietnamese meaning is filled in from the lookup.
   */
  router.post('/vocab/en/bank', requireAuth, async (req, res) => {
    const body = saveSchema.parse(req.body);
    const user = currentUser(req);
    const word = body.word.toLowerCase().replace(/[^a-z' -]/g, '').trim();
    if (!word) throw new HttpError(400, 'This is not an English word.', 'bad_word');
    const id = enWordId(word);

    const [existing] = await db.select().from(vocabItems).where(eq(vocabItems.id, id)).limit(1);
    if (!existing) {
      if (!body.meaning) throw new HttpError(400, 'Look the word up before saving it.', 'needs_definition');
      await db.insert(vocabItems).values({
        id,
        kind: 'word',
        language: 'en',
        level: '',
        position: 0,
        term: word,
        pos: body.partOfSpeech && POS.test(body.partOfSpeech) ? body.partOfSpeech.toLowerCase() : null,
        ipa: body.ipa?.replace(/^\/|\/$/g, '') || null,
        meaningsEn: [body.meaning],
        meaningVi: body.translation || null,
        example: body.example || null,
      });
    } else if (!existing.meaningVi && body.translation) {
      await db.update(vocabItems).set({ meaningVi: body.translation, updatedAt: new Date() }).where(eq(vocabItems.id, id));
    }

    await db
      .insert(wordBank)
      .values({ userId: user.id, itemId: id, source: body.source, context: body.context || null })
      .onConflictDoNothing();
    const [item] = await db.select().from(vocabItems).where(eq(vocabItems.id, id));
    res.status(201).json({ word: toPublicItem(item) });
  });

  /**
   * DELETE /vocab/en/bank/:itemId - Remove a saved word (its review history stays)
   */
  router.delete('/vocab/en/bank/:itemId', requireAuth, async (req, res) => {
    await db.delete(wordBank).where(and(eq(wordBank.userId, currentUser(req).id), eq(wordBank.itemId, String(req.params.itemId))));
    res.status(204).end();
  });

  /**
   * GET /vocab/en/match - Word-meaning pairs for the match game, from words the learner has met
   */
  router.get('/vocab/en/match', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const seen = await db
      .select({ item: vocabItems })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(and(eq(srsCards.userId, user.id), eq(vocabItems.language, 'en')))
      .orderBy(sql`random()`)
      .limit(MATCH_PAIRS);
    // Learners who have met few words play with common translated ones
    const extra =
      seen.length < MATCH_PAIRS
        ? await db
            .select({ item: vocabItems })
            .from(vocabItems)
            .where(and(eq(vocabItems.language, 'en'), isNotNull(vocabItems.meaningVi), eq(vocabItems.deck, 'en-core-A1')))
            .orderBy(sql`random()`)
            .limit(MATCH_PAIRS * 2)
        : [];
    const items = [...seen, ...extra.filter((e) => !seen.some((s) => s.item.id === e.item.id))].slice(0, MATCH_PAIRS).map((r) => r.item);
    // One language for every meaning, so it cannot give pairs away
    const vietnamese = items.every((item) => item.meaningVi);
    res.json({
      pairs: items.map((item) => ({ id: item.id, term: item.term, meaning: vietnamese ? item.meaningVi! : (item.meaningsEn[0] ?? '') })),
    });
  });

  /**
   * POST /vocab/en/sentence - AI feedback on a sentence the learner wrote with a word
   */
  router.post('/vocab/en/sentence', requireAuth, limitAiRequests, async (req, res) => {
    const body = sentenceSchema.parse(req.body);
    const user = currentUser(req);
    const [item] = await db.select().from(vocabItems).where(eq(vocabItems.id, body.itemId)).limit(1);
    if (!item || item.language !== 'en') throw new HttpError(404, 'Word not found.', 'not_found');

    const feedback = await runAIJson(
      user,
      {
        feature: 'vocab-sentence',
        model: body.model,
        system: `You are a friendly English teacher for Vietnamese learners. The learner wrote one sentence to practise a word.
Check that the word is used with the right meaning, form and grammar, and that the sentence sounds natural.
"correct": true when the word is used correctly (small slips elsewhere can still be true).
"feedback": 1-3 short sentences in ${user.uiLocale === 'vi' ? 'Vietnamese' : 'English'}: what is good, what to fix and why.
"improved": the sentence corrected or made more natural; repeat it unchanged when it is already good.
Respond with ONLY one JSON object: {"correct": true, "feedback": "...", "improved": "..."}`,
        messages: [
          {
            role: 'user',
            content: `Word: ${item.term} (${item.pos ?? 'word'}: ${item.meaningsEn[0] ?? item.meaningVi ?? ''})\nSentence: ${body.sentence}`,
          },
        ],
      },
      sentenceFeedback
    );
    res.json({ feedback });
  });

  /**
   * GET /vocab/en/stats - Words met and mastered per CEFR level, reviews due in the next days, hard words
   */
  router.get('/vocab/en/stats', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const mine = and(eq(srsCards.userId, user.id), eq(vocabItems.language, 'en'));

    const byLevel = await db
      .select({
        level: vocabItems.level,
        total: sql<number>`count(*)::int`,
        seen: sql<number>`count(${srsCards.itemId})::int`,
        mastered: sql<number>`count(*) filter (where ${srsCards.state} = 'review' and ${srsCards.intervalDays} >= ${MASTERED_DAYS})::int`,
      })
      .from(vocabItems)
      .leftJoin(srsCards, and(eq(srsCards.itemId, vocabItems.id), eq(srsCards.userId, user.id)))
      .where(and(eq(vocabItems.language, 'en'), sql`${vocabItems.level} <> ''`))
      .groupBy(vocabItems.level)
      .orderBy(vocabItems.level);

    // Due reviews per day in Vietnam time; overdue ones count for today
    const forecast = await db
      .select({
        day: sql<number>`greatest(0, (${srsCards.dueAt} at time zone 'Asia/Ho_Chi_Minh')::date - (now() at time zone 'Asia/Ho_Chi_Minh')::date)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(and(mine, sql`${srsCards.dueAt} < now() + make_interval(days => ${FORECAST_DAYS})`))
      .groupBy(sql`1`);

    const hard = await db
      .select({ item: vocabItems, card: srsCards })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(and(mine, gte(srsCards.lapses, LEECH_LAPSES)))
      .orderBy(desc(srsCards.lapses))
      .limit(20);

    const [totals] = await db
      .select({
        seen: sql<number>`count(*)::int`,
        mastered: sql<number>`count(*) filter (where ${srsCards.state} = 'review' and ${srsCards.intervalDays} >= ${MASTERED_DAYS})::int`,
      })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(mine);
    const [{ saved }] = await db.select({ saved: sql<number>`count(*)::int` }).from(wordBank).where(eq(wordBank.userId, user.id));

    res.json({
      totals: { ...totals, saved },
      byLevel,
      forecast: Array.from({ length: FORECAST_DAYS }, (_, day) => forecast.filter((f) => f.day === day).reduce((n, f) => n + f.count, 0)),
      hard: hard.map(({ item, card }) => ({ ...toPublicItem(item), lapses: card.lapses })),
    });
  });

  return router;
}
