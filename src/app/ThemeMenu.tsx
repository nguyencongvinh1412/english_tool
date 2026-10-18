/**
 * ThemeMenu
 * Header button that opens a small menu to pick the colour theme
 */
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { THEME_MODES, useTheme } from '@/shared/theme';
import './ThemeMenu.css';

export const ThemeMenu: React.FC = () => {
  const { t } = useI18n();
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="theme-menu" ref={root}>
      <button
        type="button"
        className="theme-menu__button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t.profile.theme.title}
        title={t.profile.theme.title}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} />
      </button>
      {open && (
        <div className="theme-menu__panel" id={menuId} role="group" aria-label={t.profile.theme.title}>
          {THEME_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`theme-menu__option ${theme === mode ? 'theme-menu__option--active' : ''}`}
              aria-pressed={theme === mode}
              onClick={() => {
                setTheme(mode);
                setOpen(false);
              }}
            >
              <span className={`theme-menu__swatch theme-menu__swatch--${mode}`} aria-hidden="true" />
              {t.profile.theme[mode]}
              {theme === mode && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
