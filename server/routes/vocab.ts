/**
 * Vocabulary Routes
 * Japanese kanji and word flashcards with spaced repetition, a browsable list,
 * and an admin action that adds Vietnamese meanings with the AI
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, gte, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client.js';
import { srsCards, vocabItems, type SrsCard, type VocabItem } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { runAIJson } from '../services/ai.js';
import { quotaDay } from '../services/aiAccess.js';
import { jaText } from '../content/schemas.js';
import { GRADES, MASTERED_DAYS, NEW_CARD, previews, schedule, type CardState } from '../vocab/srs.js';
import { enDataVersion, enDecks, toPublicItem, vocabDataVersion, wordHanViet } from '../vocab/data.js';

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
const enDeckSchema = z.object({ deck: z.string().regex(/^en-[a-z]+-[A-Za-z0-9]+$/) });
const enBrowseSchema = enDeckSchema.extend({ offset: z.coerce.number().int().min(0).default(0) });
const reviewSchema = z.object({ itemId: z.string().min(3).max(200), grade: z.enum(GRADES) });
const browseSchema = deckSchema.extend({ offset: z.coerce.number().int().min(0).default(0) });
const enrichOptions = { count: z.number().int().min(1).max(60).default(40), model: z.string().max(100).optional() };
const enrichSchema = z.union([deckSchema.extend(enrichOptions), enDeckSchema.extend(enrichOptions)]);
/** Wrong choices offered with each English card */
const DISTRACTORS = 3;

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

/**
 * Due cards first, then today's new cards, for the deck matched by `inDeck`
 */
async function loadSession(userId: string, inDeck: SQL) {
  const now = new Date();
  const due = await db
    .select({ item: vocabItems, card: srsCards })
    .from(srsCards)
    .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
    .where(and(eq(srsCards.userId, userId), inDeck, lte(srsCards.dueAt, now)))
    .orderBy(asc(srsCards.dueAt))
    .limit(SESSION_DUE_LIMIT);

  const [{ newToday }] = await db
    .select({ newToday: sql<number>`count(*)::int` })
    .from(srsCards)
    .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
    .where(and(eq(srsCards.userId, userId), inDeck, gte(srsCards.introducedAt, startOfDay())));

  const fresh = await db
    .select()
    .from(vocabItems)
    .where(and(inDeck, sql`not exists (select 1 from ${srsCards} where ${srsCards.userId} = ${userId} and ${srsCards.itemId} = ${vocabItems.id})`))
    .orderBy(asc(vocabItems.position))
    .limit(Math.max(0, NEW_PER_DECK_PER_DAY - newToday));

  return { items: [...due.map((row) => row.item), ...fresh], cards: new Map(due.map((row) => [row.item.id, row.card])) };
}

/**
 * A page of a deck with the learner's status per card
 */
async function browseDeck(userId: string, inDeck: SQL, offset: number) {
  const rows = await db
    .select({ item: vocabItems, card: srsCards })
    .from(vocabItems)
    .leftJoin(srsCards, and(eq(srsCards.itemId, vocabItems.id), eq(srsCards.userId, userId)))
    .where(inDeck)
    .orderBy(asc(vocabItems.position))
    .offset(offset)
    .limit(BROWSE_LIMIT + 1);
  return { rows: rows.slice(0, BROWSE_LIMIT), nextOffset: rows.length > BROWSE_LIMIT ? offset + BROWSE_LIMIT : null };
}

const statusOf = (card: SrsCard | null) => (!card ? 'new' : card.state === 'review' && card.intervalDays >= MASTERED_DAYS ? 'mastered' : 'learning');

/** What a learner sees as the meaning of an English card */
const enMeaning = (item: VocabItem) => item.meaningVi ?? item.meaningsEn[0] ?? '';

/**
 * Progress per group key (deck, or kind + level) for one learner
 */
