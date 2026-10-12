import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { srsCards, vocabItems } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureJaVocab } from '../vocab/data.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

/** Two kanji and twelve N5 words (more than the daily new-card limit) */
const DATA = {
  version: { kanjidic: 'test', built: '2026-10-12' },
  kanji: [
    { c: '勉', level: 'N5', strokes: 10, on: ['ベン'], kun: ['つと.める'], meanings: ['exertion'], vietnamese: ['Miễn'] },
    { c: '強', level: 'N5', strokes: 11, on: ['キョウ'], kun: ['つよ.い'], meanings: ['strong'], vietnamese: ['Càng', 'Cường', 'Cưỡng'] },
  ],
  words: [
    { w: '勉強', r: 'べんきょう', m: 'study', level: 'N5' },
    ...Array.from({ length: 11 }, (_, i) => ({ w: `語${i}`, r: `ご${i}`, m: `word ${i}`, level: 'N5' })),
  ],
};
let dataFile = '';

beforeAll(async () => {
  await runMigrations();
  dataFile = path.join(await mkdtemp(path.join(tmpdir(), 'vocab-')), 'vocab-data.json');
  await writeFile(dataFile, JSON.stringify(DATA));
});
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
  await ensureJaVocab(dataFile);
});
afterAll(closeDb);

describe('vocabulary flashcards', () => {
  it('offers up to ten new cards a day per deck and schedules answers', async () => {
    const agent = await signIn(app, await createUser());
    const session = (await agent.get('/api/vocab/session?kind=word&level=N5')).body.cards;
    expect(session).toHaveLength(10);
    expect(session[0]).toMatchObject({ isNew: true, item: { term: '勉強', reading: 'べんきょう' } });
    expect(session[0].previews).toEqual({ again: 1, hard: 6, good: 10, easy: 5760 });

    const graded = await agent.post('/api/vocab/review').send({ itemId: session[0].item.id, grade: 'easy' });
    expect(graded.body).toMatchObject({ state: 'review', intervalDays: 4 });
    await agent.post('/api/vocab/review').send({ itemId: session[1].item.id, grade: 'again' });

    const decks = (await agent.get('/api/vocab/decks')).body.decks;
    expect(decks.find((d: { kind: string; level: string }) => d.kind === 'word' && d.level === 'N5')).toMatchObject({
      total: 12,
      seen: 2,
      due: 0,
      newAvailable: 8,
    });

    // Introduced cards count against today's limit even if they are not due yet
    const later = (await agent.get('/api/vocab/session?kind=word&level=N5')).body.cards;
    expect(later.filter((c: { isNew: boolean }) => c.isNew)).toHaveLength(8);
  });

  it('brings a forgotten card back after its short step', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    const [first] = (await agent.get('/api/vocab/session?kind=kanji&level=N5')).body.cards;
    await agent.post('/api/vocab/review').send({ itemId: first.item.id, grade: 'again' });
    await db.update(srsCards).set({ dueAt: new Date(Date.now() - 1000) }).where(eq(srsCards.userId, user.id));
    const again = (await agent.get('/api/vocab/session?kind=kanji&level=N5')).body.cards;
    expect(again[0]).toMatchObject({ isNew: false, item: { id: first.item.id } });
  });

  it('adds Vietnamese meanings with an allowed Sino-Vietnamese reading, kept across data refreshes', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    aiReply.mockResolvedValue(
      JSON.stringify({
        items: [
          { id: 'k:勉', hanViet: 'Miễn', meaningVi: 'cố gắng', example: '勉強{べんきょう}', exampleVi: 'học tập' },
          // Not one of the dictionary's options: the dictionary reading is used instead
          { id: 'k:強', hanViet: 'Cương', meaningVi: 'mạnh', example: '強い', exampleVi: 'mạnh' },
        ],
      })
    );
    const res = await admin.post('/api/admin/vocab/enrich').send({ kind: 'kanji', level: 'N5' });
    expect(res.body).toEqual({ updated: 2, requested: 2 });

    const [strong] = await db.select().from(vocabItems).where(eq(vocabItems.id, 'k:強'));
    expect(strong).toMatchObject({ meaningVi: 'mạnh', hanViet: 'Càng', example: null });

    await db.update(vocabItems).set({ hanViet: 'Cường' }).where(eq(vocabItems.id, 'k:強'));
    await ensureJaVocab(dataFile);
    const [kept] = await db.select().from(vocabItems).where(eq(vocabItems.id, 'k:強'));
    expect(kept).toMatchObject({ meaningVi: 'mạnh', hanViet: 'Cường' });

    // Words get their Sino-Vietnamese from their kanji
    const learner = await signIn(app, await createUser());
    const [word] = (await learner.get('/api/vocab/items?kind=word&level=N5')).body.items;
    expect(word).toMatchObject({ term: '勉強', hanViet: 'MIỄN CƯỜNG', status: 'new' });
  });

  it('keeps the enrich action for admins', async () => {
    const learner = await signIn(app, await createUser());
    expect((await learner.post('/api/admin/vocab/enrich').send({ kind: 'kanji', level: 'N5' })).status).toBe(403);
  });
});
