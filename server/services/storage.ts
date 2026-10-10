/**
 * File Storage
 * Local-disk driver for uploaded media. Keys are opaque ("ab/<uuid>.ext") so an
 * S3/Supabase Storage driver can replace this module later without schema changes.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Absolute path for a storage key
 */
export function storagePath(key: string): string {
  return path.resolve(config.UPLOAD_DIR, key);
}

/**
 * Directory for multer's temporary files (same volume, so moving is a rename)
 */
export function uploadTempDir(): string {
  return path.resolve(config.UPLOAD_DIR, 'tmp');
}

/**
 * New storage key with a sharded folder
 */
function newKey(extension: string): string {
  const id = randomUUID();
  return `${id.slice(0, 2)}/${id}.${extension}`;
}

/**
 * Stores bytes and returns the key
 */
export async function saveBuffer(data: Buffer, extension: string): Promise<string> {
  const key = newKey(extension);
  const file = storagePath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return key;
}

/**
 * Moves an uploaded temp file into storage and returns the key
 */
export async function adoptFile(tempPath: string, extension: string): Promise<string> {
  const key = newKey(extension);
  const file = storagePath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await rename(tempPath, file);
  return key;
}

/**
 * Deletes a stored file (missing files are ignored)
 */
export async function removeFile(key: string): Promise<void> {
  await rm(storagePath(key), { force: true });
}
