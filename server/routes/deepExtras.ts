/**
 * Deep Word extras: a situation to react to, examples about the learner's own life, and what each kind of exercise costs
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deepWordAttempts, deepWordLinks, deepWordProgress, vocabItems } from '../db/schema.js';
import { currentUser, limitAiRequests, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { estimateCredits } from '../billing/pricing.js';
import { resolveModel } from '../services/aiAccess.js';
import { runAIJson } from '../services/ai.js';
import { enWordId } from '../vocab/data.js';
import { findContent } from '../deepword/content.js';
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

  /** PUT /deep/note - The learner's own note on a word (a memory trick, a link to their life) */
  router.put('/deep/note', requireAuth, async (req, res) => {
    const input = z.object({ itemId, note: z.string().trim().max(500) }).parse(req.body);
    const updated = await db
      .update(deepWordProgress)
      .set({ note: input.note || null, updatedAt: new Date() })
      .where(and(eq(deepWordProgress.userId, currentUser(req).id), eq(deepWordProgress.itemId, input.itemId)))
      .returning({ id: deepWordProgress.itemId });
    if (updated.length === 0) throw new HttpError(404, 'Study this word first.', 'not_started');
    res.status(204).end();
  });

  /**
   * GET /deep/network/:itemId - A word and the words around it: its family, similar words, words it is confused with
   * and the words the learner connected, each with how deep the learner knows it
   */
  router.get('/deep/network/:itemId', requireAuth, async (req, res) => {
    const id = itemId.parse(req.params.itemId);
    const user = currentUser(req);
    const [item] = await db.select().from(vocabItems).where(eq(vocabItems.id, id)).limit(1);
    if (!item || item.language !== 'en') throw new HttpError(404, 'Word not found.', 'not_found');
    const content = await findContent(id);

    type Kind = 'family' | 'synonym' | 'contrast' | 'related';
    const found = new Map<string, { term: string; kind: Kind }>();
    const add = (term: string, kind: Kind) => {
      const clean = term.toLowerCase().trim();
      if (!/^[a-z][a-z' -]{0,38}$/.test(clean) || clean === item.term.toLowerCase()) return;
      // A word keeps the closest relation it has: connected by the learner, then similar, confused, family
      const rank: Kind[] = ['related', 'synonym', 'contrast', 'family'];
      const key = enWordId(clean);
      const have = found.get(key);
      if (!have || rank.indexOf(kind) < rank.indexOf(have.kind)) found.set(key, { term: clean, kind });
    };
    for (const w of content?.wordFamily ?? []) add(w, 'family');
    for (const c of (content?.contrast ?? []) as { word: string }[]) add(c.word, 'contrast');
    for (const w of content?.synonyms ?? []) add(w, 'synonym');

    const links = await db
      .select({ from: deepWordLinks.fromItem, to: deepWordLinks.toItem })
      .from(deepWordLinks)
      .where(and(eq(deepWordLinks.userId, user.id), or(eq(deepWordLinks.fromItem, id), eq(deepWordLinks.toItem, id))));
    for (const l of links) {
      const other = l.from === id ? l.to : l.from;
      add(other.replace(/^en:/, ''), 'related');
    }

    const ids = [id, ...found.keys()];
    const [words, progress] = await Promise.all([
      db.select().from(vocabItems).where(inArray(vocabItems.id, ids)),
      db.select().from(deepWordProgress).where(and(eq(deepWordProgress.userId, user.id), inArray(deepWordProgress.itemId, ids))),
    ]);
    const exists = new Set(words.map((w) => w.id));
    const stageOf = new Map(progress.map((p) => [p.itemId, p.stage]));
    const node = (nodeId: string, term: string) => ({ id: nodeId, term, exists: exists.has(nodeId), studied: stageOf.has(nodeId), stage: stageOf.get(nodeId) ?? null });

    res.json({
      center: node(id, item.term),
      nodes: [...found].map(([nodeId, f]) => ({ ...node(nodeId, f.term), kind: f.kind })),
    });
  });

  /** GET /deep/export - The notebook as CSV (term, pronunciation, meaning, notes, the learner's sentences), for Anki or a spreadsheet */
  router.get('/deep/export', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const rows = await db
      .select({ item: vocabItems, progress: deepWordProgress })
      .from(deepWordProgress)
      .innerJoin(vocabItems, eq(vocabItems.id, deepWordProgress.itemId))
      .where(eq(deepWordProgress.userId, user.id))
      .orderBy(asc(deepWordProgress.stage), desc(deepWordProgress.updatedAt));
    const sentences = await db
      .select({ id: deepWordAttempts.itemId, text: deepWordAttempts.userText })
      .from(deepWordAttempts)
      .where(and(eq(deepWordAttempts.userId, user.id), eq(deepWordAttempts.kind, 'sentence'), eq(deepWordAttempts.result, 'pass')))
      .orderBy(desc(deepWordAttempts.createdAt));
    const mine = new Map<string, string>();
    for (const s of sentences) if (s.text && !mine.has(s.id)) mine.set(s.id, s.text);

    // A cell that starts with = + - @ could run as a formula in a spreadsheet, so it gets a leading apostrophe
    const cell = (value: string | null | undefined) => {
      const text = (value ?? '').replace(/\r?\n/g, ' ');
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [['word', 'ipa', 'part of speech', 'meaning', 'definition', 'stage', 'my note', 'my sentence'].map(cell).join(',')];
    for (const { item, progress } of rows) {
      lines.push([item.term, item.ipa ? `/${item.ipa}/` : '', item.pos, item.meaningVi ?? item.meaningsEn[0], item.meaningsEn[0], String(progress.stage), progress.note, mine.get(item.id)].map(cell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="deep-words.csv"');
    res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
  });

  return router;
}
