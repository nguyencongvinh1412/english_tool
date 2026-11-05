/**
 * Appearance preference, stored in this browser: a colour mode (system, light or dark) and an accent colour.
 * The mode is written to <html data-theme> (removed for 'auto', which follows the system setting); the accent to
 * <html data-accent> (removed for teal, the default).
 */
import { useSyncExternalStore } from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type Accent = 'teal' | 'indigo' | 'clay';

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'auto'];
export const ACCENTS: Accent[] = ['teal', 'indigo', 'clay'];

const MODE_KEY = 'theme';
const ACCENT_KEY = 'accent';
const DEFAULT_MODE: ThemeMode = 'auto';
const DEFAULT_ACCENT: Accent = 'teal';
const listeners = new Set<() => void>();

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    // Old values such as 'warm' (a retired theme) fall back to the default
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

const readMode = () => read<ThemeMode>(MODE_KEY, THEME_MODES, DEFAULT_MODE);
const readAccent = () => read<Accent>(ACCENT_KEY, ACCENTS, DEFAULT_ACCENT);

/** Brand colour per accent and mode, for the browser's theme-color */
const META_COLORS: Record<Accent, string> = { teal: '#006c67', indigo: '#4055ac', clay: '#9e511e' };

function apply(): void {
  const mode = readMode();
  const accent = readAccent();
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  if (accent === DEFAULT_ACCENT) root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', accent);
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#13161c' : META_COLORS[accent]);
}

/** Call once before the first render so there is no flash of the wrong theme */
export function initTheme(): void {
  apply();
  // With 'auto', keep the browser's theme-color in step with the system setting
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', apply);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the choice lasts until reload
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => DEFAULT_MODE);
  return [mode, (next) => write(MODE_KEY, next)];
}

export function useAccent(): [Accent, (accent: Accent) => void] {
  const accent = useSyncExternalStore(subscribe, readAccent, () => DEFAULT_ACCENT);
  return [accent, (next) => write(ACCENT_KEY, next)];
}
