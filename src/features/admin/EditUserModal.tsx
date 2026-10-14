/**
 * EditUserModal
 * Change a user's role, status, daily AI limit and model access
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Banner, Button, Field, Modal, Select, Spinner, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import type { Role } from '@/shared/types';
import { adminApi, type AdminDefaults, type AdminUser } from './adminApi';
import { UserPlan } from './UserPlan';

interface EditUserModalProps {
  user: AdminUser;
  defaults: AdminDefaults;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({ user, defaults, isSelf, onClose, onSaved }) => {
  const { t } = useI18n();
  const toast = useToast();
  const [role, setRole] = useState<Role>(user.role);
  const [status, setStatus] = useState(user.status);
  const [limit, setLimit] = useState(user.dailyAiLimit?.toString() ?? '');
  const [useDefaultModels, setUseDefaultModels] = useState(user.allowedModels === null);
  const [models, setModels] = useState<string[]>(user.allowedModels ?? defaults.learnerModels);
  const [availableModels, setAvailableModels] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    adminApi
      .listModels()
      .then(({ models: proxyModels }) =>
        // Keep assigned models visible even if the proxy no longer lists them
        setAvailableModels([...new Set([...proxyModels, ...(user.allowedModels ?? []), ...defaults.learnerModels])].sort())
      )
      .catch(() => setAvailableModels([...new Set([...(user.allowedModels ?? []), ...defaults.learnerModels])].sort()));
  }, [user.allowedModels, defaults.learnerModels]);

  const toggleModel = (model: string): void => {
    setModels((current) => (current.includes(model) ? current.filter((m) => m !== model) : [...current, model]));
  };

  const isLearner = role === 'learner';
  const limitValue = limit.trim() === '' ? null : Number(limit);
  const limitValid = limitValue === null || (Number.isInteger(limitValue) && limitValue >= 0);
  const modelsValid = !isLearner || useDefaultModels || models.length > 0;

  const save = async (): Promise<void> => {
    setIsSaving(true);
    setError(null);

    try {
      await adminApi.updateUser(user.id, {
        role,
        status,
        dailyAiLimit: limitValue,
        allowedModels: useDefaultModels ? null : models,
      });
      toast(t.admin.users.updated);
      onSaved();
    } catch (err) {
      setError(err);
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t.admin.users.editTitle(user.displayName)}
      onClose={onClose}
      closeLabel={t.common.close}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button onClick={save} loading={isSaving} disabled={!limitValid || !modelsValid}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="admin-form">
        <div className="admin-form__row">
          <Field label={t.admin.users.role}>
            {(id) => (
              <Select id={id} value={role} disabled={isSelf} onChange={(event) => setRole(event.target.value as Role)}>
                <option value="learner">{t.profile.role.learner}</option>
                <option value="admin">{t.profile.role.admin}</option>
              </Select>
            )}
          </Field>
          <Field label={t.admin.users.status}>
            {(id) => (
              <Select
                id={id}
                value={status}
                disabled={isSelf}
                onChange={(event) => setStatus(event.target.value as AdminUser['status'])}
              >
                <option value="active">{t.admin.users.active}</option>
                <option value="disabled">{t.admin.users.disabled}</option>
              </Select>
            )}
          </Field>
        </div>

        {isLearner ? (
          <>
            <Field
              label={t.admin.users.dailyLimit}
              hint={t.admin.users.dailyLimitHint(defaults.learnerDailyAiLimit)}
              error={limitValid ? undefined : t.admin.users.dailyLimitHint(defaults.learnerDailyAiLimit)}
            >
              {(id, describedBy) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  placeholder={String(defaults.learnerDailyAiLimit)}
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                />
              )}
            </Field>

            <UserPlan userId={user.id} />

            <fieldset className="admin-models">
              <legend className="field__label">{t.admin.users.modelAccess}</legend>
              <label className="admin-check">
                <input type="radio" name="model-mode" checked={useDefaultModels} onChange={() => setUseDefaultModels(true)} />
                <span>
                  {t.admin.users.useDefaultModels}
                  <span className="admin-check__hint">{defaults.learnerModels.join(', ')}</span>
                </span>
              </label>
              <label className="admin-check">
                <input type="radio" name="model-mode" checked={!useDefaultModels} onChange={() => setUseDefaultModels(false)} />
                <span>{t.admin.users.chooseModels}</span>
              </label>

              {!useDefaultModels &&
                (availableModels === null ? (
                  <Spinner size={22} label={t.common.loading} />
                ) : (
                  <div className="admin-models__grid">
                    {availableModels.map((model) => (
                      <label key={model} className="admin-check admin-check--chip">
                        <input type="checkbox" checked={models.includes(model)} onChange={() => toggleModel(model)} />
                        <span>{model}</span>
                      </label>
                    ))}
                  </div>
                ))}
              {!modelsValid && <p className="field__message" style={{ color: 'var(--danger)' }}>{t.admin.users.noModelsSelected}</p>}
            </fieldset>
          </>
        ) : (
          <Banner tone="info">{t.admin.users.adminAllModels}</Banner>
        )}

        {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      </div>
    </Modal>
  );
};
