/**
 * Grammar mentions: finding the "@" being typed in the chat box and searching the grammar points for it
 */
import { grammarApi, type GrammarMap, type GrammarMapPoint } from '@/shared/grammarApi';

/** The "@query" being typed right before the caret */
export interface MentionToken {
  /** Index of the "@" */
  start: number;
  query: string;
}

/** A search longer than this is ordinary text that happens to follow an "@" */
const MAX_QUERY_CHARS = 30;

/**
 * The mention being typed at the caret, or null when the caret is not inside one.
 * The "@" must start the text or follow whitespace, so e-mail addresses do not open the list.
 */
export function mentionAt(text: string, caret: number): MentionToken | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start < 0 || (start > 0 && !/\s/.test(before[start - 1]))) return null;
  const query = before.slice(start + 1);
  if (query.length > MAX_QUERY_CHARS || query.includes('\n') || query.includes('@')) return null;
  return { start, query };
}

/** Lower case without accents, so "dong tu" finds "động từ" */
export const fold = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

/**
 * Points matching the query: titles that start with it first, then ones that contain it, then ids and clusters
 */
export function searchPoints(map: GrammarMap, query: string, excludeId?: string): GrammarMapPoint[] {
  const needle = fold(query.trim());
  const clusterTitle = new Map(map.clusters.map((c) => [c.id, fold(`${c.title.en} ${c.title.vi}`)]));
  const rank = (point: GrammarMapPoint): number => {
    if (!needle) return 0;
    const titles = [fold(point.title.en), fold(point.title.vi)];
    if (titles.some((title) => title.startsWith(needle))) return 0;
    if (titles.some((title) => title.split(/\s+/).some((word) => word.startsWith(needle)))) return 1;
    if (titles.some((title) => title.includes(needle))) return 2;
    if (fold(point.id).includes(needle) || clusterTitle.get(point.cluster)?.includes(needle)) return 3;
    return -1;
  };
  return map.points
    .filter((point) => point.id !== excludeId)
    .map((point, index) => ({ point, index, score: rank(point) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.point);
}

let mapPromise: Promise<GrammarMap> | null = null;

/**
 * The grammar map, loaded once per session
 */
export function loadGrammarMap(): Promise<GrammarMap> {
  mapPromise ??= grammarApi.map().catch((error) => {
    mapPromise = null;
    throw error;
  });
  return mapPromise;
}
