import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from './http';
import { prefetchScript } from './speech';

vi.mock('./http', () => ({ apiFetch: vi.fn() }));

describe('prefetchScript', () => {
  it('splits scripts into batches accepted by the TTS endpoint', async () => {
    const fetch = vi.mocked(apiFetch);
    fetch
      .mockResolvedValueOnce({ available: true } as never)
      .mockResolvedValueOnce({ clips: Array.from({ length: 60 }, () => '/clip') } as never)
      .mockResolvedValueOnce({ clips: Array.from({ length: 40 }, () => '/clip') } as never);

    prefetchScript(
      Array.from({ length: 100 }, (_, i) => ({ speaker: i % 2 ? ('B' as const) : ('A' as const), text: `Line ${i}` })),
      { A: 'female', B: 'male' }
    );

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const batches = fetch.mock.calls.slice(1).map(([, options]) => options?.json as { lines: unknown[] });
    expect(batches.map((batch) => batch.lines.length)).toEqual([60, 40]);
  });
});
