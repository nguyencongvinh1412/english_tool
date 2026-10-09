/**
 * I18nProvider
 * Holds the UI locale, persists it per browser, and exposes typed messages via useI18n()
 */
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type Messages } from './en';
import { vi } from './vi';

export type Locale = 'en' | 'vi';

const MESSAGES: Record<Locale, Messages> = { en, vi };

/** localStorage key for the locale chosen before sign-in */
const LOCALE_STORAGE_KEY = 'english-tool:locale';

interface I18nContextValue {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
  /** Formats a date for the current locale */
  formatDate: (value: string | Date) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Reads the stored locale; English is the default
 */
function readStoredLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) === 'vi' ? 'vi' : 'en';
  } catch {
    return 'en';
  }
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Storage unavailable - locale lasts for this session only
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const dateFormat = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return {
      locale,
      t: MESSAGES[locale],
      setLocale,
      formatDate: (input) => dateFormat.format(new Date(input)),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

/**
 * Returns the current locale, typed messages and setLocale
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
