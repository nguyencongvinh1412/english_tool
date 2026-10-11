/**
 * LoginPage
 */
import type React from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Banner, Button, Field, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/shared/http';
import { AuthLayout } from './AuthLayout';

export const LoginPage: React.FC = () => {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== ROUTES.LOGIN ? from : ROUTES.HOME, { replace: true });
    } catch (err) {
      setError(err);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout title={t.auth.signInTitle} subtitle={t.auth.signInSubtitle}>
      <form className="auth__form" onSubmit={handleSubmit} noValidate>
        {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

        <Field label={t.auth.email}>
          {(id) => (
            <TextInput
              id={id}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          )}
        </Field>

        <Field label={t.auth.password}>
          {(id) => (
            <TextInput
              id={id}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          )}
        </Field>

        <Button type="submit" size="lg" block loading={isSubmitting} disabled={!email || !password}>
          {t.auth.signIn}
        </Button>
        <p className="auth__note">{t.auth.forgotPassword}</p>
      </form>

      <p className="auth__switch">
        {t.auth.noAccount} <Link to={ROUTES.REGISTER}>{t.auth.createAccount}</Link>
      </p>
      <p className="auth__legal">
        <Link to={ROUTES.PRIVACY}>{t.profile.privacyLink}</Link>
      </p>
    </AuthLayout>
  );
};
