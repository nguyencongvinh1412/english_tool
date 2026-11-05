/**
 * AppShell
 * Five sections everywhere: Today, Roadmap, Practice, Tests, Me. Sidebar on desktop, tab bar on phones.
 * The study language, streak and AI credits sit in the header; they are settings and status, not navigation.
 */
import type React from 'react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { PageFallback } from './PageFallback';
import { Icon, type IconName } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from './AuthProvider';
import { AppStatus } from './AppStatus';
import { PageErrorBoundary } from './PageErrorBoundary';
import { NotificationChip } from './NotificationChip';
import { CreditChip } from './CreditChip';
import { StudyLanguageMenu } from './StudyLanguageMenu';
import { ROUTES } from './routes';
import { useProgress } from '@/shared/progress';
import { warmVoices } from '@/shared/speech';
import './AppShell.css';

interface NavItem {
  to: string;
  icon: IconName;
  label: string;
  end?: boolean;
  /** Other paths that belong to this section (activities, tools) */
  also?: string[];
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

const SIDEBAR_KEY = 'sidebar-collapsed';

/** Sidebar collapse state: remembered per browser; narrow laptops start collapsed */
function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      if (stored !== null) return stored === '1';
    } catch {
      // storage blocked: use the default
    }
    return window.innerWidth < 1100;
  });
  const toggle = () =>
    setCollapsed((current) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, current ? '0' : '1');
      } catch {
        // storage blocked: the choice lasts until reload
      }
      return !current;
    });
  return [collapsed, toggle];
}

const startsWith = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export const AppShell: React.FC = () => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const { pathname } = useLocation();

  // The voice server may be asleep; start it now so natural voices are ready when a lesson needs them
  useEffect(() => {
    warmVoices();
  }, []);

  const items: NavItem[] = [
    { to: ROUTES.HOME, icon: 'today', label: t.nav.today, end: true },
    { to: ROUTES.ROADMAP, icon: 'roadmap', label: t.nav.roadmap },
    {
      to: ROUTES.PRACTICE,
      icon: 'practice',
      label: t.nav.practice,
      also: [ROUTES.LISTENING, ROUTES.READING, ROUTES.SPEAKING, ROUTES.WRITING, ROUTES.VOCABULARY, ROUTES.GRAMMAR, '/japanese'],
    },
    { to: ROUTES.EXAMS, icon: 'tests', label: t.nav.tests },
    { to: ROUTES.ME, icon: 'user', label: t.nav.me, also: [ROUTES.MAPS, ROUTES.ADMIN, ROUTES.PRIVACY] },
  ];

  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const { summary, lastGain } = useProgress();
  const streak = summary?.streak;

  const renderLink = (item: NavItem, variant: 'side' | 'tab') => {
    const active = item.end ? pathname === item.to : startsWith(pathname, item.to) || (item.also ?? []).some((prefix) => startsWith(pathname, prefix));
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        title={variant === 'side' && collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={`${variant}-link ${active ? `${variant}-link--active` : ''}`}
      >
        <Icon name={item.icon} size={variant === 'side' ? 22 : 24} />
        <span className={`${variant}-link__label`}>{item.label}</span>
      </NavLink>
    );
  };

  return (
    <div className={`shell ${collapsed ? 'shell--collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Logo compact={collapsed} />
          <button
            type="button"
            className="icon-button sidebar__toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t.nav.expand : t.nav.collapse}
            aria-expanded={!collapsed}
            title={collapsed ? t.nav.expand : t.nav.collapse}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={20} />
          </button>
        </div>
        <nav className="sidebar__nav" aria-label={t.nav.mainNav}>
          {items.map((item) => renderLink(item, 'side'))}
        </nav>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          <div className="topbar__brand">
            <Logo compact />
          </div>
          <div className="topbar__spacer" />
          {streak && (
            <span className={`chip ${streak.activeToday ? 'chip--streak' : 'chip--plain'}`} title={streak.activeToday ? t.progress.keepStreak : streak.current > 0 ? t.progress.saveStreak : t.progress.startStreak}>
              <Icon name="flame" size={16} />
              <span className="chip__text">{streak.current}</span>
              <span className="visually-hidden">{t.progress.streak(streak.current)}</span>
            </span>
          )}
          <NotificationChip />
          <CreditChip />
          <StudyLanguageMenu />
          <Link to={ROUTES.ME} className="topbar__avatar" aria-label={t.nav.me}>
            <Avatar name={user.displayName} />
          </Link>
        </header>

        <main className="content" id="main">
          <AppStatus />
          <PageErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </PageErrorBoundary>
        </main>

        {lastGain && (
          <div key={lastGain.id} className="xp-burst" role="status">
            <Icon name="bolt" size={26} />
            {t.progress.xpGain(lastGain.xp)}
          </div>
        )}
      </div>

      <nav className="tabbar" aria-label={t.nav.mainNav}>
        {items.map((item) => renderLink(item, 'tab'))}
      </nav>
    </div>
  );
};
