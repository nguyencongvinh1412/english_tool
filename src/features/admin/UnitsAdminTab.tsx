/**
 * UnitsAdminTab
 * Review the AI-drafted course lessons: edit the JSON, ask for a fresh draft, mark as reviewed
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, Button, Modal, Spinner, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { curriculumApi, unitPath, type UnitAdminRow, type UnitContent } from '@/shared/curriculumApi';
import { useAsync } from './useAsync';

const Editor: React.FC<{ row: UnitAdminRow; onClose: (saved: boolean) => void }> = ({ row, onClose }) => {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState<'load' | 'draft' | 'save' | null>('load');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    curriculumApi
      .adminUnit(row.id)
      .then(({ content }) => setText(JSON.stringify(content ?? {}, null, 2)))
      .catch(setError)
      .finally(() => setBusy(null));
  }, [row.id]);

  const save = async (status: 'draft' | 'reviewed') => {
    let content: UnitContent;
    try {
      content = JSON.parse(text ?? '') as UnitContent;
    } catch {
      setError(new Error(t.grammar.invalidJson));
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await curriculumApi.save(row.id, content, status);
      toast(status === 'reviewed' ? t.grammar.statuses.reviewed : t.imports.saved, 'success');
      onClose(true);
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  };

  const draft = async () => {
    setBusy('draft');
    setError(null);
    try {
      setText(JSON.stringify((await curriculumApi.draft(row.id)).content, null, 2));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      title={row.title[locale]}
      onClose={() => onClose(false)}
      closeLabel={t.common.close}
      footer={
        <>
          <Button variant="ghost" icon="sparkles" onClick={() => void draft()} loading={busy === 'draft'} disabled={busy !== null}>
            {t.grammar.newDraft}
          </Button>
          <Button variant="secondary" onClick={() => void save('draft')} disabled={busy !== null || text === null}>
            {t.grammar.saveDraft}
          </Button>
          <Button icon="check" onClick={() => void save('reviewed')} loading={busy === 'save'} disabled={busy !== null || text === null}>
            {t.grammar.markReviewed}
          </Button>
        </>
      }
    >
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {text === null ? (
        <Spinner size={24} label={t.common.loading} />
      ) : (
        <textarea className="input grammar-admin__json" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} aria-label={row.title.en} />
      )}
    </Modal>
  );
};

export const UnitsAdminTab: React.FC = () => {
  const { t, locale } = useI18n();
  const { data, error, isLoading, reload } = useAsync(() => curriculumApi.adminList());
  const [editing, setEditing] = useState<UnitAdminRow | null>(null);

  if (isLoading && !data) return <Spinner size={28} label={t.common.loading} />;
  if (error) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!data) return null;

  const reviewed = data.units.filter((u) => u.status === 'reviewed').length;
  const drafted = data.units.filter((u) => u.status).length;

  return (
    <>
      <div className="admin__toolbar admin__toolbar--between">
        <div>
          <h2 className="admin__section-title">{t.course.admin.title}</h2>
          <p className="admin__intro">{t.course.admin.intro}</p>
        </div>
        <Badge tone={reviewed === data.units.length ? 'success' : 'warning'}>{t.course.admin.counts(reviewed, drafted, data.units.length)}</Badge>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t.course.admin.tab}</th>
              <th scope="col">{t.nav.writing}</th>
              <th scope="col">CEFR</th>
              <th scope="col">{t.admin.users.status}</th>
              <th scope="col">
                <span className="visually-hidden">{t.grammar.edit}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.units.map((row) => (
              <tr key={row.id}>
                <td data-label={t.course.admin.tab}>
                  <Link to={unitPath(row.skill, row.id)}>{row.title[locale]}</Link>
                </td>
                <td data-label={t.nav.writing}>{t.nav[row.skill]}</td>
                <td data-label="CEFR">{row.level}</td>
                <td data-label={t.admin.users.status}>
                  <Badge tone={row.status === 'reviewed' ? 'success' : row.status ? 'warning' : 'danger'}>{t.grammar.statuses[row.status ?? 'missing']}</Badge>
                  {row.edited && <span className="grammar-admin__edited"> · {t.grammar.edited}</span>}
                </td>
                <td className="admin-table__actions">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
                    {t.grammar.edit}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
