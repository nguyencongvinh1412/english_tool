import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import request from 'supertest';
import { createApp } from '../app.js';
import { closeDb, runMigrations } from '../db/client.js';
import { config } from '../config.js';
import { createUser, resetDb, signIn } from '../test/helpers.js';

const app = createApp();
const realFetch = globalThis.fetch;
/** Fake Kokoro: returns a tiny "mp3" for speech requests */
const kokoro = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { status: 200 }));

beforeAll(runMigrations);
beforeEach(async () => {
  await resetDb();
  await rm(config.TTS_CACHE_DIR, { recursive: true, force: true });
  kokoro.mockClear();
  // Only intercept calls to the TTS server; supertest uses raw HTTP, not fetch
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    String(input).startsWith(config.TTS_BASE_URL) ? kokoro(String(input), init) : realFetch(input, init)) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
afterAll(closeDb);

describe('TTS', () => {
  it('generates each clip once and serves it to signed-in users', async () => {
    const agent = await signIn(app, await createUser());
    const lines = [
      { text: 'Hello there.', voice: 'af_heart' },
      { text: 'Hi, how are you?', voice: 'am_michael' },
    ];

    const first = await agent.post('/api/tts/batch').send({ lines });
    expect(first.status).toBe(200);
    expect(first.body.clips).toHaveLength(2);
    expect(kokoro).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(kokoro.mock.calls[0][1]?.body))).toMatchObject({ input: 'Hello there.', voice: 'af_heart', response_format: 'mp3' });

    // Same lines again: served from cache
    const second = await agent.post('/api/tts/batch').send({ lines });
    expect(second.body.clips).toEqual(first.body.clips);
    expect(kokoro).toHaveBeenCalledTimes(2);

    const audio = await agent.get(first.body.clips[0]);
    expect(audio.status).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/mpeg');
    expect((await request(app).get(first.body.clips[0])).status).toBe(401);
  });

  it('rejects unknown voices and path tricks', async () => {
    const agent = await signIn(app, await createUser());

    expect((await agent.post('/api/tts/batch').send({ lines: [{ text: 'x', voice: 'darth_vader' }] })).status).toBe(400);
    expect((await agent.get('/api/tts/audio/..%2F..%2F.env')).status).toBe(404);
  });

  it('reports the voice service as unavailable when it is down', async () => {
    kokoro.mockRejectedValueOnce(new TypeError('connect ECONNREFUSED'));
    const agent = await signIn(app, await createUser());

    const response = await agent.post('/api/tts/batch').send({ lines: [{ text: 'Hello.', voice: 'af_heart' }] });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('tts_unavailable');
  });
});
