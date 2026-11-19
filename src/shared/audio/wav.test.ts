import { describe, expect, it } from 'vitest';
import { concatSamples, downsample, encodeWav, rms, SPEECH_SAMPLE_RATE } from './wav';

const tone = (seconds: number, rate: number, amp = 0.5) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / rate));

describe('client WAV encoding', () => {
  it('writes a 16 kHz mono PCM header', async () => {
    const blob = encodeWav(tone(1.5, SPEECH_SAMPLE_RATE), SPEECH_SAMPLE_RATE);
    expect(blob.type).toBe('audio/wav');
    const view = new DataView(await blob.arrayBuffer());
    const text = (at: number) => String.fromCharCode(...new Uint8Array(view.buffer, at, 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect([view.getUint16(20, true), view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true)]).toEqual([1, 1, 16000, 16]);
    expect(view.getUint32(40, true)).toBe(1.5 * 16000 * 2);
  });

  it('clamps samples outside -1..1', async () => {
    const view = new DataView(await encodeWav(Float32Array.from([2, -2, 0]), 16000).arrayBuffer());
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([32767, -32768, 0]);
  });

  it('downsamples 48 kHz and 44.1 kHz to 16 kHz keeping duration and loudness', () => {
    for (const rate of [48000, 44100]) {
      const input = tone(2, rate);
      const out = downsample(input, rate, SPEECH_SAMPLE_RATE);
      expect(out.length / SPEECH_SAMPLE_RATE).toBeCloseTo(2, 2);
      expect(rms(out)).toBeCloseTo(rms(input), 1);
    }
    const same = tone(0.1, 16000);
    expect(downsample(same, 16000, 16000)).toBe(same);
  });

  it('joins chunks in order and measures loudness', () => {
    expect(Array.from(concatSamples([Float32Array.from([1, 2]), Float32Array.from([3])]))).toEqual([1, 2, 3]);
    expect(rms(new Float32Array(100))).toBe(0);
    expect(rms(Float32Array.from([0.5, -0.5]))).toBeCloseTo(0.5);
  });
});
