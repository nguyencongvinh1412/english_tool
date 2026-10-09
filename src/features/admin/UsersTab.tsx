/**
 * UsersTab
 * User list with role, status, today's AI usage and model access; edit in a modal
 */
import type React from 'react';
import { useState } from 'react';
import { Badge, Banner, Button, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { errorMessage } from '@/shared/http';
import { adminApi, type AdminUser } from './adminApi';
import { EditUserModal } from './EditUserModal';
import { useAsync } from './useAsync';

export const UsersTab: React.FC = () => {
  const { t, formatDate } = useI18n();
  const me = useCurrentUser();
  const { data, error, isLoading, reload } = useAsync(() => adminApi.listUsers());
  const [editing, setEditing] = useState<AdminUser | null>(null);

  if (isLoading && !data) return <div className="admin__loading"><Spinner size={32} label={t.common.loading} /></div>;
  if (error) return <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={reload}>{t.common.retry}</Button>}>{errorMessage(error, t)}</Banner>;
  if (!data) return null;

  const modelsSummary = (user: AdminUser): string => {
    if (user.effectiveAllowedModels === null) return t.admin.users.allModels;
    return user.allowedModels === null
      ? t.admin.users.defaultModels(user.effectiveAllowedModels.length)
      : t.admin.users.customModels(user.effectiveAllowedModels.length);
  };

  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t.admin.users.name}</th>
              <th scope="col">{t.admin.users.role}</th>
              <th scope="col">{t.admin.users.status}</th>
              <th scope="col">{t.admin.users.aiToday}</th>
              <th scope="col">{t.admin.users.models}</th>
              <th scope="col">{t.admin.users.lastLogin}</th>
              <th scope="col"><span className="visually-hidden">{t.common.edit}</span></th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((user) => {
              const limit = user.effectiveDailyAiLimit;
              const ratio = limit ? user.aiUsedToday / limit : 0;

              return (
                <tr key={user.id}>
                  <td data-label={t.admin.users.name}>
                    <span className="admin-user">
                      <span className="admin-user__name">
                        {user.displayName}
                        {user.id === me.id && <span className="admin-user__you"> ({t.common.you})</span>}
                      </span>
                      <span className="admin-user__email">{user.email}</span>
                    </span>
                  </td>
                  <td data-label={t.admin.users.role}>
                    <Badge tone={user.role === 'admin' ? 'exam' : 'neutral'}>{t.profile.role[user.role]}</Badge>
                  </td>
                  <td data-label={t.admin.users.status}>
                    <Badge tone={user.status === 'active' ? 'success' : 'danger'}>
                      {user.status === 'active' ? t.admin.users.active : t.admin.users.disabled}
                    </Badge>
                  </td>
                  <td data-label={t.admin.users.aiToday}>
                    <span className={`admin-usage ${ratio >= 0.9 ? 'admin-usage--high' : ''}`}>
                      {user.aiUsedToday}
                      <span className="admin-usage__limit">/{limit ?? '∞'}</span>
                    </span>
                  </td>
                  <td data-label={t.admin.users.models}>{modelsSummary(user)}</td>
                  <td data-label={t.admin.users.lastLogin}>
                    {user.lastLoginAt ? formatDate(user.lastLoginAt) : t.common.never}
                  </td>
                  <td className="admin-table__actions">
                    <Button size="sm" variant="secondary" icon="pen" onClick={() => setEditing(user)}>
                      {t.common.edit}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          defaults={data.defaults}
          isSelf={editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </>
  );
};
