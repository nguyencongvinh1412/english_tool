/**
 * Encryption of secrets kept in the database (API keys an admin saves in the app).
 * AES-256-GCM with a key derived from SETTINGS_SECRET.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

/** Whether keys may be stored in the database */
export const canStoreSecrets = (): boolean => Boolean(config.SETTINGS_SECRET);

const key = (): Buffer => createHash('sha256').update(config.SETTINGS_SECRET ?? '').digest();

/**
 * Encrypts a secret as "iv.tag.data" in base64
 * @throws Error when SETTINGS_SECRET is not set
 */
export function encryptSecret(plain: string): string {
  if (!config.SETTINGS_SECRET) throw new Error('SETTINGS_SECRET is not set');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

/**
 * Decrypts a secret written by encryptSecret
 * @returns The secret, or null when it cannot be read (wrong or missing SETTINGS_SECRET)
 */
export function decryptSecret(stored: string): string | null {
  if (!config.SETTINGS_SECRET) return null;
  try {
    const [iv, tag, data] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
