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

  /** Bootstrap admin, created on startup when no admin exists yet */
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  LEARNER_DAILY_AI_LIMIT: z.coerce.number().int().nonnegative().default(DEFAULT_LEARNER_DAILY_AI_LIMIT),
  LEARNER_MODELS: z.string().default(DEFAULT_LEARNER_MODELS).transform(parseList),

  /** Kokoro text-to-speech server; empty disables server voices (browser speech is used) */
  TTS_BASE_URL: z.string().default('http://localhost:8880').transform((url) => url.replace(/\/+$/, '')),
  /** Where generated audio clips are cached */
  TTS_CACHE_DIR: z.string().default('.cache/tts'),

  /** Extra allowed origins for state-changing requests, comma-separated */
  APP_ORIGIN: z.string().default('').transform(parseList),
});

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
