/**
 * AdminPage
 * The admin area: its own frame (sidebar of sections, a way back to the learning app), made for large screens
 */
import type React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/design';
import { ROUTES } from '@/app/routes';
import { useFocusMode } from '@/features/practice/useFocusMode';
import { useI18n } from '@/i18n/I18nProvider';
import { UsersTab } from './UsersTab';
import { InvitesTab } from './InvitesTab';
import { UsageTab } from './UsageTab';
import { ExamBankTab } from './ExamBankTab';
import { ImportsTab } from './ImportsTab';
import { GrammarAdminTab } from './GrammarAdminTab';
import { BillingTab } from './BillingTab';
import { PlacementBankTab } from './PlacementBankTab';
import { RoadmapSettingsTab } from './RoadmapSettingsTab';
import './admin.css';

type AdminTab = 'users' | 'invites' | 'usage' | 'bank' | 'imports' | 'grammar' | 'billing' | 'placement' | 'roadmap';

export const AdminPage: React.FC = () => {
  const { t } = useI18n();
  const [tab, setTab] = useState<AdminTab>('users');
  useFocusMode();

  const sections: { id: AdminTab; label: string; fresh?: boolean }[] = [
    { id: 'users', label: t.admin.tabs.users },
    { id: 'invites', label: t.admin.tabs.invites },
    { id: 'usage', label: t.admin.tabs.usage },
    { id: 'bank', label: t.examBank.tab },
    { id: 'imports', label: t.imports.tab },
    { id: 'grammar', label: t.nav.grammar },
    { id: 'billing', label: t.billing.adminTab },
    { id: 'roadmap', label: t.roadmapAdmin.tab, fresh: true },
    { id: 'placement', label: t.placementAdmin.tab, fresh: true },
  ];

  return (
    <>
      <div className="admin-small">
        <Icon name="shield" size={28} />
        <h1>{t.admin.largeScreenTitle}</h1>
        <p>{t.admin.largeScreenBody}</p>
        <Link to={ROUTES.HOME}>{t.admin.backToApp}</Link>
      </div>
      <div className="admin admin-shell">
        <nav className="admin-nav" aria-label={t.admin.title}>
          <p className="admin-nav__brand">
            <Icon name="shield" size={20} /> {t.nav.admin}
          </p>
          <Link to={ROUTES.HOME} className="admin-nav__back">
            <Icon name="arrowLeft" size={14} /> {t.admin.backToApp}
          </Link>
          {sections.map((section) => (
            <button key={section.id} type="button" className={`admin-nav__item ${tab === section.id ? 'admin-nav__item--on' : ''}`} aria-current={tab === section.id ? 'page' : undefined} onClick={() => setTab(section.id)}>
              {section.label}
              {section.fresh && <span className="admin-nav__new">{t.admin.newBadge}</span>}
            </button>
          ))}
        </nav>

        <div className="admin-shell__main" role="region" aria-label={sections.find((section) => section.id === tab)?.label}>
          {tab === 'users' && <UsersTab />}
          {tab === 'invites' && <InvitesTab />}
          {tab === 'usage' && <UsageTab />}
          {tab === 'bank' && <ExamBankTab />}
          {tab === 'imports' && <ImportsTab />}
          {tab === 'grammar' && <GrammarAdminTab />}
          {tab === 'billing' && <BillingTab />}
          {tab === 'placement' && <PlacementBankTab />}
          {tab === 'roadmap' && <RoadmapSettingsTab />}
        </div>
      </div>
    </>
  );
};
