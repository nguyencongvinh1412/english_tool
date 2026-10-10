import { afterEach, describe, expect, it, vi } from 'vitest';
import { playSegment } from './audioSegment';

class FakeAudio extends EventTarget {
  static instance: FakeAudio;
  src: string;
  currentTime = 0;
  muted = false;
  preload = '';
  paused = false;
  play = vi.fn(() => Promise.resolve());

  constructor(src: string) {
    super();
    this.src = src;
    FakeAudio.instance = this;
  }

  pause(): void {
    this.paused = true;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('playSegment', () => {
  it('starts playback immediately from a user gesture', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    const onStart = vi.fn();
    const stop = playSegment({ assetId: 'asset-id' }, vi.fn(), onStart);

    expect(FakeAudio.instance.src).toBe('/api/media/asset-id');
    expect(FakeAudio.instance.play).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(onStart).toHaveBeenCalledOnce();

    stop();
    expect(FakeAudio.instance.paused).toBe(true);
  });

  it('seeks to a segment after metadata loads', () => {
    vi.stubGlobal('Audio', FakeAudio);
    playSegment({ assetId: 'asset-id', start: 12, end: 18 }, vi.fn());
    const audio = FakeAudio.instance;

    expect(audio.muted).toBe(true);
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.currentTime).toBe(12);
    expect(audio.muted).toBe(false);
  });
});
