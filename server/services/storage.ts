/**
 * File Storage
 * Uploaded media lives on local disk (Docker volume) or in an S3-compatible bucket such as
 * Supabase Storage. Keys are opaque ("ab/<uuid>.ext"), so switching drivers needs no schema change.
 */
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { HttpError } from '../http/errors.js';

let s3Client: S3Client | null = null;

/**
 * Bucket client (created on first use)
 */
function s3(): S3Client {
  s3Client ??= new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    // Supabase Storage and most S3-compatible services need path-style URLs
    forcePathStyle: true,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! },
  });
  return s3Client;
}

/** Whether files live in the S3-compatible bucket (otherwise on local disk) */
export const isBucket = () => config.STORAGE_DRIVER === 's3';

/**
 * Absolute local path for a storage key (local driver)
 */
function localPath(key: string): string {
  return path.resolve(config.UPLOAD_DIR, key);
}

/**
 * Directory for multer's temporary files (on the upload volume, so adopting is a rename)
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
export async function saveBuffer(data: Buffer, extension: string, mime = 'application/octet-stream'): Promise<string> {
  const key = newKey(extension);
  if (isBucket()) {
    await s3().send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: data, ContentType: mime }));
    return key;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return key;
}

/**
 * Moves an uploaded temp file into storage and returns the key
 */
export async function adoptFile(tempPath: string, extension: string, mime = 'application/octet-stream'): Promise<string> {
  const key = newKey(extension);
  if (isBucket()) {
    const { size } = await stat(tempPath);
    await s3().send(
      new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: createReadStream(tempPath), ContentLength: size, ContentType: mime })
    );
    await rm(tempPath, { force: true });
    return key;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await rename(tempPath, file);
  return key;
}

/**
 * Reads a whole stored file (documents for parsing, images for OCR)
 */
export async function readObject(key: string): Promise<Buffer> {
  if (!isBucket()) return readFile(localPath(key));
  const object = await s3().send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  return Buffer.from(await object.Body!.transformToByteArray());
}

/**
 * Deletes a stored file (missing files are ignored)
 */
export async function removeFile(key: string): Promise<void> {
  if (isBucket()) {
    await s3().send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return;
  }
  await rm(localPath(key), { force: true });
}

/**
 * Streams a stored file to the client, honouring Range requests so audio can seek
 * @throws HttpError 404 when the file is missing
 */
export async function sendObject(key: string, mime: string, cacheSec: number, req: Request, res: Response): Promise<void> {
  const headers = { 'Content-Type': mime, 'Cache-Control': `private, max-age=${cacheSec}` };

  if (!isBucket()) {
    await new Promise<void>((resolve, reject) => {
      // Dev uploads live under ".cache"; keys are generated, never user-supplied paths
      res.sendFile(localPath(key), { dotfiles: 'allow', headers }, (error) => {
        if (!error) resolve();
        else if (res.headersSent) resolve();
        else reject(new HttpError(404, 'File not found.', 'not_found'));
      });
    });
    return;
  }

  const range = typeof req.headers.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range) ? req.headers.range : undefined;
  let object;
  try {
    object = await s3().send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Range: range }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 416) throw new HttpError(416, 'Range not satisfiable.', 'bad_range');
    throw new HttpError(404, 'File not found.', 'not_found');
  }

  res.status(object.ContentRange ? 206 : 200);
  res.set({ ...headers, 'Accept-Ranges': 'bytes' });
  if (object.ContentLength !== undefined) res.set('Content-Length', String(object.ContentLength));
  if (object.ContentRange) res.set('Content-Range', object.ContentRange);
  if (object.ETag) res.set('ETag', object.ETag);

  await new Promise<void>((resolve, reject) => {
    const body = object.Body as Readable;
    body.on('error', reject);
    res.on('close', resolve);
    body.pipe(res);
  });
}

/**
 * Whether a bucket object exists (bucket driver only)
 */
export async function bucketHas(key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return false;
    throw error;
  }
}

/**
 * Stores bytes under a chosen key in the bucket (bucket driver only), for content-addressed files such as audio clips
 */
export async function bucketPut(key: string, data: Buffer, mime: string): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: data, ContentType: mime }));
}
