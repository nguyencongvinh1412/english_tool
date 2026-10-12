/**
 * AppShell
 * Sidebar on desktop, top bar + bottom tab bar on mobile
 */
import type React from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { Suspense } from 'react';
import { PageFallback } from './PageFallback';
import { Icon, type IconName } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth, useCurrentUser } from './AuthProvider';
import { LocaleToggle } from './LocaleToggle';
import { ModelPicker } from './ModelPicker';
import { StudyLanguageSwitch } from './StudyLanguageSwitch';
import { ROUTES } from './routes';
import { useProgress } from '@/shared/progress';
import './AppShell.css';

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  /** Color token for the active state */
  tone: string;
  /** Shown in the mobile tab bar */
  mobile?: boolean;
  end?: boolean;
}

/**
 * Brand mark: a speech bubble sticker
 */
export const Logo: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { t } = useI18n();

  return (
    <Link to={ROUTES.HOME} className="logo" aria-label={t.common.appName}>
      <svg className="logo__mark" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M10 8h44a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8H30l-12 10v-10h-8a8 8 0 0 1-8-8V16a8 8 0 0 1 8-8z" fill="var(--brand-edge)" />
        <path d="M10 4h44a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8H30l-12 10V46h-8a8 8 0 0 1-8-8V12a8 8 0 0 1 8-8z" fill="var(--brand)" />
        <text x="32" y="34" textAnchor="middle" fontSize="23" fontWeight="800" fill="var(--brand-ink)" fontFamily="var(--font-display)">
          Aa
        </text>
      </svg>
      {!compact && <span className="logo__text">{t.common.appName}</span>}
    </Link>
  );
};

/**
 * First letter avatar
 */
const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <span className="avatar" aria-hidden="true">
    {name.trim().charAt(0).toUpperCase() || '?'}
  </span>
);

export const AppShell: React.FC = () => {
  const { t } = useI18n();
  const { logout } = useAuth();
  const user = useCurrentUser();

  const items: NavItem[] = [
    { to: ROUTES.HOME, icon: 'home', label: t.nav.home, tone: 'brand', mobile: true, end: true },
    { to: ROUTES.LISTENING, icon: 'headphones', label: t.nav.listening, tone: 'listening', mobile: true },
    { to: ROUTES.READING, icon: 'book', label: t.nav.reading, tone: 'reading' },
    { to: ROUTES.SPEAKING, icon: 'mic', label: t.nav.speaking, tone: 'speaking', mobile: true },
    { to: ROUTES.WRITING, icon: 'pen', label: t.nav.writing, tone: 'writing' },
    { to: ROUTES.EXAMS, icon: 'exam', label: t.nav.exams, tone: 'exam', mobile: true },
  ];

  const accountItems: NavItem[] = [
    { to: ROUTES.PROFILE, icon: 'user', label: t.nav.profile, tone: 'brand', mobile: true },
    ...(user.role === 'admin' ? [{ to: ROUTES.ADMIN, icon: 'shield' as IconName, label: t.nav.admin, tone: 'exam' }] : []),
  ];

  const renderLink = (item: NavItem, variant: 'side' | 'tab') => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `${variant}-link ${isActive ? `${variant}-link--active` : ''}`}
      style={{ ['--nav-tone' as string]: `var(--${item.tone})` }}
    >
      <Icon name={item.icon} size={variant === 'tab' ? 24 : 22} />
      <span className={`${variant}-link__label`}>{item.label}</span>
    </NavLink>
  );

  const { summary, lastGain } = useProgress();
  const streak = summary?.streak;
  const quota = user.aiQuota;
  const quotaRatio = quota.limit ? quota.used / quota.limit : 0;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Logo />
        </div>
        <div className="sidebar__study">
          <StudyLanguageSwitch />
        </div>

        <nav className="sidebar__nav" aria-label={t.nav.mainNav}>
          {items.map((item) => renderLink(item, 'side'))}
          <hr className="sidebar__divider" />
          {accountItems.map((item) => renderLink(item, 'side'))}
        </nav>

        <div className="sidebar__footer">
          <ModelPicker />
          <div className="sidebar__user">
            <Avatar name={user.displayName} />
            <div className="sidebar__user-text">
              <span className="sidebar__user-name">{user.displayName}</span>
              <span className="sidebar__user-email">{user.email}</span>
            </div>
            <button type="button" className="icon-button" onClick={logout} aria-label={t.nav.signOut} title={t.nav.signOut}>
              <Icon name="logout" size={20} />
            </button>
          </div>
        </div>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          <div className="topbar__brand">
            <Logo compact />
          </div>
          <div className="topbar__study">
            <StudyLanguageSwitch compact />
          </div>
          <div className="topbar__spacer" />
          {streak && (
            <span
              className={`streak-pill ${streak.activeToday ? 'streak-pill--lit' : ''}`}
              title={streak.activeToday ? t.progress.keepStreak : streak.current > 0 ? t.progress.saveStreak : t.progress.startStreak}
            >
              <Icon name="flame" size={18} />
              <span className="streak-pill__value">{streak.current}</span>
              <span className="visually-hidden">{t.progress.streak(streak.current)}</span>
            </span>
          )}
          <span
            className={`quota-pill ${quotaRatio >= 0.9 ? 'quota-pill--low' : ''}`}
            title={t.shell.aiQuota(quota.used, quota.limit)}
          >
            <Icon name="bolt" size={16} />
            <span className="quota-pill__value">
              {quota.limit === null ? '∞' : Math.max(0, quota.limit - quota.used)}
            </span>
            <span className="visually-hidden">{t.shell.aiQuota(quota.used, quota.limit)}</span>
          </span>
          <LocaleToggle />
          <Link to={ROUTES.PROFILE} className="topbar__avatar" aria-label={t.nav.profile}>
            <Avatar name={user.displayName} />
          </Link>
        </header>

        <main className="content" id="main">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>

        {lastGain && (
          <div key={lastGain.id} className="xp-burst" role="status">
            <Icon name="bolt" size={26} />
            {t.progress.xpGain(lastGain.xp)}
          </div>
        )}
      </div>

      <nav className="tabbar" aria-label={t.nav.mainNav}>
        {[...items, ...accountItems].filter((item) => item.mobile).map((item) => renderLink(item, 'tab'))}
      </nav>
    </div>
  );
};
