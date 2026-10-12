/**
 * Vocabulary Routes
 * Japanese kanji and word flashcards with spaced repetition, a browsable list,
 * and an admin action that adds Vietnamese meanings with the AI
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { srsCards, vocabItems, type SrsCard, type VocabItem } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { runAIJson } from '../services/ai.js';
import { quotaDay } from '../services/aiAccess.js';
import { jaText } from '../content/schemas.js';
import { GRADES, MASTERED_DAYS, NEW_CARD, previews, schedule, type CardState } from '../vocab/srs.js';
import { toPublicItem, vocabDataVersion, wordHanViet } from '../vocab/data.js';

const KINDS = ['kanji', 'word'] as const;
const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
/** New cards a learner meets per deck per day */
const NEW_PER_DECK_PER_DAY = 10;
/** Most due cards loaded into one session */
const SESSION_DUE_LIMIT = 100;
const BROWSE_LIMIT = 60;
/** Items translated per AI call */
const ENRICH_CHUNK = 20;

const deckSchema = z.object({ kind: z.enum(KINDS), level: z.enum(LEVELS) });
const reviewSchema = z.object({ itemId: z.string().min(3).max(200), grade: z.enum(GRADES) });
const browseSchema = deckSchema.extend({ offset: z.coerce.number().int().min(0).default(0) });
const enrichSchema = deckSchema.extend({ count: z.number().int().min(1).max(60).default(40), model: z.string().max(100).optional() });

/**
 * Start of the learner's day (Vietnam time), for the daily new-card limit
 */
function startOfDay(): Date {
  return new Date(`${quotaDay()}T00:00:00+07:00`);
}

const cardState = (card: SrsCard | undefined): CardState =>
  card
    ? { state: card.state as CardState['state'], reps: card.reps, intervalDays: card.intervalDays, ease: card.ease, lapses: card.lapses }
    : NEW_CARD;

/**
 * Cards with Sino-Vietnamese readings and button previews
 */
async function toSessionCards(items: VocabItem[], cards: Map<string, SrsCard>) {
  const hanViet = await wordHanViet(items);
  const now = new Date();
  return items.map((item) => {
    const card = cards.get(item.id);
    return { item: toPublicItem(item, hanViet.get(item.id)), isNew: !card, previews: previews(cardState(card), now) };
  });
}

/** Model output for one batch of Vietnamese meanings */
const enrichReply = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      hanViet: z.string().trim().max(40).optional(),
      meaningVi: z.string().trim().min(1).max(200),
      example: z.string().trim().max(200).optional(),
      exampleVi: z.string().trim().max(300).optional(),
    })
  ),
});

/**
 * Creates the vocabulary router
 * @returns Router mounted at /api
 */
