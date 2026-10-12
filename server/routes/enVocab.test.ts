import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { srsCards, vocabItems } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { ensureEnVocab, ensureJaVocab } from '../vocab/data.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

const word = (w: string, def: string, ex: string | null = null) => ({
  w,
  pos: 'noun',
  def,
  ipa: 'ˈtɛst',
  cefr: 'A2',
  deck: 'en-core-A2',
  ex,
  exVi: ex ? 'câu ví dụ' : null,
});

/** One A2 deck of twelve words (more than the daily new-card limit) and an empty TOEIC deck */
const DATA = {
  version: { built: '2026-10-12' },
  decks: [
    { id: 'en-core-A2', group: 'core', label: 'A2' },
    { id: 'en-toeic-1', group: 'toeic', label: '1' },
  ],
  words: [
    word('decision', 'a choice you make', 'We made a decision.'),
    word('invoice', 'a request for payment'),
    ...Array.from({ length: 10 }, (_, i) => word(`word${i}`, `meaning ${i}`)),
  ],
};
let dataFile = '';

beforeAll(async () => {
  await runMigrations();
  dataFile = path.join(await mkdtemp(path.join(tmpdir(), 'en-vocab-')), 'vocab-data.json');
});
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
  await writeFile(dataFile, JSON.stringify(DATA));
  await ensureEnVocab(dataFile);
});
afterAll(closeDb);

