/**
 * Japanese kanji and vocabulary flashcards (mirrors server/routes/vocab.ts)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
import type { JlptLevel } from './contentApi';

export type VocabKind = 'kanji' | 'word';
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

export const vocabApi = {
  decks: () => apiFetch<{ decks: Deck[]; dueTotal: number; source: DataSource | null }>('/api/vocab/decks'),
  session: (kind: VocabKind, level: JlptLevel) => apiFetch<{ cards: SessionCard[] }>(`/api/vocab/session?kind=${kind}&level=${level}`),
  review: (itemId: string, grade: Grade) =>
    apiFetch<{ dueAt: string; state: 'learning' | 'review'; intervalDays: number; previews: Record<Grade, number> }>('/api/vocab/review', {
      method: 'POST',
      json: { itemId, grade },
    }),
  items: (kind: VocabKind, level: JlptLevel, offset = 0) =>
    apiFetch<{ items: (VocabItem & { status: 'new' | 'learning' | 'mastered' })[]; nextOffset: number | null }>(
      `/api/vocab/items?kind=${kind}&level=${level}&offset=${offset}`
    ),
  adminStatus: () =>
    apiFetch<{ decks: { kind: VocabKind; level: JlptLevel; total: number; translated: number }[]; source: DataSource | null }>('/api/admin/vocab'),
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
