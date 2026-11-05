/**
 * StudyLanguageMenu
 * "English ▾" / "日本語 ▾" in the page header: which language lessons, tests and progress show.
 * It is a setting, not navigation, so it lives in the header and the five main sections stay the same.
 */
import type React from 'react';
import { useState } from 'react';
import { Dropdown, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import type { StudyLanguage } from '@/shared/types';
import { useAuth, useCurrentUser } from './AuthProvider';

const OPTIONS: { value: StudyLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

export const StudyLanguageMenu: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const user = useCurrentUser();
  const { updateProfile } = useAuth();
  const [pending, setPending] = useState<StudyLanguage | null>(null);

  const choose = async (language: StudyLanguage): Promise<void> => {
    if (language === user.studyLanguage || pending) return;
    setPending(language);
    try {
      await updateProfile({ studyLanguage: language });
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setPending(null);
    }
  };

  return <Dropdown className="study-menu" label={t.studyLanguage.label} value={pending ?? user.studyLanguage} options={OPTIONS} onChange={(value) => void choose(value)} />;
};
