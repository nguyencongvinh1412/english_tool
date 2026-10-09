/**
 * ProfilePage
 * Account details, learning goal, language, password
 */
import type React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, Button, Card, Field, Icon, PageHeader, Select, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth, useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { apiFetch, errorMessage, fieldError } from '@/shared/http';
import { CEFR_LEVELS, type CefrLevel, type ExamGoal } from '@/shared/types';
import './profile.css';

const PASSWORD_MIN_LENGTH = 8;

export const ProfilePage: React.FC = () => {
  const { t, formatDate } = useI18n();
  const { updateProfile, changeLocale, logout } = useAuth();
  const user = useCurrentUser();
  const toast = useToast();

  const [details, setDetails] = useState({
    displayName: user.displayName,
    targetExam: user.targetExam,
    cefrLevel: user.cefrLevel ?? '',
    targetScore: user.targetScore?.toString() ?? '',
  });
  const [detailsError, setDetailsError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [passwordError, setPasswordError] = useState<unknown>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const saveDetails = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setIsSaving(true);
    setDetailsError(null);

    try {
      await updateProfile({
        displayName: details.displayName.trim(),
        targetExam: details.targetExam,
        cefrLevel: (details.cefrLevel || null) as CefrLevel | null,
        targetScore: details.targetExam !== 'none' && details.targetScore ? Number(details.targetScore) : null,
      });
      toast(t.profile.saved);
    } catch (err) {
      setDetailsError(err);
    } finally {
      setIsSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setIsChangingPassword(true);
    setPasswordError(null);

    try {
      await apiFetch('/api/me/password', { method: 'POST', json: passwords });
      setPasswords({ currentPassword: '', newPassword: '' });
      toast(t.profile.passwordChanged);
    } catch (err) {
      setPasswordError(err);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="profile">
      <PageHeader eyebrow={t.nav.profile} title={t.profile.title} description={t.profile.subtitle} />

      <Card className="profile-id reveal" padding="lg" style={{ ['--i' as string]: 1 }}>
        <span className="profile-id__avatar" aria-hidden="true">
          {user.displayName.charAt(0).toUpperCase()}
        </span>
        <div className="profile-id__text">
          <h2 className="profile-id__name">{user.displayName}</h2>
          <p className="profile-id__meta">{user.email}</p>
          <p className="profile-id__meta">{t.profile.memberSince(formatDate(user.createdAt))}</p>
        </div>
        <Badge tone={user.role === 'admin' ? 'exam' : 'brand'} icon={user.role === 'admin' ? 'shield' : 'user'}>
          {t.profile.role[user.role]}
        </Badge>
      </Card>

      <div className="profile__grid">
        <Card padding="lg" className="reveal" style={{ ['--i' as string]: 2 }}>
          <form className="profile-form" onSubmit={saveDetails}>
            <h2 className="profile-form__title">{t.profile.details}</h2>

            <Field label={t.auth.displayName} error={fieldError(detailsError, 'displayName')}>
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  value={details.displayName}
                  maxLength={50}
                  onChange={(event) => setDetails({ ...details, displayName: event.target.value })}
                />
              )}
            </Field>

            <Field label={t.onboarding.goalLegend}>
              {(id) => (
                <Select
                  id={id}
                  value={details.targetExam}
                  onChange={(event) =>
                    setDetails({ ...details, targetExam: event.target.value as ExamGoal, targetScore: '' })
                  }
                >
                  {(['none', 'toeic', 'ielts'] as const).map((goal) => (
                    <option key={goal} value={goal}>
                      {t.onboarding.goals[goal].label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {details.targetExam !== 'none' && (
              <Field
                label={t.onboarding.targetScore}
                hint={details.targetExam === 'toeic' ? t.onboarding.targetScoreHintToeic : t.onboarding.targetScoreHintIelts}
                error={fieldError(detailsError, 'targetScore')}
              >
                {(id, describedBy) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    type="number"
                    inputMode="decimal"
                    step={details.targetExam === 'ielts' ? 0.5 : 5}
                    min={details.targetExam === 'ielts' ? 1 : 10}
                    max={details.targetExam === 'ielts' ? 9 : 990}
                    value={details.targetScore}
                    onChange={(event) => setDetails({ ...details, targetScore: event.target.value })}
                  />
                )}
              </Field>
            )}

            <Field label={t.dashboard.level}>
              {(id) => (
                <Select id={id} value={details.cefrLevel} onChange={(event) => setDetails({ ...details, cefrLevel: event.target.value })}>
                  <option value="">—</option>
                  {CEFR_LEVELS.map((cefr) => (
                    <option key={cefr} value={cefr}>
                      {cefr} · {t.onboarding.levels[cefr]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label={t.locale.label}>
              {(id) => (
                <Select id={id} value={user.uiLocale} onChange={(event) => changeLocale(event.target.value as 'en' | 'vi')}>
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                </Select>
              )}
            </Field>

            {detailsError !== null && <Banner tone="danger">{errorMessage(detailsError, t)}</Banner>}

            <Button type="submit" loading={isSaving} disabled={!details.displayName.trim()}>
              {t.common.save}
            </Button>
          </form>
        </Card>

        <div className="profile__side">
          <Card padding="lg" className="reveal" style={{ ['--i' as string]: 3 }}>
            <form className="profile-form" onSubmit={changePassword}>
              <h2 className="profile-form__title">{t.profile.security}</h2>

              <Field label={t.profile.currentPassword}>
                {(id) => (
                  <TextInput
                    id={id}
                    type="password"
                    autoComplete="current-password"
                    value={passwords.currentPassword}
                    onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
                  />
                )}
              </Field>

              <Field label={t.profile.newPassword} hint={t.auth.passwordHint} error={fieldError(passwordError, 'newPassword')}>
                {(id, describedBy) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    type="password"
                    autoComplete="new-password"
                    value={passwords.newPassword}
                    onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                  />
                )}
              </Field>

              {passwordError !== null && <Banner tone="danger">{errorMessage(passwordError, t)}</Banner>}

              <Button
                type="submit"
                variant="secondary"
                loading={isChangingPassword}
                disabled={!passwords.currentPassword || passwords.newPassword.length < PASSWORD_MIN_LENGTH}
              >
                {t.profile.changePassword}
              </Button>
            </form>
          </Card>

          <div className="profile__links reveal" style={{ ['--i' as string]: 4 }}>
            {user.role === 'admin' && (
              <Link to={ROUTES.ADMIN} className="profile-link">
                <Icon name="shield" size={20} />
                {t.nav.admin}
                <Icon name="chevronRight" size={18} />
              </Link>
            )}
            <button type="button" className="profile-link profile-link--danger" onClick={logout}>
              <Icon name="logout" size={20} />
              {t.nav.signOut}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
