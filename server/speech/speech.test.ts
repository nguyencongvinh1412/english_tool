import { describe, expect, it } from 'vitest';
import { readWav } from './wav.js';
import { countFillers, postProcess, tokens } from './postProcess.js';
import { parseReply } from './engine.js';
import type { AssessInput, RawAssessment } from './types.js';
import { makeWav } from '../test/wav.js';
import { encodeWav } from '../../src/shared/audio/wav.js';

describe('readWav', () => {
  it('reads format and duration', () => {
    expect(readWav(makeWav(2.5))).toEqual({ sampleRate: 16000, channels: 1, bitsPerSample: 16, durationSec: 2.5 });
  });

  it('skips unknown chunks, including odd-sized ones', () => {
    expect(readWav(makeWav(1, 48000, true))?.durationSec).toBe(1);
  });

  it('reads the WAV the browser writes', async () => {
    const samples = Float32Array.from({ length: 16000 * 3 }, (_, i) => Math.sin(i / 8) / 2);
    const bytes = Buffer.from(await encodeWav(samples, 16000).arrayBuffer());
    expect(readWav(bytes)).toEqual({ sampleRate: 16000, channels: 1, bitsPerSample: 16, durationSec: 3 });
  });

  it('measures the bytes sent, not the size the header claims', () => {
    const wav = makeWav(3);
    wav.writeUInt32LE(32000, wav.length - 3 * 16000 * 2 - 4); // data size field says 1 s
    expect(readWav(wav)?.durationSec).toBe(3);
  });

  it('only accepts 16-bit mono at 8-48 kHz', () => {
    const stereo = makeWav(1);
    stereo.writeUInt16LE(2, 22);
    expect(readWav(stereo)).toBeNull();
    expect(readWav(makeWav(1, 4000))).toBeNull();
    expect(readWav(makeWav(1, 96000))).toBeNull();
  });

  it('rejects files that are not PCM WAV', () => {
    expect(readWav(Buffer.from('not a wav file at all, just some text that is long enough'))).toBeNull();
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60)]);
    expect(readWav(webm)).toBeNull();
    const float = makeWav(1);
    float.writeUInt16LE(3, 20); // IEEE float format
    expect(readWav(float)).toBeNull();
  });
});

describe('tokens and fillers', () => {
  it('normalises words', () => {
    expect(tokens("Well, um... I DON’T think-so!")).toEqual(['well', 'um', 'i', "don't", 'think', 'so']);
  });

  it('counts fillers and "you know"', () => {
    expect(countFillers(tokens('um I think, uh, you know, it is er fine. You know what? hmm'))).toBe(6);
    expect(countFillers(tokens('I know you'))).toBe(0);
  });
});

const raw = (over: Partial<RawAssessment>): RawAssessment => ({ transcript: '', words: [], issues: [], overall: null, bandHint: null, ...over });
const engine = { model: 'gemini-3.8-flash-high', accuracy: 'full' as const };

