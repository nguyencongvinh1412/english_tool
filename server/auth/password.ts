/**
 * Password Hashing
 * scrypt from node:crypto, encoded as scrypt$N$r$p$salt$hash so parameters can change later
 */
import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * scrypt cost parameters
 * OWASP suggests N=2^17; N=2^15 is a lighter cost suited to a small self-hosted app
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Memory limit must exceed 128 * N * r bytes */
const MAX_MEMORY = 128 * SCRYPT_N * SCRYPT_R * 2;

/**
 * Promisified scrypt with explicit options
 */
function deriveKey(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/**
 * Hashes a password with a random salt
 * @param password - Plain-text password
 * @returns Encoded hash string
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY,
  });

  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * Verifies a password against an encoded hash in constant time
 * @param password - Plain-text password
 * @param encoded - Hash produced by hashPassword
 * @returns True if the password matches
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltB64, keyB64] = encoded.split('$');

  if (algorithm !== 'scrypt' || !saltB64 || !keyB64) {
    return false;
  }

  const expected = Buffer.from(keyB64, 'base64');
  const N = Number(n);
  const key = await deriveKey(password, Buffer.from(saltB64, 'base64'), {
    N,
    r: Number(r),
    p: Number(p),
    maxmem: 128 * N * Number(r) * 2,
  });

  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Pre-computed hash used to keep login timing constant for unknown emails */
let dummyHashPromise: Promise<string> | null = null;

/**
 * Burns the same CPU time as a real verification, for unknown accounts
 * Prevents discovering registered emails via response timing
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(password, await dummyHashPromise);
}
