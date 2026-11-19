/**
 * WAV header reading for uploaded speech clips
 * The browser records 16-bit PCM WAV; the server only needs to trust the format and know the duration
 */

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSec: number;
}

const MIN_RATE = 8000;
const MAX_RATE = 48000;

const ascii = (buf: Buffer, at: number, text: string): boolean => buf.subarray(at, at + text.length).toString('latin1') === text;

/**
 * Reads the format and duration of a PCM WAV file
 * @returns null when the bytes are not a readable PCM WAV
 */
export function readWav(buf: Buffer): WavInfo | null {
  if (buf.length < 44 || !ascii(buf, 0, 'RIFF') || !ascii(buf, 8, 'WAVE')) return null;

  let fmt: { format: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let offset = 12;
  // Chunks: fmt, data, and others (LIST, FLLR...) that are skipped; each is padded to an even size
  while (offset + 8 <= buf.length) {
    const id = buf.subarray(offset, offset + 4).toString('latin1');
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && size >= 16 && body + 16 <= buf.length) {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      // The browser writes 16-bit mono PCM; anything else is refused so the duration (and billing) cannot be faked
      if (!fmt || (fmt.format !== 1 && fmt.format !== 0xfffe) || fmt.channels !== 1 || fmt.bitsPerSample !== 16) return null;
      if (fmt.sampleRate < MIN_RATE || fmt.sampleRate > MAX_RATE) return null;
      // Duration from the bytes actually sent, not the header's size field, which a client could understate
      const bytes = buf.length - body;
      const bytesPerSecond = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8);
      return { sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: fmt.bitsPerSample, durationSec: bytes / bytesPerSecond };
    }
    offset = body + size + (size % 2);
  }
  return null;
}