describe('English vocabulary', () => {
  it('lists decks and serves cards with IPA and wrong choices from the deck', async () => {
    const agent = await signIn(app, await createUser());
    const decks = (await agent.get('/api/vocab/en/decks')).body.decks;
    expect(decks).toEqual([
      expect.objectContaining({ id: 'en-core-A2', group: 'core', total: 12, newAvailable: 10 }),
      expect.objectContaining({ id: 'en-toeic-1', total: 0, newAvailable: 0 }),
    ]);

    const cards = (await agent.get('/api/vocab/en/session?deck=en-core-A2')).body.cards;
    expect(cards).toHaveLength(10);
    expect(cards[0]).toMatchObject({
      isNew: true,
      reps: 0,
      item: { term: 'decision', ipa: 'ˈtɛst', pos: 'noun', cefr: 'A2', meaningsEn: ['a choice you make'], example: 'We made a decision.' },
    });
    expect(cards[0].distractors).toHaveLength(3);
    expect(cards[0].distractors.map((d: { term: string }) => d.term)).not.toContain('decision');

    // Reviews use the shared SRS endpoint
    const graded = await agent.post('/api/vocab/review').send({ itemId: cards[0].item.id, grade: 'good' });
    expect(graded.body.state).toBe('learning');
  });

  it('keeps Japanese decks apart from English ones', async () => {
    const agent = await signIn(app, await createUser());
    await ensureJaVocab(path.join(tmpdir(), 'missing.json'));
    const ja = (await agent.get('/api/vocab/decks')).body;
    expect(ja.decks.every((d: { total: number }) => d.total === 0)).toBe(true);
  });

  it('adds Vietnamese meanings and collocations, and an example only where the data has none', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    aiReply.mockResolvedValue(
      JSON.stringify({
        items: [
          { id: 'en:decision', meaningVi: 'quyết định', collocations: ['make a decision'], example: 'Ignored sentence.', exampleVi: 'bỏ qua' },
          { id: 'en:invoice', meaningVi: 'hoá đơn', collocations: ['send an invoice'], example: 'Please pay the invoice.', exampleVi: 'Vui lòng thanh toán hoá đơn.' },
        ],
      })
    );
    const res = await admin.post('/api/admin/vocab/enrich').send({ deck: 'en-core-A2', count: 2 });
    expect(res.body).toEqual({ updated: 2, requested: 2 });

    const [decision] = await db.select().from(vocabItems).where(eq(vocabItems.id, 'en:decision'));
    expect(decision).toMatchObject({ meaningVi: 'quyết định', collocations: ['make a decision'], example: 'We made a decision.' });
    const [invoice] = await db.select().from(vocabItems).where(eq(vocabItems.id, 'en:invoice'));
    expect(invoice).toMatchObject({ example: 'Please pay the invoice.', exampleVi: 'Vui lòng thanh toán hoá đơn.' });

    // A new data file keeps the AI's work
    await writeFile(dataFile, JSON.stringify({ ...DATA, version: { built: '2026-11-12' } }));
    expect(await ensureEnVocab(dataFile)).toBe(12);
    const [kept] = await db.select().from(vocabItems).where(eq(vocabItems.id, 'en:invoice'));
    expect(kept).toMatchObject({ meaningVi: 'hoá đơn', example: 'Please pay the invoice.', collocations: ['send an invoice'] });

    const status = (await admin.get('/api/admin/vocab')).body;
    expect(status.enDecks[0]).toMatchObject({ deck: 'en-core-A2', total: 12, translated: 2 });
  });

  it('saves looked-up words to the word bank and reviews them as their own deck', async () => {
    const user = await createUser();
    const agent = await signIn(app, user);
    // A word outside the lists gets its own entry from the lookup
    const saved = await agent
      .post('/api/vocab/en/bank')
      .send({ word: 'Serendipity', partOfSpeech: 'noun', ipa: '/ˌsɛrənˈdɪpəti/', meaning: 'a lucky chance', translation: 'sự tình cờ may mắn', context: 'It was pure serendipity.', source: 'reading' });
    expect(saved.status).toBe(201);
    expect(saved.body.word).toMatchObject({ term: 'serendipity', ipa: 'ˌsɛrənˈdɪpəti', meaningVi: 'sự tình cờ may mắn' });
    // A list word keeps its data but gains the missing Vietnamese meaning
    await agent.post('/api/vocab/en/bank').send({ word: 'invoice', meaning: 'bill', translation: 'hoá đơn' });

    const bank = (await agent.get('/api/vocab/en/bank')).body;
    expect(bank.words.map((w: { term: string }) => w.term)).toEqual(['invoice', 'serendipity']);
    expect(bank.words[0]).toMatchObject({ meaningsEn: ['a request for payment'], meaningVi: 'hoá đơn', status: 'new' });
    expect(bank.due).toBe(2);

    const session = (await agent.get('/api/vocab/en/session?deck=en-bank')).body.cards;
    expect(session.map((c: { item: { term: string } }) => c.item.term).sort()).toEqual(['invoice', 'serendipity']);

    // Today's review mixes due cards from every deck, without new ones
    await agent.post('/api/vocab/review').send({ itemId: 'en:invoice', grade: 'again' });
    expect((await agent.get('/api/vocab/en/session?deck=en-daily')).body.cards).toHaveLength(0);
    await db.update(srsCards).set({ dueAt: new Date(Date.now() - 1000), lapses: 3 });
    const daily = (await agent.get('/api/vocab/en/session?deck=en-daily')).body.cards;
    expect(daily.map((c: { item: { term: string } }) => c.item.term)).toEqual(['invoice']);

    const stats = (await agent.get('/api/vocab/en/stats')).body;
    expect(stats.totals).toMatchObject({ seen: 1, saved: 2 });
    expect(stats.forecast[0]).toBe(1);
    expect(stats.hard.map((w: { term: string }) => w.term)).toEqual(['invoice']);

    expect((await agent.delete('/api/vocab/en/bank/en:serendipity')).status).toBe(204);
    expect((await agent.get('/api/vocab/en/bank')).body.words).toHaveLength(1);
  });

  it('builds match pairs and gives feedback on a sentence with a word', async () => {
    const agent = await signIn(app, await createUser());
    await agent.post('/api/vocab/review').send({ itemId: 'en:decision', grade: 'good' });
    const pairs = (await agent.get('/api/vocab/en/match')).body.pairs;
    expect(pairs[0]).toEqual({ id: 'en:decision', term: 'decision', meaning: 'a choice you make' });

    aiReply.mockResolvedValue(JSON.stringify({ correct: true, feedback: 'Dùng đúng.', improved: 'We made a decision.' }));
    const res = await agent.post('/api/vocab/en/sentence').send({ itemId: 'en:decision', sentence: 'We made a decision.' });
    expect(res.body.feedback).toEqual({ correct: true, feedback: 'Dùng đúng.', improved: 'We made a decision.' });
  });
});
