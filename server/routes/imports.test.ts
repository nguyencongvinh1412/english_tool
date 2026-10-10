import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../app.js';
import { closeDb, db, runMigrations } from '../db/client.js';
import { contentItems } from '../db/schema.js';
import { sendChatMessage } from '../services/cliproxy.js';
import { buildDraft, finalizePayload, withIssues } from '../imports/draft.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';
import { makePdf } from '../test/pdf.js';

vi.mock('../services/cliproxy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/cliproxy.js')>()),
  sendChatMessage: vi.fn(),
}));

const app = createApp();
const aiReply = vi.mocked(sendChatMessage);

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64)]);

const options = (word: string) => ['alpha', 'beta', 'gamma', word];

/** What the fake AI extracts from the question pages */
const EXTRACTED_GROUPS = {
  groups: [
    {
      part: 3,
      numbers: [32, 34],
      questions: [32, 33, 34].map((n) => ({ number: n, prompt: `What is question ${n}?`, options: options(`d${n}`) })),
    },
    {
      part: 5,
      numbers: [101, 102],
      questions: [
        { number: 101, prompt: 'The report is -------- tomorrow.', options: options('due') },
        // Missing blank: the admin has to fix this one
        { number: 102, prompt: 'Sales rose last quarter.', options: options('sharply') },
      ],
    },
  ],
};

const ANSWERS = { answers: { '32': 'A', '33': 'B', '34': '(C)', '101': 'D', '102': 'A' } };

const TRANSCRIPTS = {
  entries: [
    {
      part: 3,
      numbers: [32, 34],
      lines: Array.from({ length: 6 }, (_, i) => ({ speaker: i % 2 ? 'M' : 'W', text: `Line ${i}` })),
    },
  ],
};

/**
 * Fake AI answering each parsing step
 */
function fakeParser() {
  aiReply.mockImplementation(async (request) => {
    const system = request.systemPrompt ?? '';
    if (system.includes('answer keys')) return JSON.stringify(ANSWERS);
    if (system.includes('transcripts')) return JSON.stringify(TRANSCRIPTS);
    return JSON.stringify(EXTRACTED_GROUPS);
  });
}

/**
 * Uploads files through the media endpoint
 */
async function upload(agent: TestAgent, files: { name: string; data: Buffer }[]) {
  let req = agent.post('/api/admin/media');
  for (const file of files) req = req.attach('files', file.data, file.name);
  return req;
}

/**
 * Polls the import until parsing finishes
 */
async function waitForParse(agent: TestAgent, id: string) {
  for (let i = 0; i < 50; i++) {
    const res = await agent.get(`/api/admin/imports/${id}`);
    if (res.body.import.status !== 'parsing') return res.body.import;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('parse did not finish');
}

/**
 * Admin agent with a created import of a four-page book
 */
async function createImport() {
  const agent = await signIn(app, await createUser({ role: 'admin' }));
  const pdf = makePdf(['Part 5 101 The report is due', 'Part 3 32 What is question 32', 'Answer key 101 D', 'Transcript 32-34 W: Line 0']);
  const uploaded = await upload(agent, [{ name: 'book.pdf', data: pdf }]);
  expect(uploaded.status).toBe(201);
  const created = await agent.post('/api/admin/imports').send({ title: 'Practice Test 1', documentAssetId: uploaded.body.assets[0].id });
  expect(created.status).toBe(201);
  return { agent, job: created.body.import };
}

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  aiReply.mockReset();
});
afterAll(closeDb);

