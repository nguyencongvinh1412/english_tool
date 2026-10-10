/**
 * InvitesTab
 * Create, share and revoke invite codes
 */
import type React from 'react';
import { useState } from 'react';
import { Badge, Banner, Button, EmptyState, Field, Modal, Select, Spinner, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import type { Role } from '@/shared/types';
import { ROUTES } from '@/app/routes';
import { adminApi, type Invite } from './adminApi';
import { useAsync } from './useAsync';

type InviteStatus = 'active' | 'revoked' | 'expired' | 'usedUp';

/**
 * Derives the display status of an invite
 */
function inviteStatus(invite: Invite): InviteStatus {
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) return 'expired';
  if (invite.usedCount >= invite.maxUses) return 'usedUp';
  return 'active';
}

export const InvitesTab: React.FC = () => {
  const { t, formatDate } = useI18n();
  const toast = useToast();
  const { data, error, isLoading, reload } = useAsync(() => adminApi.listInvites());
  const [isCreating, setIsCreating] = useState(false);

  const copyLink = async (code: string): Promise<void> => {
    const link = `${window.location.origin}${ROUTES.REGISTER}?code=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast(t.common.copied, 'info');
    } catch {
      window.prompt(t.admin.invites.copyLink, link);
    }
  };

  const revoke = async (code: string): Promise<void> => {
    try {
      await adminApi.revokeInvite(code);
      toast(t.admin.invites.revokedToast);
      void reload();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    }
  };

  const statusLabel: Record<InviteStatus, string> = {
    active: t.admin.invites.activeStatus,
    revoked: t.admin.invites.revoked,
    expired: t.admin.invites.expired,
    usedUp: t.admin.invites.usedUp,
  };

  return (
    <>
      <div className="admin__toolbar">
        <Button icon="plus" onClick={() => setIsCreating(true)}>
          {t.admin.invites.create}
        </Button>
      </div>

      {isLoading && !data && <div className="admin__loading"><Spinner size={32} label={t.common.loading} /></div>}
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      {data && data.invites.length === 0 && <EmptyState icon="ticket" title={t.admin.tabs.invites}>{t.admin.invites.empty}</EmptyState>}

      {data && data.invites.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t.admin.invites.code}</th>
                <th scope="col">{t.admin.users.status}</th>
                <th scope="col">{t.admin.invites.uses}</th>
                <th scope="col">{t.admin.invites.grantRole}</th>
                <th scope="col">{t.admin.invites.expires}</th>
                <th scope="col">{t.admin.invites.note}</th>
                <th scope="col"><span className="visually-hidden">{t.admin.invites.revoke}</span></th>
              </tr>
            </thead>
            <tbody>
              {data.invites.map((invite) => {
                const status = inviteStatus(invite);
                return (
                  <tr key={invite.code} className={status !== 'active' ? 'admin-table__row--muted' : ''}>
                    <td data-label={t.admin.invites.code}>
                      <code className="invite-code">{invite.code}</code>
                    </td>
                    <td data-label={t.admin.users.status}>
                      <Badge tone={status === 'active' ? 'success' : status === 'revoked' ? 'danger' : 'neutral'}>
                        {statusLabel[status]}
                      </Badge>
                    </td>
                    <td data-label={t.admin.invites.uses}>
                      {invite.usedCount}/{invite.maxUses}
                    </td>
                    <td data-label={t.admin.invites.grantRole}>{t.profile.role[invite.role]}</td>
                    <td data-label={t.admin.invites.expires}>{invite.expiresAt ? formatDate(invite.expiresAt) : '—'}</td>
                    <td data-label={t.admin.invites.note}>{invite.note ?? '—'}</td>
                    <td className="admin-table__actions">
                      {status === 'active' && (
                        <span className="admin-table__buttons">
                          <Button size="sm" variant="secondary" icon="copy" onClick={() => copyLink(invite.code)}>
                            {t.admin.invites.copyLink}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => revoke(invite.code)}>
                            {t.admin.invites.revoke}
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isCreating && (
        <CreateInviteModal
          onClose={() => setIsCreating(false)}
          onCreated={(invite) => {
            setIsCreating(false);
            toast(t.admin.invites.created);
            void reload();
            void copyLink(invite.code);
          }}
        />
      )}
    </>
  );
};

const CreateInviteModal: React.FC<{ onClose: () => void; onCreated: (invite: Invite) => void }> = ({
  onClose,
  onCreated,
}) => {
  const { t } = useI18n();
  const [form, setForm] = useState({ role: 'learner' as Role, maxUses: '1', expiresInDays: '7', note: '' });
  const [error, setError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);

  const maxUses = Number(form.maxUses);
  const expires = form.expiresInDays.trim() === '' ? null : Number(form.expiresInDays);
  const valid = Number.isInteger(maxUses) && maxUses >= 1 && (expires === null || (Number.isInteger(expires) && expires >= 1));

  const create = async (): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      const { invite } = await adminApi.createInvite({
        role: form.role,
        maxUses,
        expiresInDays: expires,
        note: form.note.trim() || null,
      });
      onCreated(invite);
    } catch (err) {
      setError(err);
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t.admin.invites.createTitle}
      onClose={onClose}
      closeLabel={t.common.close}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button icon="ticket" onClick={create} loading={isSaving} disabled={!valid}>
            {t.admin.invites.create}
          </Button>
        </>
      }
    >
      <div className="admin-form">
        <div className="admin-form__row">
          <Field label={t.admin.invites.maxUses}>
            {(id) => (
              <TextInput id={id} type="number" min={1} max={1000} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            )}
          </Field>
          <Field label={t.admin.invites.expiresInDays} hint={t.admin.invites.expiresHint}>
            {(id, describedBy) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="number"
                min={1}
                max={365}
                value={form.expiresInDays}
                onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })}
              />
            )}
          </Field>
        </div>
        <Field label={t.admin.invites.grantRole}>
          {(id) => (
            <Select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="learner">{t.profile.role.learner}</option>
              <option value="admin">{t.profile.role.admin}</option>
            </Select>
          )}
        </Field>
        <Field label={t.admin.invites.note} hint={t.admin.invites.noteHint}>
          {(id, describedBy) => (
            <TextInput id={id} aria-describedby={describedBy} maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          )}
        </Field>
        {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      </div>
    </Modal>
  );
};
