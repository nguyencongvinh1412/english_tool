/**
 * HTTP client for the app's own API
 * Same-origin cookies carry the session; errors keep the server's stable `code`
 */
import type { Messages } from '@/i18n/en';

/** Field-level validation issue from the server */
export interface FieldIssue {
  path: string;
  message: string;
}

/**
 * Error from an API call
 */
export class ApiRequestError extends Error {
  public readonly status: number;
  /** Stable machine-readable code, e.g. "quota_exceeded" */
  public readonly code: string | undefined;
  public readonly issues: FieldIssue[];

  constructor(message: string, status: number, code?: string, issues: FieldIssue[] = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/** Status 0 means the request never reached the server */
const NETWORK_ERROR_STATUS = 0;

/**
 * Calls an API endpoint and returns its JSON body
 * @throws ApiRequestError on non-2xx or network failure
 */
export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;

  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      headers: json !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiRequestError('Network error', NETWORK_ERROR_STATUS, 'network');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiRequestError(data.error ?? response.statusText, response.status, data.code, data.issues ?? []);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/**
 * Turns any error into a message in the current UI language
 * Known server codes are translated; otherwise the server message is shown
 */
export function errorMessage(error: unknown, t: Messages): string {
  if (error instanceof ApiRequestError) {
    const translated = error.code && (t.errors as Record<string, string>)[error.code];
    if (translated) return translated;
    return error.status >= 500 ? t.errors.generic : error.message;
  }
  return t.errors.generic;
}

/**
 * Returns the server's message for one field, if the error is a validation error
 */
export function fieldError(error: unknown, field: string): string | undefined {
  if (error instanceof ApiRequestError) {
    return error.issues.find((issue) => issue.path === field)?.message;
  }
  return undefined;
}
