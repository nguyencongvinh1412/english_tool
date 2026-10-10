/**
 * Route guards
 * Redirect based on session, onboarding and role
 */
import type React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/design';
import { useAuth } from './AuthProvider';
import { ROUTES } from './routes';

/**
 * Full-screen loader while the session is being checked
 */
const SessionLoader: React.FC = () => (
  <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--brand)' }}>
    <Spinner size={40} label="Loading" />
  </div>
);

/**
 * Only signed-in users; sends new users to onboarding first
 */
export const RequireAuth: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) return <SessionLoader />;
  if (user === null) return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname }} />;
  if (!user.onboarded && location.pathname !== ROUTES.ONBOARDING) {
    return <Navigate to={ROUTES.ONBOARDING} replace />;
  }

  return <Outlet />;
};

/**
 * Only admins; others go home
 */
export const RequireAdmin: React.FC = () => {
  const { user } = useAuth();
  return user?.role === 'admin' ? <Outlet /> : <Navigate to={ROUTES.HOME} replace />;
};

/**
 * Only signed-out visitors (login/register); signed-in users go home
 */
export const PublicOnly: React.FC = () => {
  const { user } = useAuth();

  if (user === undefined) return <SessionLoader />;
  if (user) return <Navigate to={ROUTES.HOME} replace />;

  return <Outlet />;
};
