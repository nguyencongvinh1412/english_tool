/**
 * StudyLanguageSwitch
 * English | 日本語: which language the lessons, tests and progress are shown for
 */
import type React from 'react';
import { useState } from 'react';
import { Icon, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import type { StudyLanguage } from '@/shared/types';
import { useAuth, useCurrentUser } from './AuthProvider';
import './StudyLanguageSwitch.css';

const OPTIONS: { id: StudyLanguage; label: string; short: string; lang: string }[] = [
  { id: 'en', label: 'English', short: 'EN', lang: 'en' },
  { id: 'ja', label: '日本語', short: '日本', lang: 'ja' },
];

export const StudyLanguageSwitch: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { t } = useI18n();
  const toast = useToast();
  const user = useCurrentUser();
  const { updateProfile } = useAuth();
  const [pending, setPending] = useState<StudyLanguage | null>(null);
  const current = pending ?? user.studyLanguage;

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

  if (compact) {
    // Phones: one small button showing the current language; tapping switches to the other
    const other = OPTIONS.find((option) => option.id !== current)!;
    const active = OPTIONS.find((option) => option.id === current)!;
    return (
      <button
        type="button"
        lang={active.lang}
        className={`study-toggle study-toggle--${current}`}
        onClick={() => void choose(other.id)}
        aria-label={`${t.studyLanguage.label}: ${active.label}. ${t.studyLanguage.switchTo(other.label)}`}
        title={t.studyLanguage.switchTo(other.label)}
        disabled={pending !== null}
      >
        {active.short}
        <Icon name="swap" size={14} />
      </button>
    );
  }

  return (
    <div className="study-switch" role="group" aria-label={t.studyLanguage.label}>
      <span className="study-switch__caption">{t.studyLanguage.label}</span>
      <div className="study-switch__track">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            lang={option.lang}
            className={`study-switch__option study-switch__option--${option.id} ${current === option.id ? 'study-switch__option--active' : ''}`}
            aria-pressed={current === option.id}
            title={option.label}
            onClick={() => void choose(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
