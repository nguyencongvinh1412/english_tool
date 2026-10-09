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
import './admin.css';

type AdminTab = 'users' | 'invites' | 'usage';

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
          ]}
        />
      </div>

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'users' && <UsersTab />}
        {tab === 'invites' && <InvitesTab />}
        {tab === 'usage' && <UsageTab />}
      </div>
    </div>
  );
};
