import type React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { ROUTES } from '@/constants';

/** Navigation item configuration */
interface NavItem {
  path: string;
  label: string;
}

/** Navigation links for sidebar */
const NAV_ITEMS: NavItem[] = [
  { path: ROUTES.HOME, label: 'Home' },
  { path: ROUTES.CONVERSATION, label: 'Conversation' },
  { path: ROUTES.PRONUNCIATION, label: 'Pronunciation' },
  { path: ROUTES.SCENARIOS, label: 'Scenarios' },
];

/**
 * Main layout component with sidebar navigation
 * Provides consistent layout structure across all pages
 */
export const Layout: React.FC = () => {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">English Practice</h1>
        </div>
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.path} className="nav-item">
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'nav-link--active' : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};
