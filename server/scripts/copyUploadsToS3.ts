/**
 * Copies local uploads to the S3 bucket under the same keys, so a database restored from
 * local still points at every file. Run once before switching to STORAGE_DRIVER=s3:
 *   SOURCE_DIR=<local uploads folder> npm run storage:copy-to-s3   (with S3_* set in the env)
 */
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

/**
 * Files below a folder, as keys relative to it ("ab/<uuid>.ext"); multer's tmp folder is skipped
 */
async function listKeys(root: string, dir = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  const keys: string[] = [];
  for (const entry of entries) {
    const key = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (key !== 'tmp') keys.push(...(await listKeys(root, key)));
    } else {
      keys.push(key);
    }
  }
  return keys;
}

async function main(): Promise<void> {
  const source = path.resolve(process.env.SOURCE_DIR ?? '.cache/uploads');
  const bucket = required('S3_BUCKET');
  const client = new S3Client({
    endpoint: required('S3_ENDPOINT'),
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: required('S3_ACCESS_KEY_ID'), secretAccessKey: required('S3_SECRET_ACCESS_KEY') },
  });

  const keys = await listKeys(source);
  let copied = 0;
  for (const key of keys) {
    const exists = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(
      () => true,
      () => false
    );
    if (exists) continue;
    const file = path.join(source, key);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(file),
        ContentLength: (await stat(file)).size,
        ContentType: MIME[path.extname(key).slice(1)] ?? 'application/octet-stream',
      })
    );
    copied++;
  }
  console.log(`Copied ${copied} of ${keys.length} files to ${bucket} (${keys.length - copied} were already there).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
