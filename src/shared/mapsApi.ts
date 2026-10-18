/**
 * Personal mind maps API client (mirrors server/routes/maps.ts)
 */
import { apiFetch } from './http';
import type { Bilingual } from './grammarApi';
import type { MapDoc } from '@/features/maps/doc';

export interface MapSummary {
  id: string;
  title: string;
  language: 'en' | 'ja';
  nodeCount: number;
  version: number;
  updatedAt: string;
}

export interface MindMap {
  id: string;
  title: string;
  language: 'en' | 'ja';
  doc: MapDoc;
  version: number;
  updatedAt: string;
}

export interface LookupResult {
  grammar: { id: string; title: Bilingual; cefr: string }[];
  words: { id: string; term: string; level: string; meaning: string | null }[];
}

export const mapsApi = {
  list: () => apiFetch<{ maps: MapSummary[]; limit: number }>('/api/maps'),
  create: (body: { title?: string; template?: 'blank' | 'cluster'; clusterId?: string }) => apiFetch<{ map: MindMap }>('/api/maps', { method: 'POST', json: body }),
  get: (id: string) => apiFetch<{ map: MindMap }>(`/api/maps/${id}`),
  /** `keepalive` lets a save started while the page closes still go out */
  save: (id: string, body: { title?: string; doc?: MapDoc; version: number }, keepalive = false) =>
    apiFetch<{ version: number; updatedAt: string }>(`/api/maps/${id}`, { method: 'PUT', json: body, keepalive }),
  remove: (id: string) => apiFetch<void>(`/api/maps/${id}`, { method: 'DELETE' }),
  lookup: (q: string) => apiFetch<LookupResult>(`/api/maps/lookup?q=${encodeURIComponent(q)}`),
};