describe('postProcess', () => {
  const read: AssessInput = { mode: 'read', reference: 'I think this is a very good idea.', durationSec: 2.4 };

  it('keeps read issues only for words of the reference, once each', () => {
    const result = postProcess(
      raw({
        transcript: 'I sink this is a berry good idea.',
        issues: [
          { word: 'think', heardAs: 'sink', sound: '/θ/', tip: 'Đặt lưỡi giữa hai hàm răng' },
          { word: 'Think', heardAs: 'sink', tip: 'duplicate' },
          { word: 'banana', heardAs: 'banana', tip: 'never said' },
          { word: 'very', heardAs: 'berry', sound: '/v/', tip: 'Răng trên chạm môi dưới' },
        ],
        overall: { pronunciation: 'fair' },
      }),
      read,
      engine
    );
    expect(result.issues.map((i) => i.word)).toEqual(['think', 'very']);
    expect(result.overall).toEqual({ pronunciation: 'fair' });
    expect(result.fluency).toBeUndefined();
    expect(result.bandHint).toBeUndefined();
  });

  it('drops an issue whose "heard as" is the same word with no sound given', () => {
    const result = postProcess(raw({ transcript: 'I think', issues: [{ word: 'think', heardAs: 'think', tip: 'x' }] }), read, engine);
    expect(result.issues).toEqual([]);
  });

  it('caps the number of issues', () => {
    const words = 'one two three four five six seven eight nine ten';
    const issues = words.split(' ').map((w) => ({ word: w, heardAs: `${w}x`, tip: '' }));
    const result = postProcess(raw({ transcript: words, issues }), { mode: 'answer', question: 'Q', durationSec: 5 }, engine);
    expect(result.issues).toHaveLength(8);
  });

  it('measures fluency from word timings in answer mode and clamps bands', () => {
    const result = postProcess(
      raw({
        transcript: 'Well um I like it. You know it is quiet.',
        words: [
          { word: 'Well', start: 0, end: 0.4 },
          { word: 'um', start: 0.5, end: 0.8 },
          { word: 'I', start: 0.9, end: 1.0 },
          { word: 'like', start: 1.0, end: 1.3 },
          { word: 'it', start: 1.3, end: 1.5 },
          { word: 'You', start: 3.0, end: 3.2 }, // 1.5 s pause
          { word: 'know', start: 3.2, end: 3.4 },
          { word: 'it', start: 3.5, end: 3.6 },
          { word: 'is', start: 3.6, end: 3.7 },
          { word: 'quiet', start: 3.7, end: Number.NaN }, // dropped
        ],
        bandHint: { pronunciation: 9.7, fluency: 6.3 },
      }),
      { mode: 'answer', question: 'Describe your hometown', durationSec: 4 },
      engine
    );
    // 10 spoken tokens - 2 fillers = 8 words over 3.7 s
    expect(result.fluency).toEqual({ durationSec: 4, wpm: Math.round(8 / (3.7 / 60)), longPauses: 1, fillers: 2 });
    expect(result.bandHint).toEqual({ pronunciation: 9, fluency: 6.5 });
  });

  it('gives no fluency numbers when the word timings run past the end of the clip', () => {
    const result = postProcess(
      raw({
        transcript: 'I like my city',
        words: [
          { word: 'I', start: 0, end: 0.2 },
          { word: 'like', start: 0.2, end: 0.5 },
          { word: 'my', start: 0.5, end: 0.7 },
          { word: 'city', start: 0.7, end: 4.6 }, // clip is 4 s: stretched across the silence
        ],
        overall: { pronunciation: 'good' },
      }),
      { mode: 'answer', question: 'Q', durationSec: 4 },
      engine
    );
    expect(result.fluency).toBeUndefined();
    expect(result.overall).toEqual({ pronunciation: 'good' });
    // Just inside the tolerance still counts
    const ok = postProcess(raw({ transcript: 'I like', words: [{ word: 'I', start: 0, end: 0.2 }, { word: 'like', start: 0.3, end: 4.05 }] }), { mode: 'answer', question: 'Q', durationSec: 4 }, engine);
    expect(ok.fluency).toBeDefined();
  });

  it('returns only the transcript in transcribe mode', () => {
    const result = postProcess(
      raw({ transcript: 'Hello there', issues: [{ word: 'hello', tip: 'x' }], overall: { pronunciation: 'good' } }),
      { mode: 'transcribe', durationSec: 1 },
      { model: 'gemini-3-flash', accuracy: 'full' }
    );
    expect(result).toEqual({ transcript: 'Hello there', issues: [], engineModel: 'gemini-3-flash', accuracy: 'full' });
  });
});

describe('reading a different sentence', () => {
  it('flags it instead of giving word notes, but tolerates a few mispronounced words', () => {
    const read: AssessInput = { mode: 'read', reference: 'I drink green tea.', durationSec: 2 };
    const off = postProcess(raw({ transcript: 'I think this is a very good idea', issues: [{ word: 'I', heardAs: 'I think this is a very good idea', tip: 'x' }] }), read, engine);
    expect(off).toMatchObject({ offScript: true, issues: [], overall: { pronunciation: 'needs_work' } });

    const close = postProcess(raw({ transcript: 'I dink green tee.', issues: [{ word: 'drink', heardAs: 'dink', tip: 'r' }] }), read, engine);
    expect(close.offScript).toBeUndefined();
    expect(close.issues).toHaveLength(1);
  });

  it('drops a "heard as" that is a whole phrase', () => {
    const result = postProcess(
      raw({ transcript: 'I think this is good', issues: [{ word: 'think', heardAs: 'I sink this is', tip: 'x' }] }),
      { mode: 'answer', question: 'Q', durationSec: 2 },
      engine
    );
    expect(result.issues).toEqual([]);
  });
});

describe('parseReply', () => {
  it('reads JSON inside markdown fences and tolerates odd fields', () => {
    const parsed = parseReply('```json\n{"transcript":" I sink ","issues":"oops","overall":{"pronunciation":"bad"},"words":[{"word":"I","start":"0.1","end":0.3}]}\n```');
    expect(parsed?.transcript).toBe('I sink');
    expect(parsed?.issues).toEqual([]);
    expect(parsed?.overall?.pronunciation).toBe('fair');
    expect(parsed?.words[0]).toEqual({ word: 'I', start: 0.1, end: 0.3 });
  });

  it('rejects replies without JSON, and accepts an empty transcript (nothing was said)', () => {
    expect(parseReply('Sorry, I cannot help.')).toBeNull();
    expect(parseReply('{broken')).toBeNull();
    expect(parseReply('{"words": []}')).toBeNull();
    expect(parseReply('{"transcript": " "}')?.transcript).toBe('');
  });
});
