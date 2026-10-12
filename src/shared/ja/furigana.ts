/**
 * Furigana preference and the on-demand Japanese font
 */
import { useSyncExternalStore } from 'react';

export type FuriganaMode = 'always' | 'tap' | 'off';

const STORAGE_KEY = 'english-tool:furigana';
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap';
const listeners = new Set<() => void>();

function readMode(): FuriganaMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'always' || value === 'tap' || value === 'off' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The learner's furigana preference; null until they pick one
 */
export function useFuriganaPreference(): [FuriganaMode | null, (mode: FuriganaMode) => void] {
  const mode = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    readMode,
    () => null
  );
  const setMode = (next: FuriganaMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable: the choice lasts for this page only
    }
    listeners.forEach((listener) => listener());
  };
  return [mode, setMode];
}

/**
 * Loads Noto Sans JP once, only when Japanese is shown (the English app never downloads it)
 */
export function ensureJapaneseFont(): void {
  if (typeof document === 'undefined' || document.querySelector(`link[href="${FONT_HREF}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.appendChild(link);
}
