/**
 * Personal mind maps API client (mirrors server/routes/maps.ts)
 */
import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';
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

export interface MapChange {
  type: 'added' | 'changed' | 'moved' | 'removed';
  id: string;
  text: string;
  from?: string;
}

/** A map the AI proposed and the learner has not accepted yet */
export interface MapDraft {
  id: string;
  kind: 'create' | 'update';
  mapId: string | null;
  /** Current name of the map being updated */
  mapTitle: string | null;
  title: string;
  summary: string | null;
  doc: MapDoc;
  nodeCount: number;
  changes: MapChange[];
  counts: { added: number; changed: number; moved: number; removed: number };
  expiresAt: string;
}

export interface MapIssue {
  id: string;
  nodeId: string;
  nodeText: string;
  kind: 'wrong' | 'unclear' | 'link' | 'missing';
  severity: 'error' | 'warning' | 'tip';
  problem: string;
  suggestion: string;
  fix?: { text?: string; note?: string; link?: { kind: 'grammar'; id: string } };
}

export type ProposeBody =
  | { intent: 'create'; instruction?: string }
  | { intent: 'topic'; topic: string; instruction?: string }
  | { intent: 'update'; mapId: string; instruction?: string; issues?: { nodeId: string; problem: string; suggestion: string }[] };

export const mapsApi = {
  list: () => apiFetch<{ maps: MapSummary[]; limit: number }>('/api/maps'),
  create: (body: { title?: string; template?: 'blank' | 'cluster'; clusterId?: string }) => apiFetch<{ map: MindMap }>('/api/maps', { method: 'POST', json: body }),
  get: (id: string) => apiFetch<{ map: MindMap }>(`/api/maps/${id}`),
  /** `keepalive` lets a save started while the page closes still go out */
  save: (id: string, body: { title?: string; doc?: MapDoc; version: number }, keepalive = false) =>
    apiFetch<{ version: number; updatedAt: string }>(`/api/maps/${id}`, { method: 'PUT', json: body, keepalive }),
  remove: (id: string) => apiFetch<void>(`/api/maps/${id}`, { method: 'DELETE' }),
  propose: (body: ProposeBody) =>
    apiFetch<{ draft: MapDraft }>('/api/maps/propose', { method: 'POST', json: { ...body, model: getSelectedModel() ?? undefined } }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r.draft;
    }),
  check: (id: string) =>
    apiFetch<{ issues: MapIssue[]; version: number }>(`/api/maps/${id}/check`, { method: 'POST', json: { model: getSelectedModel() ?? undefined } }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r;
    }),
  renameDraft: (id: string, title: string) => apiFetch<{ draft: MapDraft }>(`/api/maps/drafts/${id}`, { method: 'PATCH', json: { title } }).then((r) => r.draft),
  confirmDraft: (id: string, title?: string) => apiFetch<{ map: MindMap; previousVersion: number | null }>(`/api/maps/drafts/${id}/confirm`, { method: 'POST', json: { title } }),
  cancelDraft: (id: string) => apiFetch<void>(`/api/maps/drafts/${id}`, { method: 'DELETE' }),
  restore: (id: string, version: number) => apiFetch<{ map: MindMap; previousVersion: number }>(`/api/maps/${id}/restore`, { method: 'POST', json: { version } }),
  lookup: (q: string) => apiFetch<LookupResult>(`/api/maps/lookup?q=${encodeURIComponent(q)}`),
};
