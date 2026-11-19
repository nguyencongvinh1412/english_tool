/**
 * AudioWorklet: forwards raw microphone samples (first channel) to the page in batches
 * Loaded by src/hooks/useAudioCapture.ts; kept as a plain file so the CSP 'self' script rule covers it.
 * A 'flush' message sends the partly filled batch, then 'flushed', so the last syllable is not lost.
 */
const BATCH = 1024;

class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(BATCH);
    this.filled = 0;
    this.port.onmessage = (event) => {
      if (event.data !== 'flush') return;
      if (this.filled) this.port.postMessage(this.buffer.slice(0, this.filled));
      this.buffer = new Float32Array(BATCH);
      this.filled = 0;
      this.port.postMessage('flushed');
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      let read = 0;
      while (read < channel.length) {
        const take = Math.min(channel.length - read, BATCH - this.filled);
        this.buffer.set(channel.subarray(read, read + take), this.filled);
        this.filled += take;
        read += take;
        if (this.filled === BATCH) {
          this.port.postMessage(this.buffer);
          this.buffer = new Float32Array(BATCH);
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
