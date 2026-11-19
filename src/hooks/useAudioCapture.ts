/**
 * useAudioCapture
 * Records the microphone as 16 kHz mono WAV for the server's speech check.
 * Unlike browser speech recognition it never stops on a pause; it stops when the learner
 * taps stop or the time limit is reached. Optionally runs browser recognition alongside
 * for live text on screen (and a fallback transcript when the server check is unavailable).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { concatSamples, downsample, encodeWav, rms, SPEECH_SAMPLE_RATE } from '@/shared/audio/wav';
import { useSpeechRecognition, type SpeechErrorKind } from './useSpeechRecognition';

export type CaptureStatus = 'idle' | 'starting' | 'recording' | 'done' | 'error';

const WORKLET_URL = '/worklets/pcm-capture.js';
/** Below this loudness for the whole clip, nothing was said (or the mic is muted) */
const SILENT_PEAK = 0.01;
const TICK_MS = 200;
/** The level meter does not need more than ~10 updates a second */
const LEVEL_MS = 100;
/** Longest wait for the worklet's last samples after stop */
const FLUSH_MS = 150;
/** Resuming audio and loading the worklet should not take longer */
const START_TIMEOUT_MS = 15_000;
/** The permission prompt may stay open a while */
const PERMISSION_TIMEOUT_MS = 60_000;

export interface CaptureResult {
  wav: Blob;
  durationSec: number;
  /**
   * What browser recognition heard (desktop only). Its last words can arrive shortly after stop,
   * so read it when the server check has failed, not right away.
   */
  fallbackText: () => string;
}

interface Options {
  /** Recording stops by itself after this many seconds */
  maxSec: number;
  /** Show live text from browser recognition while recording (desktop only) */
  livePreview?: boolean;
  /** Called once per finished recording, whether stopped by the learner or the time limit */
  onComplete?: (result: CaptureResult) => void;
}

export interface AudioCapture {
  status: CaptureStatus;
  /** Live loudness 0..1 for a level meter */
  level: number;
  elapsedSec: number;
  /** The finished recording */
  wav: Blob | null;
  durationSec: number;
  errorKind: SpeechErrorKind | null;
  /** Live text from browser recognition (empty when not available) */
  liveText: string;
  isSupported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

/** Phones and tablets handle two consumers of the microphone badly; live preview stays on desktop (iPadOS reports a Mac) */
const canPreview = (): boolean =>
  typeof navigator !== 'undefined' && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1);

const isCaptureSupported = (): boolean =>
  typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined';

function errorKindOf(error: unknown): SpeechErrorKind {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-mic';
  return 'other';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Microphone start timed out')), ms))]);
}

interface Session {
  ctx: AudioContext;
  stream: MediaStream;
  node: AudioWorkletNode;
  chunks: Float32Array[];
  peak: number;
  startedAt: number;
  timer: number;
  stopping: boolean;
}

