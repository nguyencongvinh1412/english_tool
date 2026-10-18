/**
 * Colour theme preference, stored in this browser. 'auto' follows the system setting; the default is warm paper.
 * The choice is written to <html data-theme>; with 'auto' the attribute is removed.
 */
import { useSyncExternalStore } from 'react';

export type ThemeMode = 'auto' | 'light' | 'warm' | 'dark';
export const THEME_MODES: ThemeMode[] = ['auto', 'light', 'warm', 'dark'];

const STORAGE_KEY = 'theme';
/** What people see until they pick something else */
const DEFAULT_THEME: ThemeMode = 'warm';
const listeners = new Set<() => void>();

function readTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEME_MODES.includes(value as ThemeMode) ? (value as ThemeMode) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyTheme(mode: ThemeMode): void {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#111318' : '#2f6bff');
}

/** Call once before the first render so there is no flash of the wrong theme */
export function initTheme(): void {
  applyTheme(readTheme());
}

export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    readTheme,
    () => DEFAULT_THEME
  );
  const setMode = (next: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice lasts until reload
    }
    applyTheme(next);
    listeners.forEach((listener) => listener());
  };
  return [mode, setMode];
}
