/**
 * DeepWordAdminTab
 * Check the notes the AI wrote for words studied in depth: edit the JSON, ask for a fresh draft, mark as approved
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Modal, Spinner, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { deepWordApi } from '@/shared/deepWordApi';
import { useAsync } from './useAsync';

type Row = { id: string; term: string; status: 'ai' | 'approved' };

const Editor: React.FC<{ row: Row; onClose: (saved: boolean) => void }> = ({ row, onClose }) => {
  const { t } = useI18n();
  const a = t.deepWordAdmin;
  const toast = useToast();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'draft' | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    deepWordApi
      .adminGet(row.id)
      .then(({ content }) => setText(JSON.stringify(content, null, 2)))
      .catch(setError);
  }, [row.id]);

  const save = async (status: 'ai' | 'approved') => {
    let content: unknown;
    try {
      content = JSON.parse(text ?? '');
    } catch {
      setError(new Error(a.invalid));
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await deepWordApi.adminSave(row.id, content, status);
      toast(a.saved, 'success');
      onClose(true);
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  };

  const regenerate = async () => {
    setBusy('draft');
    setError(null);
    try {
      setText(JSON.stringify((await deepWordApi.adminRegenerate(row.id)).content, null, 2));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      title={row.term}
      onClose={() => onClose(false)}
      closeLabel={t.common.close}
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon="sparkles" onClick={() => void regenerate()} loading={busy === 'draft'} disabled={busy !== null}>
            {a.regenerate}
          </Button>
          <Button variant="secondary" onClick={() => void save('ai')} disabled={busy !== null || text === null}>
            {a.saveDraft}
          </Button>
          <Button icon="check" onClick={() => void save('approved')} loading={busy === 'save'} disabled={busy !== null || text === null}>
            {a.approve}
          </Button>
        </>
      }
    >
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {text === null ? <Spinner size={24} label={t.common.loading} /> : <textarea className="input grammar-admin__json" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} aria-label={row.term} />}
    </Modal>
  );
};

export const DeepWordAdminTab: React.FC = () => {
  const { t } = useI18n();
  const a = t.deepWordAdmin;
  const [query, setQuery] = useState('');
  const { data, error, isLoading, reload } = useAsync(() => deepWordApi.adminList(query.trim() || undefined), [query]);
  const [editing, setEditing] = useState<Row | null>(null);

  if (error) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;

  return (
    <>
      <div className="admin__toolbar admin__toolbar--between">
        <div>
          <h2 className="admin__section-title">{a.tab}</h2>
          <p className="admin__intro">{a.intro}</p>
        </div>
        <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={a.search} aria-label={a.search} />
      </div>
      {isLoading && !data ? (
        <Spinner size={28} label={t.common.loading} />
      ) : !data || data.words.length === 0 ? (
        <p className="admin__intro">{a.empty}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              {data.words.map((row) => (
                <tr key={row.id}>
                  <td data-label={a.tab} lang="en">
                    {row.term}
                  </td>
                  <td>
                    <Badge tone={row.status === 'approved' ? 'success' : 'warning'}>{a.statuses[row.status]}</Badge>
                  </td>
                  <td className="admin-table__actions">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
                      {a.edit}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Editor
          row={editing}
          onClose={(saved) => {
            setEditing(null);
            if (saved) void reload();
          }}
        />
      )}
    </>
  );
};
