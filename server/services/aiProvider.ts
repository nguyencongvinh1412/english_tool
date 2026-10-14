/**
 * AI source: the CLIProxyAPI proxy (default, set up by the operator) or the providers' official APIs.
 * An admin switches between them in the app; official keys come from the database (encrypted) or the environment.
 */
import { config } from '../config.js';
import { HttpError } from '../http/errors.js';
import { decryptSecret, encryptSecret } from './secrets.js';
import { getSetting, putSetting } from './settings.js';
import type { ChatTarget } from './cliproxy.js';

export type AiMode = 'proxy' | 'official';
export type ProviderId = 'anthropic' | 'gemini';

interface StoredSettings {
  mode: AiMode;
  /** Encrypted keys saved by an admin */
  keys?: Partial<Record<ProviderId, string>>;
}

/** OpenAI-compatible endpoints of the official APIs */
const ENDPOINTS: Record<ProviderId, { url: string; label: string; reasoning: boolean }> = {
  anthropic: { url: 'https://api.anthropic.com/v1/chat/completions', label: 'Anthropic', reasoning: false },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', label: 'Gemini', reasoning: true },
};

const ENV_KEYS: Record<ProviderId, () => string | undefined> = {
  anthropic: () => config.ANTHROPIC_API_KEY,
  gemini: () => config.GEMINI_API_KEY,
};

/** Official provider of a model, from its name */
export function providerOf(model: string): ProviderId | null {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini')) return 'gemini';
  return null;
}

const load = async (): Promise<StoredSettings> => (await getSetting<StoredSettings>('ai')) ?? { mode: 'proxy' };

/** The current AI source */
export async function getAiMode(): Promise<AiMode> {
  return (await load()).mode;
}

/** Where a key comes from: the admin's saved key wins over the environment */
export async function keyFor(provider: ProviderId): Promise<{ key: string; source: 'admin' | 'env' } | null> {
  const stored = (await load()).keys?.[provider];
  const decrypted = stored ? decryptSecret(stored) : null;
  if (decrypted) return { key: decrypted, source: 'admin' };
  const env = ENV_KEYS[provider]();
  return env ? { key: env, source: 'env' } : null;
}

/**
 * The request target for a model in official mode
 * @throws HttpError 503 when the model has no official provider or no key is set
 */
export async function officialTarget(model: string): Promise<ChatTarget> {
  const provider = providerOf(model);
  if (!provider) throw new HttpError(503, `The model ${model} is not available through the official APIs.`, 'ai_unavailable');
  const found = await keyFor(provider);
  if (!found) throw new HttpError(503, `No ${ENDPOINTS[provider].label} API key is set.`, 'ai_unavailable');
  return { url: ENDPOINTS[provider].url, apiKey: found.key, label: ENDPOINTS[provider].label, reasoning: ENDPOINTS[provider].reasoning };
}

export interface AiSettingsView {
  mode: AiMode;
  /** Keys can be saved in the app (SETTINGS_SECRET is set) */
  canStoreKeys: boolean;
  proxyConfigured: boolean;
  keys: Record<ProviderId, { source: 'admin' | 'env' | null; last4: string | null }>;
}

/** Current settings with keys masked */
export async function aiSettingsView(proxyConfigured: boolean): Promise<AiSettingsView> {
  const settings = await load();
  const keys = {} as AiSettingsView['keys'];
  for (const provider of Object.keys(ENDPOINTS) as ProviderId[]) {
    const found = await keyFor(provider);
    keys[provider] = { source: found?.source ?? null, last4: found ? found.key.slice(-4) : null };
  }
  return { mode: settings.mode, canStoreKeys: Boolean(config.SETTINGS_SECRET), proxyConfigured, keys };
}

/**
 * Saves the AI source and any new keys; an empty string removes a saved key
 * @throws HttpError 400 when keys are given without SETTINGS_SECRET
 */
export async function saveAiSettings(update: { mode?: AiMode; keys?: Partial<Record<ProviderId, string>> }): Promise<void> {
  const current = await load();
  const keys = { ...current.keys };
  for (const [provider, value] of Object.entries(update.keys ?? {}) as [ProviderId, string][]) {
    if (value === '') delete keys[provider];
    else {
      if (!config.SETTINGS_SECRET) throw new HttpError(400, 'Set SETTINGS_SECRET on the server to save keys in the app, or use the environment variables.', 'secret_missing');
      keys[provider] = encryptSecret(value.trim());
    }
  }
  await putSetting('ai', { mode: update.mode ?? current.mode, keys } satisfies StoredSettings);
}
