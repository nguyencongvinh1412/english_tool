/**
 * ResetPasswordPage
 * Sets a new password with the one-time link an admin created
 */
import type React from 'react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Banner, Button, Field, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { apiFetch, errorMessage, fieldError } from '@/shared/http';
import { AuthLayout } from './AuthLayout';

const PASSWORD_MIN_LENGTH = 8;

export const ResetPasswordPage: React.FC = () => {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (mismatch) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/auth/password-reset', { method: 'POST', json: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout title={t.auth.resetTitle} subtitle={t.auth.resetSubtitle}>
      {done ? (
        <div className="auth__form">
          <Banner tone="success">{t.auth.resetDone}</Banner>
          <Link to={ROUTES.LOGIN} className="btn btn--primary btn--lg btn--block">
            {t.auth.backToSignIn}
          </Link>
        </div>
      ) : !token ? (
        <div className="auth__form">
          <Banner tone="warning">{t.auth.resetMissingToken}</Banner>
        </div>
      ) : (
        <form className="auth__form" onSubmit={handleSubmit} noValidate>
          {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

          <Field label={t.auth.newPassword} hint={t.auth.passwordHint} error={fieldError(error, 'password')}>
            {(id, describedBy) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoFocus
              />
            )}
          </Field>

          <Field label={t.auth.confirmPassword} error={mismatch ? t.auth.passwordsDiffer : undefined}>
            {(id, describedBy) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            )}
          </Field>

          <Button
            type="submit"
            size="lg"
            block
            loading={isSubmitting}
            disabled={password.length < PASSWORD_MIN_LENGTH || confirm !== password}
          >
            {t.auth.resetSubmit}
          </Button>
        </form>
      )}

      <p className="auth__switch">
        <Link to={ROUTES.LOGIN}>{t.auth.backToSignIn}</Link>
      </p>
    </AuthLayout>
  );
};
