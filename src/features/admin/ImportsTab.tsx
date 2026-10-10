/**
 * ImportsTab
 * Practice books imported as official-style tests: list, upload, and the editor for one import
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, EmptyState, Field, Icon, Modal, Spinner, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { importApi, STATUS_TONE, uploadMedia, type ImportSummary } from './importApi';
import { ImportEditor } from './ImportEditor';
import { useAsync } from './useAsync';
import './imports.css';

/** List refresh while any import is parsing */
const LIST_POLL_MS = 4000;


/**
 * Upload form: title + PDF/DOCX
 */
const NewImportForm: React.FC<{ onCreated: (id: string) => void }> = ({ onCreated }) => {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!file || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const [asset] = await uploadMedia([file]);
      const { import: created } = await importApi.create(title.trim(), asset.id);
      onCreated(created.id);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Card padding="lg" className="import-new">
      <form onSubmit={submit} className="import-new__form">
        <Field label={t.imports.titleLabel} hint={t.imports.titleHint}>
          {(id, describedBy) => (
            <TextInput id={id} aria-describedby={describedBy} value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
          )}
        </Field>
        <Field label={t.imports.fileLabel}>
          {(id) => (
            <label className="import-file" htmlFor={id}>
              <input
                id={id}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                required
                className="visually-hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className="import-file__icon">
                <Icon name="upload" size={22} />
              </span>
              <span className="import-file__name">{file ? file.name : t.imports.fileLabel}</span>
            </label>
          )}
        </Field>
        {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
        <div>
          <Button type="submit" icon="upload" loading={busy} disabled={!file || !title.trim()}>
            {busy ? t.imports.uploading : t.imports.create}
          </Button>
        </div>
      </form>
    </Card>
  );
};

export const ImportsTab: React.FC = () => {
  const { t, formatDate } = useI18n();
  const toast = useToast();
  const { data, error, isLoading, reload } = useAsync(() => importApi.list());
  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [removing, setRemoving] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const anyParsing = data?.imports.some((i) => i.status === 'parsing') ?? false;
  useEffect(() => {
    if (!anyParsing || openId) return;
    const timer = setInterval(() => void reload(), LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [anyParsing, openId, reload]);

  const remove = async (): Promise<void> => {
    if (!removing) return;
    setBusy(true);
    try {
      await importApi.remove(removing.id);
      setRemoving(null);
      await reload();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setBusy(false);
    }
  };

  if (openId) {
    return (
      <ImportEditor
        id={openId}
        onBack={() => {
          setOpenId(null);
          void reload();
        }}
      />
    );
  }

  return (
    <>
      <div className="admin__toolbar admin__toolbar--between">
        <p className="admin__intro">{t.imports.intro}</p>
        {!showForm && (
          <Button icon="plus" onClick={() => setShowForm(true)}>
            {t.imports.newImport}
          </Button>
        )}
      </div>

      {showForm && (
        <NewImportForm
          onCreated={(id) => {
            setShowForm(false);
            setOpenId(id);
          }}
        />
      )}

      {isLoading && !data && (
        <div className="admin__loading">
          <Spinner size={32} label={t.common.loading} />
        </div>
      )}
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {data && data.imports.length === 0 && !showForm && (
        <EmptyState icon="file" title={t.imports.tab}>
          {t.imports.empty}
        </EmptyState>
      )}

      {data && data.imports.length > 0 && (
        <ul className="import-list">
          {data.imports.map((item) => (
            <li key={item.id} className="import-row">
              <button type="button" className="import-row__main" onClick={() => setOpenId(item.id)}>
                <span className="import-row__title">{item.title}</span>
                <span className="import-row__meta">
                  {formatDate(item.createdAt)} · {t.imports.pages(item.pageCount)}
                  {item.groupCount > 0 && ` · ${t.imports.groups(item.groupCount, item.errorCount)}`}
                </span>
                {item.status === 'failed' && item.error && <span className="import-row__error">{item.error}</span>}
              </button>
              <Badge tone={STATUS_TONE[item.status]}>
                {item.status === 'parsing' && item.progress ? `${t.imports.status.parsing} ${item.progress.done}/${item.progress.total}` : t.imports.status[item.status]}
              </Badge>
              <span className="admin-table__buttons">
                <Button size="sm" variant="secondary" onClick={() => setOpenId(item.id)}>
                  {t.imports.open}
                </Button>
                <Button size="sm" variant="ghost" icon="trash" aria-label={t.imports.remove} onClick={() => setRemoving(item)} disabled={item.status === 'parsing'} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={removing !== null}
        title={t.imports.removeTitle}
        onClose={() => setRemoving(null)}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" icon="trash" onClick={remove} loading={busy}>
              {t.imports.remove}
            </Button>
          </>
        }
      >
        <p>
          <strong>{removing?.title}</strong>
        </p>
        <p>{t.imports.removeBody}</p>
      </Modal>
    </>
  );
};
