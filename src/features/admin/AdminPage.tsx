/**
 * AdminPage
 * Tabs for users, invite codes and AI usage
 */
import type React from 'react';
import { useState } from 'react';
import { PageHeader, Tabs } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { UsersTab } from './UsersTab';
import { InvitesTab } from './InvitesTab';
import { UsageTab } from './UsageTab';
import { ExamBankTab } from './ExamBankTab';
import { ImportsTab } from './ImportsTab';
import { GrammarAdminTab } from './GrammarAdminTab';
import './admin.css';

type AdminTab = 'users' | 'invites' | 'usage' | 'bank' | 'imports' | 'grammar';

export const AdminPage: React.FC = () => {
  const { t } = useI18n();
  const [tab, setTab] = useState<AdminTab>('users');

  return (
    <div className="admin">
      <PageHeader eyebrow={t.nav.admin} title={t.admin.title} description={t.admin.subtitle} />

      <div className="admin__tabs">
        <Tabs<AdminTab>
          label={t.admin.title}
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'users', label: t.admin.tabs.users },
            { id: 'invites', label: t.admin.tabs.invites },
            { id: 'usage', label: t.admin.tabs.usage },
            { id: 'bank', label: t.examBank.tab },
            { id: 'imports', label: t.imports.tab },
            { id: 'grammar', label: t.nav.grammar },
          ]}
        />
      </div>

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'users' && <UsersTab />}
        {tab === 'invites' && <InvitesTab />}
        {tab === 'usage' && <UsageTab />}
        {tab === 'bank' && <ExamBankTab />}
        {tab === 'imports' && <ImportsTab />}
        {tab === 'grammar' && <GrammarAdminTab />}
      </div>
    </div>
  );
};
