/**
 * Media Routes
 * Admin uploads (documents, images, audio) and authenticated streaming
 */
import { Router } from 'express';
import multer from 'multer';
import { open, rm } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { mediaAssets, type MediaAsset } from '../db/schema.js';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http/errors.js';
import { adoptFile, storagePath, uploadTempDir } from '../services/storage.js';

type Kind = MediaAsset['kind'];

interface FileType {
  kind: Kind;
  mime: string;
  /** Checks the first bytes so a renamed file cannot pose as another type */
  magic: (head: Buffer) => boolean;
}

const ascii = (head: Buffer, at: number, text: string) => head.subarray(at, at + text.length).toString('latin1') === text;

/** Accepted extensions */
const FILE_TYPES: Record<string, FileType> = {
  pdf: { kind: 'document', mime: 'application/pdf', magic: (h) => ascii(h, 0, '%PDF') },
  docx: {
    kind: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: (h) => ascii(h, 0, 'PK'),
  },
  png: { kind: 'image', mime: 'image/png', magic: (h) => h[0] === 0x89 && ascii(h, 1, 'PNG') },
  jpg: { kind: 'image', mime: 'image/jpeg', magic: (h) => h[0] === 0xff && h[1] === 0xd8 },
  jpeg: { kind: 'image', mime: 'image/jpeg', magic: (h) => h[0] === 0xff && h[1] === 0xd8 },
  webp: { kind: 'image', mime: 'image/webp', magic: (h) => ascii(h, 0, 'RIFF') && ascii(h, 8, 'WEBP') },
  mp3: { kind: 'audio', mime: 'audio/mpeg', magic: (h) => ascii(h, 0, 'ID3') || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) },
  m4a: { kind: 'audio', mime: 'audio/mp4', magic: (h) => ascii(h, 4, 'ftyp') },
  wav: { kind: 'audio', mime: 'audio/wav', magic: (h) => ascii(h, 0, 'RIFF') && ascii(h, 8, 'WAVE') },
  ogg: { kind: 'audio', mime: 'audio/ogg', magic: (h) => ascii(h, 0, 'OggS') },
};

const MB = 1024 * 1024;
const MAX_BYTES: Record<Kind, number> = { document: 50 * MB, image: 15 * MB, audio: 200 * MB };
const MAX_FILES = 30;
const CACHE_SEC = 7 * 24 * 60 * 60;

/**
 * Validates an uploaded temp file and returns its type
 * @throws HttpError 400 for unsupported, mislabelled or oversized files
 */
async function inspect(file: Express.Multer.File): Promise<{ type: FileType; extension: string }> {
  const extension = path.extname(file.originalname).slice(1).toLowerCase();
  const type = FILE_TYPES[extension];
  if (!type) throw new HttpError(400, `Unsupported file type: ${file.originalname}`, 'unsupported_file');
  if (file.size > MAX_BYTES[type.kind]) throw new HttpError(400, `File is too large: ${file.originalname}`, 'file_too_large');

  const handle = await open(file.path, 'r');
  try {
    const head = Buffer.alloc(16);
    await handle.read(head, 0, 16, 0);
    if (!type.magic(head)) throw new HttpError(400, `File content does not match its type: ${file.originalname}`, 'unsupported_file');
  } finally {
    await handle.close();
  }
  return { type, extension: extension === 'jpeg' ? 'jpg' : extension };
}

/**
 * Asset fields sent to the client
 */
export function toPublicAsset(asset: MediaAsset) {
  return {
    id: asset.id,
    kind: asset.kind,
    mime: asset.mime,
    sizeBytes: asset.sizeBytes,
    originalName: asset.originalName,
    url: `/api/media/${asset.id}`,
  };
}

/**
 * Saves validated uploads as media assets
 */
export async function storeUploads(files: Express.Multer.File[], userId: string): Promise<MediaAsset[]> {
  const stored: MediaAsset[] = [];
  try {
    for (const file of files) {
      const { type, extension } = await inspect(file);
      const key = await adoptFile(file.path, extension);
      const [asset] = await db
        .insert(mediaAssets)
        .values({ kind: type.kind, storageKey: key, mime: type.mime, sizeBytes: file.size, originalName: file.originalname.slice(0, 200), uploadedBy: userId })
        .returning();
      stored.push(asset);
    }
  } finally {
    // Temp files that were not adopted (rejected or after an error)
    await Promise.all(files.map((f) => rm(f.path, { force: true })));
  }
  return stored;
}

/**
 * Multer middleware writing to the upload volume's temp folder
 */
export function uploadMiddleware() {
  const dir = uploadTempDir();
  mkdirSync(dir, { recursive: true });
  return multer({ dest: dir, limits: { fileSize: MAX_BYTES.audio, files: MAX_FILES } }).array('files', MAX_FILES);
}

/**
 * Creates the media router
 * @returns Router mounted at /api
 */
export function createMediaRouter(): Router {
  const router = Router();

  /**
   * POST /admin/media - Upload files (multipart field "files")
   */
  router.post('/admin/media', requireAuth, requireRole('admin'), uploadMiddleware(), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw new HttpError(400, 'No files were uploaded.', 'no_files');
    const assets = await storeUploads(files, currentUser(req).id);
    res.status(201).json({ assets: assets.map(toPublicAsset) });
  });

  /**
   * GET /media/:id - Stream an asset (Range supported); source documents are admin-only
   */
  router.get('/media/:id', requireAuth, async (req, res, next) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new HttpError(404, 'File not found.', 'not_found');

    const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id.data)).limit(1);
    if (!asset) throw new HttpError(404, 'File not found.', 'not_found');
    if (asset.kind === 'document' && currentUser(req).role !== 'admin') throw new HttpError(404, 'File not found.', 'not_found');

    res.sendFile(
      storagePath(asset.storageKey),
      { dotfiles: 'allow', headers: { 'Content-Type': asset.mime, 'Cache-Control': `private, max-age=${CACHE_SEC}` } },
      (error) => {
        if (error && !res.headersSent) next(new HttpError(404, 'File not found.', 'not_found'));
      }
    );
  });

  return router;
}
