/**
 * Auth API client
 * Session lives in an HttpOnly cookie, so requests only need same-origin credentials
 */

/** Signed-in user as returned by /api/auth/me */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'learner';
  uiLocale: 'en' | 'vi';
  aiQuota: { used: number; limit: number | null };
}

/**
 * Error thrown by auth calls, carrying the server's message
 */
export class AuthError extends Error {
  /** HTTP status code */
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

/**
 * Sends a JSON request and returns the parsed body
 * @throws AuthError with the server's message on non-2xx
 */
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new AuthError(data.error ?? 'Request failed. Please try again.', response.status);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/**
 * Gets the signed-in user
 * @returns The user, or null if not signed in
 */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const { user } = await requestJson<{ user: CurrentUser }>('/api/auth/me');
    return user;
  } catch (error) {
    if (error instanceof AuthError && error.statusCode === 401) return null;
    throw error;
  }
}

/**
 * Signs in with email and password
 */
export async function login(email: string, password: string): Promise<CurrentUser> {
  const { user } = await requestJson<{ user: CurrentUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return user;
}

/**
 * Signs out of the current session
 */
export async function logout(): Promise<void> {
  await requestJson<void>('/api/auth/logout', { method: 'POST' });
}