async function deckProgress(userId: string, keys: AnyPgColumn[], where: SQL) {
  const now = new Date();
  return db
    .select({
      key: sql<string>`concat_ws(':', ${sql.join(keys, sql`, `)})`,
      seen: sql<number>`count(*)::int`,
      due: sql<number>`count(*) filter (where ${srsCards.dueAt} <= ${now.toISOString()}::timestamptz)::int`,
      mastered: sql<number>`count(*) filter (where ${srsCards.state} = 'review' and ${srsCards.intervalDays} >= ${MASTERED_DAYS})::int`,
      newToday: sql<number>`count(*) filter (where ${srsCards.introducedAt} >= ${startOfDay().toISOString()}::timestamptz)::int`,
    })
    .from(srsCards)
    .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
    .where(and(eq(srsCards.userId, userId), where))
    .groupBy(...keys);
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

type User = Parameters<typeof runAIJson>[0];

/**
 * Vietnamese meanings for a chunk of Japanese cards
 * @returns Cards updated
 */
async function enrichJapanese(user: User, chunk: VocabItem[], kind: (typeof KINDS)[number], level: string, model?: string): Promise<number> {
  const reply = await runAIJson(
    user,
    {
      feature: 'vocab-enrich',
      model,
      timeoutMs: 120_000,
      system: `You write concise Vietnamese study notes for Japanese ${kind === 'kanji' ? 'kanji' : 'vocabulary'} (JLPT ${level}).
"meaningVi": the core Vietnamese meaning(s), short, separated by commas.
${
  kind === 'kanji'
    ? '"hanViet": the standard Sino-Vietnamese reading used in Vietnamese words, chosen from the given options (copy it exactly).\n"example": one common Japanese word that uses the kanji, written with its reading in braces, e.g. 学校{がっこう}; "exampleVi": its Vietnamese meaning.'
    : '"example": one short natural sentence at the level, every kanji followed by its hiragana reading in braces, e.g. 毎日{まいにち}勉強{べんきょう}します。; "exampleVi": its Vietnamese translation.'
}
Respond with ONLY one JSON object: {"items": [{"id": "...", ${kind === 'kanji' ? '"hanViet": "...", ' : ''}"meaningVi": "...", "example": "...", "exampleVi": "..."}]}`,
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
  let updated = 0;
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
  return updated;
}

/** Model output for English cards */
const enEnrichReply = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      meaningVi: z.string().trim().min(1).max(200),
      collocations: z.array(z.string().trim().min(1).max(60)).max(5).default([]),
      example: z.string().trim().max(200).optional(),
      exampleVi: z.string().trim().max(300).optional(),
    })
  ),
});

/**
 * Vietnamese meanings and collocations for a chunk of English cards
 * @returns Cards updated
 */