export function useAudioCapture({ maxSec, livePreview = false, onComplete }: Options): AudioCapture {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [level, setLevel] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [wav, setWav] = useState<Blob | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [errorKind, setErrorKind] = useState<SpeechErrorKind | null>(null);
  const session = useRef<Session | null>(null);
  /** Bumped by every start, stop, reset and unmount: a start that finds it changed after an await gives up */
  const generation = useRef(0);
  const starting = useRef(false);

  const preview = useSpeechRecognition('en');
  const previewOn = livePreview && preview.isSupported && canPreview();
  const { startListening, stopListening, resetTranscript } = preview;
  const previewText = previewOn ? `${preview.transcript} ${preview.interimTranscript}`.trim() : '';
  const previewTextRef = useRef(previewText);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    previewTextRef.current = previewText;
    onCompleteRef.current = onComplete;
  });

  /** Releases the microphone and audio graph */
  const release = useCallback((s: Session) => {
    window.clearInterval(s.timer);
    s.node.port.onmessage = null;
    s.stream.getTracks().forEach((track) => track.stop());
    void s.ctx.close().catch(() => undefined);
  }, []);

  const finish = useCallback(
    (s: Session) => {
      if (session.current !== s) return;
      session.current = null;
      release(s);
      setLevel(0);
      if (s.peak < SILENT_PEAK) {
        setErrorKind('no-speech');
        setStatus('error');
        return;
      }
      const samples = downsample(concatSamples(s.chunks), s.ctx.sampleRate, SPEECH_SAMPLE_RATE);
      const result: CaptureResult = {
        wav: encodeWav(samples, SPEECH_SAMPLE_RATE),
        durationSec: samples.length / SPEECH_SAMPLE_RATE,
        fallbackText: () => previewTextRef.current,
      };
      setDurationSec(result.durationSec);
      setWav(result.wav);
      setStatus('done');
      onCompleteRef.current?.(result);
    },
    [release]
  );

  const stop = useCallback(() => {
    generation.current++;
    if (previewOn) stopListening();
    const s = session.current;
    if (!s) {
      // Stopped while the microphone was still opening: that start gives up
      if (starting.current) {
        starting.current = false;
        setStatus('idle');
      }
      return;
    }
    if (s.stopping) return;
    s.stopping = true;
    window.clearInterval(s.timer);
    // Ask the worklet for its partly filled batch, then finish (or finish anyway after a moment)
    const timeout = window.setTimeout(() => finish(s), FLUSH_MS);
    s.node.port.onmessage = (event: MessageEvent<Float32Array | string>) => {
      if (event.data === 'flushed') {
        window.clearTimeout(timeout);
        finish(s);
      } else if (typeof event.data !== 'string') {
        s.chunks.push(event.data);
      }
    };
    s.node.port.postMessage('flush');
  }, [finish, previewOn, stopListening]);

  // The timer callback needs the latest stop()
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    if (session.current || starting.current || !isCaptureSupported()) return;
    const mine = ++generation.current;
    starting.current = true;
    setStatus('starting');
    setErrorKind(null);
    setWav(null);
    setDurationSec(0);
    setElapsedSec(0);
    resetTranscript();

    // Created and resumed inside the tap handler, before any await, so iOS Safari lets audio run
    const ctx = new AudioContext();
    const resumed = ctx.resume();
    let stream: MediaStream | null = null;
    const abandon = () => {
      stream?.getTracks().forEach((track) => track.stop());
      void ctx.close().catch(() => undefined);
    };
    try {
      stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
        PERMISSION_TIMEOUT_MS
      );
      await withTimeout(resumed, START_TIMEOUT_MS);
      await withTimeout(ctx.audioWorklet.addModule(WORKLET_URL), START_TIMEOUT_MS);
    } catch (error) {
      abandon();
      if (mine !== generation.current) return;
      starting.current = false;
      setErrorKind(errorKindOf(error));
      setStatus('error');
      return;
    }
    // Stopped, reset or unmounted while opening
    if (mine !== generation.current) {
      abandon();
      return;
    }

    const node = new AudioWorkletNode(ctx, 'pcm-capture');
    const s: Session = { ctx, stream, node, chunks: [], peak: 0, startedAt: Date.now(), timer: 0, stopping: false };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    let levelAt = 0;
    node.port.onmessage = (event: MessageEvent<Float32Array | string>) => {
      if (typeof event.data === 'string') return;
      s.chunks.push(event.data);
      const loudness = rms(event.data);
      s.peak = Math.max(s.peak, loudness);
      const now = performance.now();
      if (now - levelAt >= LEVEL_MS) {
        levelAt = now;
        // Speech sits around 0.02-0.2; scale so normal speech fills most of the meter
        setLevel(Math.min(1, loudness * 6));
      }
    };
    // The worklet only runs while connected to the output; the zero gain keeps it silent
    ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
    s.timer = window.setInterval(() => {
      const elapsed = (Date.now() - s.startedAt) / 1000;
      setElapsedSec(elapsed);
      if (elapsed >= maxSec) stopRef.current();
    }, TICK_MS);
    session.current = s;
    starting.current = false;
    if (previewOn) startListening();
    setStatus('recording');
  }, [maxSec, previewOn, startListening, resetTranscript]);

  const reset = useCallback(() => {
    generation.current++;
    starting.current = false;
    const s = session.current;
    session.current = null;
    if (s) release(s);
    if (previewOn) stopListening();
    resetTranscript();
    setStatus('idle');
    setLevel(0);
    setElapsedSec(0);
    setWav(null);
    setDurationSec(0);
    setErrorKind(null);
  }, [release, previewOn, stopListening, resetTranscript]);

  // Never leave the microphone on after leaving the screen (a start still opening gives up too)
  useEffect(
    () => () => {
      generation.current++;
      starting.current = false;
      const s = session.current;
      session.current = null;
      if (s) release(s);
    },
    [release]
  );

  return {
    status,
    level,
    elapsedSec,
    wav,
    durationSec,
    errorKind,
    liveText: previewText,
    isSupported: isCaptureSupported(),
    start,
    stop,
    reset,
  };
}