export function createVocabRouter(): Router {
  const router = Router();

  /**
   * GET /vocab/decks - Every deck with the learner's progress
   */
  router.get('/vocab/decks', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const now = new Date();
    const totals = await db
      .select({ kind: vocabItems.kind, level: vocabItems.level, total: sql<number>`count(*)::int` })
      .from(vocabItems)
      .groupBy(vocabItems.kind, vocabItems.level);
    const progress = await db
      .select({
        kind: vocabItems.kind,
        level: vocabItems.level,
        seen: sql<number>`count(*)::int`,
        due: sql<number>`count(*) filter (where ${srsCards.dueAt} <= ${now.toISOString()}::timestamptz)::int`,
        mastered: sql<number>`count(*) filter (where ${srsCards.state} = 'review' and ${srsCards.intervalDays} >= ${MASTERED_DAYS})::int`,
        newToday: sql<number>`count(*) filter (where ${srsCards.introducedAt} >= ${startOfDay().toISOString()}::timestamptz)::int`,
      })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(eq(srsCards.userId, user.id))
      .groupBy(vocabItems.kind, vocabItems.level);

    const decks = LEVELS.flatMap((level) =>
      KINDS.map((kind) => {
        const total = totals.find((t) => t.kind === kind && t.level === level)?.total ?? 0;
        const p = progress.find((r) => r.kind === kind && r.level === level);
        const newAvailable = Math.min(Math.max(0, NEW_PER_DECK_PER_DAY - (p?.newToday ?? 0)), total - (p?.seen ?? 0));
        return { kind, level, total, seen: p?.seen ?? 0, due: p?.due ?? 0, mastered: p?.mastered ?? 0, newAvailable };
      })
    );
    res.json({ decks, dueTotal: decks.reduce((sum, d) => sum + d.due, 0), source: vocabDataVersion });
  });

  /**
   * GET /vocab/session?kind=&level= - Due cards first, then today's new cards
   */
  router.get('/vocab/session', requireAuth, async (req, res) => {
    const { kind, level } = deckSchema.parse(req.query);
    const user = currentUser(req);
    const now = new Date();

    const due = await db
      .select({ item: vocabItems, card: srsCards })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(and(eq(srsCards.userId, user.id), eq(vocabItems.kind, kind), eq(vocabItems.level, level), lte(srsCards.dueAt, now)))
      .orderBy(asc(srsCards.dueAt))
      .limit(SESSION_DUE_LIMIT);

    const [{ newToday }] = await db
      .select({ newToday: sql<number>`count(*)::int` })
      .from(srsCards)
      .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
      .where(and(eq(srsCards.userId, user.id), eq(vocabItems.kind, kind), eq(vocabItems.level, level), gte(srsCards.introducedAt, startOfDay())));

    const fresh = await db
      .select()
      .from(vocabItems)
      .where(
        and(
          eq(vocabItems.kind, kind),
          eq(vocabItems.level, level),
          sql`not exists (select 1 from ${srsCards} where ${srsCards.userId} = ${user.id} and ${srsCards.itemId} = ${vocabItems.id})`
        )
      )
      .orderBy(asc(vocabItems.position))
      .limit(Math.max(0, NEW_PER_DECK_PER_DAY - newToday));

    const cards = new Map(due.map((row) => [row.item.id, row.card]));
    res.json({ cards: await toSessionCards([...due.map((row) => row.item), ...fresh], cards) });
  });

  /**
   * POST /vocab/review - Grade one card; returns when it is due again
   */
  router.post('/vocab/review', requireAuth, async (req, res) => {
    const body = reviewSchema.parse(req.body);
    const user = currentUser(req);
    const [item] = await db.select({ id: vocabItems.id }).from(vocabItems).where(eq(vocabItems.id, body.itemId)).limit(1);
    if (!item) throw new HttpError(404, 'Card not found.', 'not_found');

    const [existing] = await db
      .select()
      .from(srsCards)
      .where(and(eq(srsCards.userId, user.id), eq(srsCards.itemId, item.id)))
      .limit(1);
    const now = new Date();
    const next = schedule(cardState(existing), body.grade, now);
    const values = {
      state: next.state,
      dueAt: next.dueAt,
      intervalDays: next.intervalDays,
      ease: next.ease,
      reps: next.reps,
      lapses: next.lapses,
      lastReviewedAt: now,
    };

    await db
      .insert(srsCards)
      .values({ userId: user.id, itemId: item.id, ...values })
      .onConflictDoUpdate({ target: [srsCards.userId, srsCards.itemId], set: values });

    res.json({ dueAt: next.dueAt, state: next.state, intervalDays: next.intervalDays, previews: previews(next, now) });
  });

  /**
   * GET /vocab/items?kind=&level=&offset= - Browse a deck with the learner's status
   */
  router.get('/vocab/items', requireAuth, async (req, res) => {
    const { kind, level, offset } = browseSchema.parse(req.query);
    const user = currentUser(req);
    const rows = await db
      .select({ item: vocabItems, card: srsCards })
      .from(vocabItems)
      .leftJoin(srsCards, and(eq(srsCards.itemId, vocabItems.id), eq(srsCards.userId, user.id)))
      .where(and(eq(vocabItems.kind, kind), eq(vocabItems.level, level)))
      .orderBy(asc(vocabItems.position))
      .offset(offset)
      .limit(BROWSE_LIMIT + 1);

    const page = rows.slice(0, BROWSE_LIMIT);
    const hanViet = await wordHanViet(page.map((r) => r.item));
    res.json({
      items: page.map(({ item, card }) => ({
        ...toPublicItem(item, hanViet.get(item.id)),
        status: !card ? 'new' : card.state === 'review' && card.intervalDays >= MASTERED_DAYS ? 'mastered' : 'learning',
      })),
      nextOffset: rows.length > BROWSE_LIMIT ? offset + BROWSE_LIMIT : null,
    });
  });

  /**
   * GET /admin/vocab - How many cards per deck have Vietnamese meanings
   */
  router.get('/admin/vocab', requireAuth, requireRole('admin'), async (_req, res) => {
    const rows = await db
      .select({
        kind: vocabItems.kind,
        level: vocabItems.level,
        total: sql<number>`count(*)::int`,
        translated: sql<number>`count(${vocabItems.meaningVi})::int`,
      })
      .from(vocabItems)
      .groupBy(vocabItems.kind, vocabItems.level);
    const order = (row: { kind: string; level: string }) => LEVELS.indexOf(row.level as (typeof LEVELS)[number]) * 2 + (row.kind === 'kanji' ? 0 : 1);
    res.json({ decks: rows.sort((a, b) => order(a) - order(b)), source: vocabDataVersion });
  });

  /**
   * POST /admin/vocab/enrich - Add Vietnamese meanings (and Sino-Vietnamese for kanji, examples for words) with the AI
   */
  router.post('/admin/vocab/enrich', requireAuth, requireRole('admin'), limitAiRequests, async (req, res) => {
    const body = enrichSchema.parse(req.body);
    const user = currentUser(req);
    const items = await db
      .select()
      .from(vocabItems)
      .where(and(eq(vocabItems.kind, body.kind), eq(vocabItems.level, body.level), isNull(vocabItems.meaningVi)))
      .orderBy(asc(vocabItems.position))
      .limit(body.count);

    let updated = 0;
    for (let i = 0; i < items.length; i += ENRICH_CHUNK) {
      const chunk = items.slice(i, i + ENRICH_CHUNK);
      const reply = await runAIJson(
        user,
        {
          feature: 'vocab-enrich',
          model: body.model,
          timeoutMs: 120_000,
          system: `You write concise Vietnamese study notes for Japanese ${body.kind === 'kanji' ? 'kanji' : 'vocabulary'} (JLPT ${body.level}).
"meaningVi": the core Vietnamese meaning(s), short, separated by commas.
${
  body.kind === 'kanji'
    ? '"hanViet": the standard Sino-Vietnamese reading used in Vietnamese words, chosen from the given options (copy it exactly).\n"example": one common Japanese word that uses the kanji, written with its reading in braces, e.g. 学校{がっこう}; "exampleVi": its Vietnamese meaning.'
    : '"example": one short natural sentence at the level, every kanji followed by its hiragana reading in braces, e.g. 毎日{まいにち}勉強{べんきょう}します。; "exampleVi": its Vietnamese translation.'
}
Respond with ONLY one JSON object: {"items": [{"id": "...", ${body.kind === 'kanji' ? '"hanViet": "...", ' : ''}"meaningVi": "...", "example": "...", "exampleVi": "..."}]}`,
          messages: [
            {
              role: 'user',
              content: chunk
                .map((item) =>
                  JSON.stringify({
                    id: item.id,
                    term: item.term,
                    ...(item.reading && { reading: item.reading }),
                    ...(item.kind === 'kanji' && { on: item.readingsOn, kun: item.readingsKun, options: item.hanVietOptions }),
                    english: item.meaningsEn.slice(0, 4).join('; '),
                  })
                )
                .join('\n'),
            },
          ],
        },
        enrichReply
      );

      const byId = new Map(chunk.map((item) => [item.id, item]));
      for (const entry of reply.items) {
        const item = byId.get(entry.id);
        if (!item) continue;
        // Sino-Vietnamese must be one of the dictionary's readings, so the AI cannot invent one
        const option = item.hanVietOptions?.find((o) => o.toLowerCase() === entry.hanViet?.toLowerCase());
        const example = entry.example && jaText(200).safeParse(entry.example).success ? entry.example : null;
        await db
          .update(vocabItems)
          .set({
            meaningVi: entry.meaningVi,
            ...(item.kind === 'kanji' && { hanViet: option ?? item.hanVietOptions?.[0] ?? null }),
            example,
            exampleVi: example ? (entry.exampleVi ?? null) : null,
            updatedAt: new Date(),
          })
          .where(eq(vocabItems.id, item.id));
        updated++;
      }
    }

    res.json({ updated, requested: items.length });
  });

  return router;
}
