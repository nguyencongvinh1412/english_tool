/**
 * English vocabulary decks and cards (mirrors the /vocab/en routes in server/routes/vocab.ts)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
import type { Grade } from './vocabApi';
import type { WordDefinition } from './contentApi';

export type EnDeckGroup = 'core' | 'toeic' | 'ielts';

export interface EnWord {
  id: string;
  term: string;
  pos: string | null;
  ipa: string | null;
  cefr: string | null;
  /** English definition */
  meaningsEn: string[];
  meaningVi: string | null;
  collocations: string[];
  example: string | null;
  exampleVi: string | null;
}

export interface EnDeck {
  id: string;
  group: EnDeckGroup;
  /** CEFR level for core decks, part number otherwise */
  label: string;
  total: number;
  seen: number;
  due: number;
  mastered: number;
  newAvailable: number;
}

export interface EnCard {
  item: EnWord;
  isNew: boolean;
  /** Successful reviews so far; questions get harder as it grows */
  reps: number;
  lapses: number;
  previews: Record<Grade, number>;
  distractors: { term: string; meaningVi: string | null; meaningEn: string }[];
}

export interface SavedWord extends EnWord {
  status: 'new' | 'learning' | 'mastered';
  source: 'reading' | 'listening' | 'manual';
  context: string | null;
  savedAt: string;
}

export interface VocabStats {
  totals: { seen: number; mastered: number; saved: number };
  byLevel: { level: string; total: number; seen: number; mastered: number }[];
  /** Reviews due today, tomorrow… (7 days) */
  forecast: number[];
  hard: (EnWord & { lapses: number })[];
}

export interface SentenceFeedback {
  correct: boolean;
  feedback: string;
  improved: string;
}

const aiUsed = <T,>(r: T) => {
  window.dispatchEvent(new Event(AI_USED_EVENT));
  return r;
};

export const enVocabApi = {
  decks: () => apiFetch<{ decks: EnDeck[]; dueTotal: number; source: { built: string } | null }>('/api/vocab/en/decks'),
  session: (deck: string) => apiFetch<{ cards: EnCard[] }>(`/api/vocab/en/session?deck=${encodeURIComponent(deck)}`),
  items: (deck: string, offset = 0) =>
    apiFetch<{ items: (EnWord & { status: 'new' | 'learning' | 'mastered' })[]; nextOffset: number | null }>(
      `/api/vocab/en/items?deck=${encodeURIComponent(deck)}&offset=${offset}`
    ),
  bank: () => apiFetch<{ words: SavedWord[]; due: number }>('/api/vocab/en/bank'),
  save: (definition: WordDefinition, context: string | undefined, source: SavedWord['source']) =>
    apiFetch<{ word: EnWord }>('/api/vocab/en/bank', {
      method: 'POST',
      json: {
        word: definition.word,
        partOfSpeech: definition.partOfSpeech,
        ipa: definition.ipa,
        meaning: definition.meaning,
        translation: definition.translation || undefined,
        example: definition.example,
        context,
        source,
      },
    }),
  remove: (itemId: string) => apiFetch<void>(`/api/vocab/en/bank/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
  match: () => apiFetch<{ pairs: { id: string; term: string; meaning: string }[] }>('/api/vocab/en/match'),
  sentence: (itemId: string, sentence: string) =>
    apiFetch<{ feedback: SentenceFeedback }>('/api/vocab/en/sentence', {
      method: 'POST',
      json: { itemId, sentence, model: getSelectedModel() ?? undefined },
    }).then(aiUsed),
  stats: () => apiFetch<VocabStats>('/api/vocab/en/stats'),
  enrich: (deck: string, count: number) =>
    apiFetch<{ updated: number; requested: number }>('/api/admin/vocab/enrich', {
      method: 'POST',
      json: { deck, count, model: getSelectedModel() ?? undefined },
    }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
};

/** The meaning learners see: Vietnamese when translated, otherwise the English definition */
export const meaningOf = (word: Pick<EnWord, 'meaningVi' | 'meaningsEn'>) => word.meaningVi ?? word.meaningsEn[0] ?? '';

/**
 * Meanings of the right answer and the wrong choices in one language, so the language does not give the answer away:
 * Vietnamese only when every choice has it
 */
export function choiceMeanings(card: Pick<EnCard, 'item' | 'distractors'>): { answer: string; wrong: string[] } {
  const vietnamese = Boolean(card.item.meaningVi) && card.distractors.every((d) => d.meaningVi);
  return vietnamese
    ? { answer: card.item.meaningVi!, wrong: card.distractors.map((d) => d.meaningVi!) }
    : { answer: card.item.meaningsEn[0] ?? meaningOf(card.item), wrong: card.distractors.map((d) => d.meaningEn) };
}

export type QuestionMode = 'recognize' | 'recall' | 'listen' | 'cloze';

/**
 * Harder questions as a word is remembered: choose the meaning, choose the word, type what you hear,
 * then fill the word into its example sentence. Forgotten words go back to the easiest kind.
 */
export function questionMode(card: Pick<EnCard, 'reps' | 'lapses' | 'item'>, relearning: boolean): QuestionMode {
  if (relearning || card.reps <= 1) return 'recognize';
  if (card.reps === 2) return 'recall';
  // The fill-in needs the word to appear in its example (irregular forms like be → is do not)
  if (card.reps === 3 || !card.item.example || !formInExample(card.item.example, card.item.term)) return 'listen';
  return 'cloze';
}

/**
 * The word as it appears in the example (decision, decisions, decided...), for the fill-in question
 */
export function formInExample(example: string, term: string): string | null {
  const stem = term.replace(/e$/, '');
  const match = new RegExp(`\\b(${term}|${stem})(s|es|d|ed|ing|ies)?\\b`, 'i').exec(example);
  return match ? match[0] : null;
}

/**
 * Typed answer check: case, spaces and a trailing full stop do not matter
 */
export const sameWord = (a: string, b: string) => a.trim().replace(/[.!?]$/, '').toLowerCase() === b.trim().toLowerCase();

/**
 * The sentence of a paragraph that contains a word, kept as the saved word's context
 */
export function sentenceWith(paragraph: string, token: string): string {
  const sentences = paragraph.match(/[^.!?]+[.!?]*/g) ?? [paragraph];
  return (sentences.find((s) => s.includes(token)) ?? paragraph).trim().slice(0, 500);
}
