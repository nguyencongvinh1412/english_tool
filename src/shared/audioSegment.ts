/**
 * Playback of a slice of an uploaded recording (imported tests)
 */
import { mediaUrl, type AudioSegment } from './examApi';

/**
 * Plays a slice of an uploaded recording
 * @returns Stop function; onEnd runs when the slice finishes or fails
 */
export function playSegment(segment: AudioSegment, onEnd: () => void, onStart?: () => void): () => void {
  const audio = new Audio(mediaUrl(segment.assetId));
  let finished = false;
  const start = segment.start ?? 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    audio.pause();
    onEnd();
  };
  audio.preload = 'auto';
  if (start > 0) audio.muted = true;
  audio.addEventListener('loadedmetadata', () => {
    if (start > 0) {
      audio.currentTime = start;
      audio.muted = false;
    }
  }, { once: true });
  audio.addEventListener('timeupdate', () => {
    if (segment.end !== undefined && audio.currentTime >= segment.end) finish();
  });
  audio.addEventListener('ended', finish);
  audio.addEventListener('error', finish);
  void audio.play().then(() => {
    if (!finished) onStart?.();
  }).catch(finish);
  return finish;
}
