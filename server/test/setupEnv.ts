/**
 * Test environment
 * Runs before each test file, before any server module reads process.env
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

if (!process.env.DATABASE_URL_TEST) {
  throw new Error('DATABASE_URL_TEST is not set. Add it to .env (see .env.example).');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
// A migration URL left in .env (production) would make runMigrations() change that database instead of the test one.
// Point it at the test database (deleting it is not enough: config.ts runs dotenv again and would bring it back)
process.env.DATABASE_MIGRATION_URL = process.env.DATABASE_URL_TEST;

// Tests create their own users; never bootstrap from the real admin credentials
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

// Deterministic AI access settings; AI calls themselves are mocked per test
process.env.LEARNER_DAILY_AI_LIMIT = '3';
process.env.LEARNER_MODELS = 'claude-haiku-5-5,gemini-3-flash';
process.env.CLIPROXY_BASE_URL = 'http://cliproxy.test';
process.env.CLIPROXY_API_KEY = 'test-key';
process.env.SETTINGS_SECRET = 'test-secret-test-secret-123';
process.env.TTS_BASE_URL = 'http://tts.test';
process.env.TTS_CACHE_DIR = '.cache/tts-test';
process.env.UPLOAD_DIR = '.cache/uploads-test';
delete process.env.GROQ_API_KEY;
