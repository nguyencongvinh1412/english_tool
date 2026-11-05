/**
 * Japanese kanji and vocabulary flashcards (mirrors server/routes/vocab.ts)
 */
import { ApiRequestError, apiFetch } from './http';
import { pendingReviews, savePendingReviews } from './offlineCache';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
import type { JlptLevel } from './contentApi';

export type VocabKind = 'kanji' | 'word';
/** new, learning, good (reviewed a week apart) or mastered (three weeks apart) */
export type WordStatus = 'new' | 'learning' | 'good' | 'mastered';
export type Grade = 'again' | 'hard' | 'good' | 'easy';
export const GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];

export interface VocabItem {
  id: string;
  kind: VocabKind;
  level: JlptLevel;
  term: string;
  reading: string | null;
  readingsOn: string[];
  readingsKun: string[];
  meaningsEn: string[];
  strokes: number | null;
  hanViet: string | null;
  meaningVi: string | null;
  /** With furigana markup */
  example: string | null;
  exampleVi: string | null;
}

export interface SessionCard {
  item: VocabItem;
  isNew: boolean;
  /** Minutes until the card returns for each answer */
  previews: Record<Grade, number>;
}

export interface Deck {
  kind: VocabKind;
  level: JlptLevel;
  total: number;
  seen: number;
  due: number;
  mastered: number;
  newAvailable: number;
}

export interface DataSource {
  kanjidic: string;
  built: string;
}

export interface ReviewReply {
  dueAt: string;
  state: 'learning' | 'review';
  intervalDays: number;
  previews: Record<Grade, number>;
}

export const vocabApi = {
  decks: () => apiFetch<{ decks: Deck[]; dueTotal: number; source: DataSource | null }>('/api/vocab/decks'),
  session: (kind: VocabKind, level: JlptLevel) => apiFetch<{ cards: SessionCard[] }>(`/api/vocab/session?kind=${kind}&level=${level}`),
  /**
   * Grades a card. Without a connection the answer is kept on this device and sent later (with the time it was
   * given); the reply is then an estimate, enough to carry on with the session.
   */
  review: async (itemId: string, grade: Grade): Promise<ReviewReply> => {
    const at = new Date().toISOString();
    try {
      return await apiFetch<ReviewReply>('/api/vocab/review', { method: 'POST', json: { itemId, grade, at } });
    } catch (error) {
      if (!(error instanceof ApiRequestError && error.code === 'network')) throw error;
      savePendingReviews([...pendingReviews(), { itemId, grade, at }]);
      const minutes = grade === 'again' ? 1 : grade === 'hard' ? 6 * 60 : 24 * 60;
      return { dueAt: new Date(Date.now() + minutes * 60_000).toISOString(), state: grade === 'again' ? 'learning' : 'review', intervalDays: minutes / 1440, previews: { again: 1, hard: 360, good: 1440, easy: 5760 } };
    }
  },
  /** Sends the reviews made offline, oldest first; stops at the first failure to reach the server. Returns how many were sent. */
  flushReviews: async (): Promise<number> => {
    const queue = pendingReviews();
    let sent = 0;
    for (const review of queue) {
      try {
        await apiFetch('/api/vocab/review', { method: 'POST', json: review });
      } catch (error) {
        // No connection: keep the rest. Any other refusal means this review can never be accepted, so drop it.
        if (error instanceof ApiRequestError && error.code === 'network') break;
      }
      sent += 1;
    }
    if (sent > 0) savePendingReviews(queue.slice(sent));
    return sent;
  },
  items: (kind: VocabKind, level: JlptLevel, offset = 0) =>
    apiFetch<{ items: (VocabItem & { status: WordStatus })[]; nextOffset: number | null }>(
      `/api/vocab/items?kind=${kind}&level=${level}&offset=${offset}`
    ),
  adminStatus: () =>
    apiFetch<{
      decks: { kind: VocabKind; level: JlptLevel; total: number; translated: number }[];
      /** English decks */
      enDecks: { deck: string; group: 'core' | 'toeic' | 'ielts'; label: string; total: number; translated: number }[];
      source: DataSource | null;
    }>('/api/admin/vocab'),
  enrich: (kind: VocabKind, level: JlptLevel, count: number) =>
    apiFetch<{ updated: number; requested: number }>('/api/admin/vocab/enrich', {
      method: 'POST',
      json: { kind, level, count, model: getSelectedModel() ?? undefined },
    }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
};

/**
 * Kun readings use a dot before the okurigana (つよ.い); shown as つよ(い)
 */
export const formatKun = (reading: string) => reading.replace(/\.(.+)$/, '($1)');

/**
 * Word reading without the "(する)" style notes, for speech
 */
export const spokenReading = (item: VocabItem) => (item.reading ?? item.readingsOn[0] ?? item.term).replace(/\s*\(.*?\)\s*/g, '');