async function enrichEnglish(user: User, chunk: VocabItem[], model?: string): Promise<number> {
  const reply = await runAIJson(
    user,
    {
      feature: 'vocab-enrich',
      model,
      timeoutMs: 120_000,
      system: `You write concise Vietnamese study notes for English vocabulary, for Vietnamese learners.
"meaningVi": the Vietnamese meaning that matches the given part of speech and definition, short (several senses separated by commas).
"collocations": 2-4 very common collocations or phrases with the word (e.g. "make a decision", "decision to do sth").
Only when the word has no example: "example" = one short natural sentence (CEFR B1) using the word, and "exampleVi" = its Vietnamese translation.
Respond with ONLY one JSON object: {"items": [{"id": "...", "meaningVi": "...", "collocations": ["..."], "example": "...", "exampleVi": "..."}]}`,
      messages: [
        {
          role: 'user',
          content: chunk
            .map((item) => JSON.stringify({ id: item.id, word: item.term, pos: item.pos, definition: item.meaningsEn[0], hasExample: Boolean(item.example) }))
            .join('\n'),
        },
      ],
    },
    enEnrichReply
  );

  const byId = new Map(chunk.map((item) => [item.id, item]));
  let updated = 0;
  for (const entry of reply.items) {
    const item = byId.get(entry.id);
    if (!item) continue;
    // A generated example must use the word
    const example = !item.example && entry.example && entry.example.toLowerCase().includes(item.term.toLowerCase().slice(0, -1)) ? entry.example : null;
    await db
      .update(vocabItems)
      .set({
        meaningVi: entry.meaningVi,
        collocations: entry.collocations,
        ...(example && { example, exampleVi: entry.exampleVi ?? null }),
        updatedAt: new Date(),
      })
      .where(eq(vocabItems.id, item.id));
    updated++;
  }
  return updated;
}

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
    const isJa = eq(vocabItems.language, 'ja');
    const totals = await db
      .select({ kind: vocabItems.kind, level: vocabItems.level, total: sql<number>`count(*)::int` })
      .from(vocabItems)
      .where(isJa)
      .groupBy(vocabItems.kind, vocabItems.level);
    const progress = await deckProgress(user.id, [vocabItems.kind, vocabItems.level], isJa);

    const decks = LEVELS.flatMap((level) =>
      KINDS.map((kind) => {
        const total = totals.find((t) => t.kind === kind && t.level === level)?.total ?? 0;
        const p = progress.find((r) => r.key === `${kind}:${level}`);
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
    const { items, cards } = await loadSession(currentUser(req).id, and(eq(vocabItems.kind, kind), eq(vocabItems.level, level))!);
    res.json({ cards: await toSessionCards(items, cards) });
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
    const { rows, nextOffset } = await browseDeck(currentUser(req).id, and(eq(vocabItems.kind, kind), eq(vocabItems.level, level))!, offset);
    const hanViet = await wordHanViet(rows.map((r) => r.item));
    res.json({
      items: rows.map(({ item, card }) => ({ ...toPublicItem(item, hanViet.get(item.id)), status: statusOf(card) })),
      nextOffset,
    });
  });

  /**
   * GET /vocab/en/decks - English decks with the learner's progress
   */
  router.get('/vocab/en/decks', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const isEn = eq(vocabItems.language, 'en');
    const totals = await db
      .select({ deck: vocabItems.deck, total: sql<number>`count(*)::int`, translated: sql<number>`count(${vocabItems.meaningVi})::int` })
      .from(vocabItems)
      .where(isEn)
      .groupBy(vocabItems.deck);
    const progress = await deckProgress(user.id, [vocabItems.deck], isEn);
    const decks = enDecks.map((deck) => {
      const total = totals.find((t) => t.deck === deck.id)?.total ?? 0;
      const p = progress.find((r) => r.key === deck.id);
      const newAvailable = Math.min(Math.max(0, NEW_PER_DECK_PER_DAY - (p?.newToday ?? 0)), total - (p?.seen ?? 0));
      return { ...deck, total, seen: p?.seen ?? 0, due: p?.due ?? 0, mastered: p?.mastered ?? 0, newAvailable };
    });
    res.json({ decks, dueTotal: decks.reduce((sum, d) => sum + d.due, 0), source: enDataVersion });
  });

  /**
   * GET /vocab/en/session?deck= - Due cards then new ones, each with wrong choices from the same deck
   */
  router.get('/vocab/en/session', requireAuth, async (req, res) => {
    const { deck } = enDeckSchema.parse(req.query);
    const user = currentUser(req);
    const { items, cards } = await loadSession(user.id, eq(vocabItems.deck, deck));
    // Wrong choices: other words of the deck with a different meaning
    const pool = await db
      .select()
      .from(vocabItems)
      .where(and(eq(vocabItems.deck, deck), ne(vocabItems.meaningsEn, sql`'{}'`)))
      .orderBy(sql`random()`)
      .limit(60);
    const now = new Date();
    res.json({
      cards: items.map((item) => {
        const card = cards.get(item.id);
        // Translated words first when this one is translated, so all choices can be in the same language
        const others = pool
          .filter((other) => other.id !== item.id && enMeaning(other) && enMeaning(other) !== enMeaning(item))
          .sort((a, b) => (item.meaningVi ? Number(!a.meaningVi) - Number(!b.meaningVi) : 0) || Math.random() - 0.5)
          .slice(0, DISTRACTORS);
        return {
          item: toPublicItem(item),
          isNew: !card,
          reps: card?.reps ?? 0,
          lapses: card?.lapses ?? 0,
          previews: previews(cardState(card), now),
          distractors: others.map((other) => ({ term: other.term, meaningVi: other.meaningVi, meaningEn: other.meaningsEn[0] ?? '' })),
        };
      }),
    });
  });

  /**
   * GET /vocab/en/items?deck=&offset= - Browse an English deck
   */
  router.get('/vocab/en/items', requireAuth, async (req, res) => {
    const { deck, offset } = enBrowseSchema.parse(req.query);
    const { rows, nextOffset } = await browseDeck(currentUser(req).id, eq(vocabItems.deck, deck), offset);
    res.json({ items: rows.map(({ item, card }) => ({ ...toPublicItem(item), status: statusOf(card) })), nextOffset });
  });

  /**
   * GET /admin/vocab - How many cards per deck have Vietnamese meanings
   */
  router.get('/admin/vocab', requireAuth, requireRole('admin'), async (_req, res) => {
    const rows = await db
      .select({
        language: vocabItems.language,
        kind: vocabItems.kind,
        level: vocabItems.level,
        deck: vocabItems.deck,
        total: sql<number>`count(*)::int`,
        translated: sql<number>`count(${vocabItems.meaningVi})::int`,
      })
      .from(vocabItems)
      .groupBy(vocabItems.language, vocabItems.kind, vocabItems.level, vocabItems.deck);
    const order = (row: { kind: string; level: string }) => LEVELS.indexOf(row.level as (typeof LEVELS)[number]) * 2 + (row.kind === 'kanji' ? 0 : 1);
    const ja = rows.filter((r) => r.language === 'ja').sort((a, b) => order(a) - order(b));
    // English decks group by deck only (a deck holds several CEFR levels)
    const en = enDecks.map((deck) => {
      const own = rows.filter((r) => r.deck === deck.id);
      return { deck: deck.id, group: deck.group, label: deck.label, total: own.reduce((n, r) => n + r.total, 0), translated: own.reduce((n, r) => n + r.translated, 0) };
    });
    res.json({
      decks: ja.map(({ kind, level, total, translated }) => ({ kind, level, total, translated })),
      enDecks: en,
      source: vocabDataVersion,
      enSource: enDataVersion,
    });
  });

  /**
   * POST /admin/vocab/enrich - Add Vietnamese meanings with the AI: Japanese (with Sino-Vietnamese for kanji
   * and examples for words) or English (with collocations, and an example when the data has none)
   */
  router.post('/admin/vocab/enrich', requireAuth, requireRole('admin'), limitAiRequests, async (req, res) => {
    const body = enrichSchema.parse(req.body);
    const user = currentUser(req);
    const inDeck = 'deck' in body ? eq(vocabItems.deck, body.deck) : and(eq(vocabItems.kind, body.kind), eq(vocabItems.level, body.level))!;
    const items = await db
      .select()
      .from(vocabItems)
      .where(and(inDeck, isNull(vocabItems.meaningVi)))
      .orderBy(asc(vocabItems.position))
      .limit(body.count);

    let updated = 0;
    for (let i = 0; i < items.length; i += ENRICH_CHUNK) {
      const chunk = items.slice(i, i + ENRICH_CHUNK);
      updated += 'deck' in body ? await enrichEnglish(user, chunk, body.model) : await enrichJapanese(user, chunk, body.kind, body.level, body.model);
    }
    res.json({ updated, requested: items.length });
  });

  return router;
}
