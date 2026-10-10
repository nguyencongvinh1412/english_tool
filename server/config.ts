/**
 * Server Configuration
 * Validates environment variables once at startup so misconfiguration fails fast
 */
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

/** Default models learners may use when an admin has not assigned any */
const DEFAULT_LEARNER_MODELS = 'claude-haiku-5-5,gemini-3-flash,gpt-5.5';

/** Default AI requests per learner per day */
const DEFAULT_LEARNER_DAILY_AI_LIMIT = 100;

/**
 * Parses a comma-separated env value into a trimmed, non-empty list
 * @param value - Raw env value
 * @returns List of entries
 */
function parseList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.url({ message: 'DATABASE_URL must be a postgres:// URL' }),
  /**
   * Optional direct (or session-pooler) URL for migrations. Supabase's transaction pooler,
   * used for DATABASE_URL, does not keep the session state migrations rely on.
   */
  DATABASE_MIGRATION_URL: z.url().optional(),

  /** Bootstrap admin, created on startup when no admin exists yet */
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  LEARNER_DAILY_AI_LIMIT: z.coerce.number().int().nonnegative().default(DEFAULT_LEARNER_DAILY_AI_LIMIT),
  LEARNER_MODELS: z.string().default(DEFAULT_LEARNER_MODELS).transform(parseList),

  /** Kokoro text-to-speech server; empty disables server voices (browser speech is used) */
  TTS_BASE_URL: z.string().default('http://localhost:8880').transform((url) => url.replace(/\/+$/, '')),
  /** Where generated audio clips are cached */
  TTS_CACHE_DIR: z.string().default('.cache/tts'),

  /** Where uploaded documents, images and audio are stored: local disk or an S3-compatible bucket */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  /** Local storage folder, also used for temporary upload files with the s3 driver */
  UPLOAD_DIR: z.string().default('.cache/uploads'),
  /** S3 driver, e.g. Supabase Storage: https://<project>.supabase.co/storage/v1/s3 */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  /** Extra allowed origins for state-changing requests, comma-separated */
  APP_ORIGIN: z.string().default('').transform(parseList),

  /** Reverse proxies in front of the app (Render: 1), so req.ip is the client's address */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  /**
   * Cloudflare Access service token for upstreams reached through a tunnel (AI proxy, Kokoro).
   * Sent as CF-Access-Client-Id / CF-Access-Client-Secret so only this server can use them.
   */
  UPSTREAM_ACCESS_CLIENT_ID: z.string().optional(),
  UPSTREAM_ACCESS_CLIENT_SECRET: z.string().optional(),
}).refine(
  (env) => env.STORAGE_DRIVER !== 's3' || (env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY),
  { message: 'STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY', path: ['STORAGE_DRIVER'] }
);

/** Validated server configuration */
export type Config = z.infer<typeof envSchema>;

/**
 * Loads and validates configuration from process.env
 * @returns Validated configuration
 * @throws Exits the process with a readable message if validation fails
 */
function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

export const IS_PRODUCTION = config.NODE_ENV === 'production';

/**
 * Headers that authenticate this server to tunnelled upstreams (empty when not configured)
 */
export function upstreamAccessHeaders(): Record<string, string> {
  if (!config.UPSTREAM_ACCESS_CLIENT_ID || !config.UPSTREAM_ACCESS_CLIENT_SECRET) return {};
  return { 'CF-Access-Client-Id': config.UPSTREAM_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': config.UPSTREAM_ACCESS_CLIENT_SECRET };
}
