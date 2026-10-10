/**
 * AuthLayout
 * Split screen: playful brand panel with floating skill stickers, form on the right
 */
import type React from 'react';
import { Icon, type IconName } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { Logo } from '@/app/AppShell';
import { LocaleToggle } from '@/app/LocaleToggle';
import './auth.css';

/** Decorative stickers around the hero headline */
const STICKERS: { icon: IconName; tone: string; word: string }[] = [
  { icon: 'headphones', tone: 'listening', word: 'listen' },
  { icon: 'book', tone: 'reading', word: 'read' },
  { icon: 'mic', tone: 'speaking', word: 'speak' },
  { icon: 'pen', tone: 'writing', word: 'write' },
];

export const AuthLayout: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => {
  const { t } = useI18n();

  return (
    <div className="auth">
      <section className="auth__hero" aria-hidden="true">
        <div className="auth__hero-inner">
          <div className="auth__stickers">
            {STICKERS.map((sticker, index) => (
              <span
                key={sticker.word}
                className="auth__sticker"
                style={{ ['--tone' as string]: `var(--${sticker.tone})`, ['--i' as string]: index }}
              >
                <Icon name={sticker.icon} size={22} />
                {sticker.word}
              </span>
            ))}
          </div>
          <p className="auth__tagline">{t.auth.tagline}</p>
          <ul className="auth__features">
            {t.auth.features.map((feature) => (
              <li key={feature}>
                <Icon name="check" size={18} />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="auth__panel">
        <div className="auth__topbar">
          <Logo />
          <LocaleToggle />
        </div>
        <div className="auth__form-wrap reveal">
          <h1 className="auth__title">{title}</h1>
          <p className="auth__subtitle">{subtitle}</p>
          {children}
        </div>
      </section>
    </div>
  );
};
