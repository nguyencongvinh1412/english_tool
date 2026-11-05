/**
 * Offline copies of the learner's own data (today's list), kept on the device so the app can still show it without a
 * connection. They are private to the signed-in learner, so everything here is deleted when they sign out, sign in,
 * or delete the account.
 */
const PREFIX = 'english-tool:offline:';

export function saveOffline(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // Storage full or blocked: the app just works online only
  }
}

export function loadOffline<T>(key: string): { value: T; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as { value: T; savedAt: number }) : null;
  } catch {
    return null;
  }
}

/** Removes every offline copy */
export function clearOfflineData(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    // Nothing to clear
  }
}

/** A card review made without a connection, waiting to be sent */
export interface PendingReview {
  itemId: string;
  grade: string;
  /** When the learner answered (ISO time), so the card is scheduled from then */
  at: string;
}

const QUEUE_KEY = 'reviewQueue';

export function pendingReviews(): PendingReview[] {
  return loadOffline<PendingReview[]>(QUEUE_KEY)?.value ?? [];
}

export function savePendingReviews(list: PendingReview[]): void {
  if (list.length === 0) {
    try {
      localStorage.removeItem(PREFIX + QUEUE_KEY);
    } catch {
      // Nothing to remove
    }
  } else saveOffline(QUEUE_KEY, list);
  window.dispatchEvent(new Event(PENDING_EVENT));
}

export const PENDING_EVENT = 'app:pending-reviews';
