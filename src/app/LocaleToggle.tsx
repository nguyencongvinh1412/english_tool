/**
 * LocaleToggle
 * Small EN | VI segmented switch
 */
import type React from 'react';
import { useI18n, type Locale } from '@/i18n/I18nProvider';
import { useAuth } from './AuthProvider';
import './LocaleToggle.css';

const LOCALES: { id: Locale; label: string; name: string }[] = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'vi', label: 'VI', name: 'Tiếng Việt' },
];

export const LocaleToggle: React.FC = () => {
  const { locale, t } = useI18n();
  const { changeLocale } = useAuth();

  return (
    <div className="locale-toggle" role="group" aria-label={t.locale.label}>
      {LOCALES.map((option) => (
        <button
          key={option.id}
          type="button"
          lang={option.id}
          className={`locale-toggle__option ${locale === option.id ? 'locale-toggle__option--active' : ''}`}
          aria-pressed={locale === option.id}
          title={option.name}
          onClick={() => changeLocale(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
