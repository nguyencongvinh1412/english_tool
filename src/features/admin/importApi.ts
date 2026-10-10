/**
 * Import API client and types (mirrors server/routes/imports.ts and server/imports/draft.ts)
 */
import { apiFetch } from '@/shared/http';
import type { ToeicPart } from '@/shared/examApi';

export type ImportStatus = 'uploaded' | 'parsing' | 'review' | 'published' | 'failed';
export type PageRange = [number, number];

export interface ImportRanges {
  questions?: PageRange;
  answers?: PageRange;
  transcripts?: PageRange;
}

export interface DraftIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface DraftGroup {
  key: string;
  part: ToeicPart;
  numbers: [number, number];
  /** Payload in exam shape; fields are edited in place by the review screen */
  payload: Record<string, unknown>;
  photoPages?: Record<string, number>;
  issues: DraftIssue[];
}

export interface DraftRecording {
  assetId: string;
  name: string;
}

export interface Draft {
  groups: DraftGroup[];
  recordings?: DraftRecording[];
}

export interface ImportSummary {
  id: string;
  title: string;
  exam: string;
  status: ImportStatus;
  progress: { step: string; done: number; total: number } | null;
  error: string | null;
  pageCount: number;
  groupCount: number;
  errorCount: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface ImportPage {
  n: number;
  text: string;
  imageUrl: string | null;
}

export interface ImportDetail extends ImportSummary {
  ranges: ImportRanges;
  documentUrl: string | null;
  /** PDFs render in the browser; DOCX pages are text only */
  isPdf: boolean;
  pages: ImportPage[];
  draft: Draft | null;
  coverage: { part: ToeicPart; missing: number[] }[];
}

export interface UploadedAsset {
  id: string;
  kind: 'document' | 'image' | 'audio';
  mime: string;
  sizeBytes: number;
  originalName: string;
  url: string;
}

/**
 * Uploads files (or blobs with names) to the media store
 */
export async function uploadMedia(files: (File | { blob: Blob; name: string })[]): Promise<UploadedAsset[]> {
  const form = new FormData();
  for (const file of files) {
    if (file instanceof File) form.append('files', file);
    else form.append('files', file.blob, file.name);
  }
  const { assets } = await apiFetch<{ assets: UploadedAsset[] }>('/api/admin/media', { method: 'POST', body: form });
  return assets;
}

/** Badge tone per status */
export const STATUS_TONE: Record<ImportStatus, 'neutral' | 'warning' | 'success' | 'danger' | 'exam'> = {
  uploaded: 'neutral',
  parsing: 'exam',
  review: 'warning',
  published: 'success',
  failed: 'danger',
};

export const importApi = {
  list: () => apiFetch<{ imports: ImportSummary[] }>('/api/admin/imports'),
  get: (id: string) => apiFetch<{ import: ImportDetail }>(`/api/admin/imports/${id}`),
  create: (title: string, documentAssetId: string) =>
    apiFetch<{ import: ImportDetail }>('/api/admin/imports', { method: 'POST', json: { title, documentAssetId } }),
  setPageImages: (id: string, images: { n: number; assetId: string }[]) =>
    apiFetch<{ import: ImportDetail }>(`/api/admin/imports/${id}/page-images`, { method: 'PUT', json: { images } }),
  parse: (id: string, ranges: ImportRanges) =>
    apiFetch<{ import: ImportDetail }>(`/api/admin/imports/${id}/parse`, { method: 'POST', json: { ranges } }),
  saveDraft: (id: string, draft: Draft, title?: string) =>
    apiFetch<{ import: ImportDetail }>(`/api/admin/imports/${id}/draft`, {
      method: 'PUT',
      json: {
        title,
        draft: {
          recordings: draft.recordings,
          groups: draft.groups.map((g) => ({ key: g.key, part: g.part, numbers: g.numbers, payload: g.payload, photoPages: g.photoPages })),
        },
      },
    }),
  publish: (id: string) => apiFetch<{ import: ImportDetail; groups: number }>(`/api/admin/imports/${id}/publish`, { method: 'POST' }),
  remove: (id: string) => apiFetch<void>(`/api/admin/imports/${id}`, { method: 'DELETE' }),
};
