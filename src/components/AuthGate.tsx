/**
 * AuthGate Component
 * Shows a sign-in form until the user has a session, then renders the app.
 * Interim UI for phase 1; replaced by the full auth pages in phase 2.
 */

import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchCurrentUser, login, logout, type CurrentUser } from '@/services/auth';

/** Value exposed to the rest of the app */
interface AuthContextValue {
  user: CurrentUser;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Returns the signed-in user and sign-out action
 * @throws Error if used outside AuthGate
 */
// The hook lives next to its provider on purpose
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthGate');
  return value;
}

/**
 * Renders children only for signed-in users
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => setError('Could not reach the server. Please try again.'))
      .finally(() => setIsChecking(false));
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      setUser(await login(email, password));
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking) {
    return null;
  }

  if (user) {
    return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
  }

  return (
    <div className="auth-gate">
      <form className="auth-gate__card" onSubmit={handleSubmit}>
        <h1 className="auth-gate__title">English Practice</h1>
        <p className="auth-gate__subtitle">Sign in to continue</p>

        <label className="auth-gate__label" htmlFor="auth-email">
          Email
        </label>
        <input
          id="auth-email"
          className="auth-gate__input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label className="auth-gate__label" htmlFor="auth-password">
          Password
        </label>
        <input
          id="auth-password"
          className="auth-gate__input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error && (
          <div className="chat-error">
            <span className="chat-error__message">{error}</span>
          </div>
        )}

        <button type="submit" className="next-phrase-btn auth-gate__submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};