describe('media', () => {
  it('rejects files whose content does not match the extension', async () => {
    const agent = await signIn(app, await createUser({ role: 'admin' }));
    const res = await upload(agent, [{ name: 'fake.pdf', data: Buffer.from('hello world, not a pdf') }]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('unsupported_file');
  });

  it('serves images to learners but keeps source documents admin-only', async () => {
    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const res = await upload(admin, [
      { name: 'photo.png', data: PNG },
      { name: 'book.pdf', data: makePdf(['hi']) },
    ]);
    const [image, doc] = res.body.assets;
    expect(image.kind).toBe('image');
    expect(doc.kind).toBe('document');

    const learner = await signIn(app, await createUser());
    expect((await learner.get(image.url)).status).toBe(200);
    expect((await learner.get(doc.url)).status).toBe(404);
    expect((await admin.get(doc.url)).headers['content-type']).toBe('application/pdf');
  });

  it('only lets admins upload', async () => {
    const learner = await signIn(app, await createUser());
    expect((await upload(learner, [{ name: 'photo.png', data: PNG }])).status).toBe(403);
  });
});

describe('importing a test', () => {
  it('extracts the pages of an uploaded PDF', async () => {
    const { job } = await createImport();
    expect(job.status).toBe('uploaded');
    expect(job.pageCount).toBe(4);
    expect(job.pages[0].text).toContain('The report is due');
  });

  it('parses, reports problems, and publishes after the admin fixes them', async () => {
    const { agent, job } = await createImport();
    fakeParser();

    const started = await agent.post(`/api/admin/imports/${job.id}/parse`).send({ ranges: { questions: [1, 2], answers: [3, 3], transcripts: [4, 4] } });
    expect(started.status).toBe(202);
    const parsed = await waitForParse(agent, job.id);
    expect(parsed.status).toBe('review');

    const groups = parsed.draft.groups;
    expect(groups.map((g: { part: number }) => g.part)).toEqual([3, 5]);
    const p3 = groups[0];
    expect(p3.payload.script).toHaveLength(6);
    expect(p3.payload.speakers.A.gender).toBe('female');
    expect(p3.payload.questions.map((q: { answerIndex: number }) => q.answerIndex)).toEqual([0, 1, 2]);
    const p5 = groups[1];
    expect(p5.payload.questions[0].prompt).toBe('The report is ____ tomorrow.');
    expect(p5.issues.map((i: { code: string }) => i.code)).toContain('missing_blank');

    const blocked = await agent.post(`/api/admin/imports/${job.id}/publish`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('draft_has_errors');

    p5.payload.questions[1].prompt = 'Sales rose ____ last quarter.';
    const saved = await agent.put(`/api/admin/imports/${job.id}/draft`).send({ draft: { groups } });
    expect(saved.status).toBe(200);
    expect(saved.body.import.errorCount).toBe(0);

    const published = await agent.post(`/api/admin/imports/${job.id}/publish`);
    expect(published.status).toBe(200);
    expect(published.body.groups).toBe(2);

    const items = await db.select().from(contentItems).where(eq(contentItems.importId, job.id));
    expect(items.map((i) => i.source)).toEqual(['imported', 'imported']);

    // Learners see it as an official test, separate from the AI bank
    const learner = await signIn(app, await createUser());
    const catalog = await learner.get('/api/exams/toeic/catalog');
    expect(catalog.body.officialTests).toEqual([expect.objectContaining({ id: job.id, title: 'Practice Test 1', parts: [3, 5], questions: 5 })]);
    expect(catalog.body.parts.find((p: { part: number }) => p.part === 5).bankGroups).toBe(0);

    const session = await learner.post('/api/exams/toeic/sessions').send({ mode: 'official', importId: job.id });
    expect(session.status).toBe(201);
    const first = session.body.session.sections[0].groups[0].payload;
    expect(first.script).toHaveLength(6);
    expect(first.questions[0].answerIndex).toBeUndefined();
  });

  it('re-publishing archives the previous groups', async () => {
    const { agent, job } = await createImport();
    fakeParser();
    await agent.post(`/api/admin/imports/${job.id}/parse`).send({ ranges: { questions: [1, 2], answers: [3, 3], transcripts: [4, 4] } });
    const parsed = await waitForParse(agent, job.id);
    const groups = parsed.draft.groups;
    groups[1].payload.questions[1].prompt = 'Sales rose ____ last quarter.';
    await agent.put(`/api/admin/imports/${job.id}/draft`).send({ draft: { groups } });

    await agent.post(`/api/admin/imports/${job.id}/publish`).expect(200);
    await agent.post(`/api/admin/imports/${job.id}/publish`).expect(200);
    const live = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.importId, job.id), eq(contentItems.status, 'published')));
    expect(live).toHaveLength(2);

    await agent.delete(`/api/admin/imports/${job.id}`).expect(204);
    const learner = await signIn(app, await createUser());
    expect((await learner.get('/api/exams/toeic/catalog')).body.officialTests).toEqual([]);
  });

  it('marks the job failed when the AI finds nothing', async () => {
    const { agent, job } = await createImport();
    aiReply.mockResolvedValue(JSON.stringify({ groups: [], answers: {}, entries: [] }));
    await agent.post(`/api/admin/imports/${job.id}/parse`).send({ ranges: { questions: [1, 2] } });
    const parsed = await waitForParse(agent, job.id);
    expect(parsed.status).toBe('failed');
    expect(parsed.error).toMatch(/No questions/);
  });

  it('rejects page ranges past the end of the document', async () => {
    const { agent, job } = await createImport();
    const res = await agent.post(`/api/admin/imports/${job.id}/parse`).send({ ranges: { questions: [1, 9] } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('bad_range');
  });

  it('is admin-only', async () => {
    const learner = await signIn(app, await createUser());
    expect((await learner.get('/api/admin/imports')).status).toBe(403);
  });
});

describe('draft for listening parts with recordings', () => {
  const parsed = {
    groups: [{ part: 1, numbers: [1, 2] as [number, number], questions: [], photoPages: [{ number: 1, page: 3 }] }],
    answers: { '1': 'C', '2': 'A' },
    transcripts: [],
  };

  it('asks for photos and audio, then fills hidden statements once a recording is attached', async () => {
    const draft = buildDraft(parsed);
    const group = draft.groups[0];
    expect(group.photoPages).toEqual({ '1': 3 });
    expect(group.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['needs_photo', 'needs_audio_or_transcript']));

    const admin = await signIn(app, await createUser({ role: 'admin' }));
    const assets = (await upload(admin, [{ name: 'p.png', data: PNG }, { name: 'part1.mp3', data: MP3 }])).body.assets;
    group.payload.audio = { assetId: assets[1].id, start: 0, end: 60 };
    for (const item of group.payload.items as { imageAssetId: string }[]) item.imageAssetId = assets[0].id;

    const result = finalizePayload(group);
    expect(result.ok).toBe(true);
    const payload = (result as { payload: { items: { statements: string[]; answerIndex: number }[] } }).payload;
    expect(payload.items[0].statements).toHaveLength(4);
    expect(payload.items.map((i) => i.answerIndex)).toEqual([2, 0]);
  });
});

