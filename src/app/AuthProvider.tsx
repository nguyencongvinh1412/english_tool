/**
 * AuthProvider
 * Loads the session once, exposes the user and auth actions,
 * and keeps the UI locale in sync with the user's saved preference
 */
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/shared/http';
import type { CurrentUser, ProfileUpdate } from '@/shared/types';
import { useI18n, type Locale } from '@/i18n/I18nProvider';
import { AI_USED_EVENT } from '@/services/api';

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  inviteCode: string;
}

interface AuthContextValue {
  /** undefined while the session is loading, null when signed out */
  user: CurrentUser | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (changes: ProfileUpdate) => Promise<CurrentUser>;
  /** Re-fetches the user, e.g. to refresh the AI quota */
  refresh: () => Promise<void>;
  /** Changes the UI language and saves it to the account when signed in */
  changeLocale: (locale: Locale) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);
  const { locale: currentLocale, setLocale } = useI18n();

  /** Applies a user from the server, adopting their saved language */
  const applyUser = useCallback(
    (next: CurrentUser | null) => {
      setUser(next);
      if (next) setLocale(next.uiLocale);
    },
    [setLocale]
  );

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await apiFetch<{ user: CurrentUser }>('/api/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    apiFetch<{ user: CurrentUser }>('/api/auth/me')
      .then(({ user: me }) => applyUser(me))
      .catch(() => setUser(null));
  }, [applyUser]);

  // Refresh the AI quota shown in the shell after each AI request
  useEffect(() => {
    const handleAiUsed = (): void => void refresh();
    window.addEventListener(AI_USED_EVENT, handleAiUsed);
    return () => window.removeEventListener(AI_USED_EVENT, handleAiUsed);
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      refresh,
      login: async (email, password) => {
        const { user: me } = await apiFetch<{ user: CurrentUser }>('/api/auth/login', {
          method: 'POST',
          json: { email, password },
        });
        applyUser(me);
      },
      register: async (input) => {
        const { user: me } = await apiFetch<{ user: CurrentUser }>('/api/auth/register', {
          method: 'POST',
          json: input,
        });
        setUser({ ...me, uiLocale: currentLocale });
        // Keep the language picked on the sign-up page
        void apiFetch('/api/me', { method: 'PATCH', json: { uiLocale: currentLocale } }).catch(() => {});
      },
      logout: async () => {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        setUser(null);
      },
      updateProfile: async (changes) => {
        const { user: me } = await apiFetch<{ user: CurrentUser }>('/api/me', { method: 'PATCH', json: changes });
        setUser(me);
        return me;
      },
      changeLocale: (locale) => {
        setLocale(locale);
        if (user) {
          setUser({ ...user, uiLocale: locale });
          void apiFetch('/api/me', { method: 'PATCH', json: { uiLocale: locale } }).catch(() => {});
        }
      },
    }),
    [user, refresh, applyUser, setLocale, currentLocale]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Returns the auth state and actions
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/**
 * Returns the signed-in user; only use below RequireAuth
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used without a signed-in user');
  return user;
}
