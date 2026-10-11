/**
 * RegisterPage
 * Invite-only sign-up; ?code=ET-XXXX-XXXX pre-fills the invite code
 */
import type React from 'react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Banner, Button, Field, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { ApiRequestError, errorMessage, fieldError } from '@/shared/http';
import { AuthLayout } from './AuthLayout';

const PASSWORD_MIN_LENGTH = 8;

export const RegisterPage: React.FC = () => {
  const { t } = useI18n();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    inviteCode: searchParams.get('code') ?? '',
  });
  const [error, setError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await register(form);
      navigate(ROUTES.ONBOARDING, { replace: true });
    } catch (err) {
      setError(err);
      setIsSubmitting(false);
    }
  };

  const isValidation = error instanceof ApiRequestError && error.code === 'validation_error';
  const canSubmit =
    form.displayName.trim() && form.email.trim() && form.password.length >= PASSWORD_MIN_LENGTH && form.inviteCode.trim();

  return (
    <AuthLayout title={t.auth.registerTitle} subtitle={t.auth.registerSubtitle}>
      <form className="auth__form" onSubmit={handleSubmit} noValidate>
        {error !== null && !isValidation && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

        <Field label={t.auth.inviteCode} hint={t.auth.inviteCodeHint} error={fieldError(error, 'inviteCode')}>
          {(id, describedBy) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              value={form.inviteCode}
              onChange={update('inviteCode')}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="ET-XXXX-XXXX"
              required
            />
          )}
        </Field>

        <Field label={t.auth.displayName} error={fieldError(error, 'displayName')}>
          {(id, describedBy) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              autoComplete="name"
              value={form.displayName}
              onChange={update('displayName')}
              maxLength={50}
              required
            />
          )}
        </Field>

        <Field label={t.auth.email} error={fieldError(error, 'email')}>
          {(id, describedBy) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              required
            />
          )}
        </Field>

        <Field label={t.auth.password} hint={t.auth.passwordHint} error={fieldError(error, 'password')}>
          {(id, describedBy) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              value={form.password}
              onChange={update('password')}
              required
            />
          )}
        </Field>

        <p className="auth__note">
          {t.auth.consent} <Link to={ROUTES.PRIVACY}>{t.auth.privacyLink}</Link>.
        </p>

        <Button type="submit" size="lg" block loading={isSubmitting} disabled={!canSubmit}>
          {t.auth.register}
        </Button>
      </form>

      <p className="auth__switch">
        {t.auth.haveAccount} <Link to={ROUTES.LOGIN}>{t.auth.signIn}</Link>
      </p>
    </AuthLayout>
  );
};