describe('lenient AI output', () => {
  it('accepts photo pages as a list of page numbers or a map', async () => {
    const { rawGroup } = await import('../imports/parse.js');
    expect(rawGroup.parse({ part: 1, numbers: [1, 2], photoPages: [3, 4] }).photoPages).toEqual([
      { number: 1, page: 3 },
      { number: 2, page: 4 },
    ]);
    expect(rawGroup.parse({ part: 1, numbers: [1, 2], photoPages: { '2': 5 } }).photoPages).toEqual([{ number: 2, page: 5 }]);
  });
});

describe('draft checks', () => {
  const p7 = (title: string, options: string[]) =>
    withIssues({
      groups: [
        {
          key: '147',
          part: 7,
          numbers: [147, 148],
          payload: {
            passages: [{ kind: 'notice', title, text: 'The library closes early.' }],
            questions: [147, 148].map(() => ({ type: 'mcq', prompt: 'Why?', options, answerIndex: 1, explanation: 'Answer key: (B).' })),
          },
          issues: [],
        },
      ],
    }).groups[0];

  it('names untitled passages after their kind', () => {
    const group = p7('', ['a', 'b', 'c', 'd']);
    expect(group.issues).toEqual([]);
    expect((finalizePayload(group) as { payload: { passages: { title: string }[] } }).payload.passages[0].title).toBe('Notice');
  });

  it('reports schema problems as errors before publishing', () => {
    const group = p7('Notice', ['a', 'b', 'c', 'x'.repeat(500)]);
    expect(group.issues.map((i) => i.code)).toEqual(['invalid']);
  });
});
