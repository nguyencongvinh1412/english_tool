/**
 * JlptBankSection
 * JLPT bank size per level and question type, with buttons to generate more groups with AI
 */
import type React from 'react';
import { useState } from 'react';
import { Badge, Banner, Button, Segmented, Spinner, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { JLPT_CONTENT_LEVELS, type JlptLevel } from '@/shared/contentApi';
import { jlptApi, type Mondai } from '@/shared/jlptApi';
import { useAsync } from './useAsync';

const FILL_SIZES = [1, 3];
/** Matches the server's batch for "fill missing" */
const MISSING_BATCH = 6;

export const JlptBankSection: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, reload } = useAsync(() => jlptApi.bank());
  const [level, setLevel] = useState<JlptLevel>('N5');
  const [busy, setBusy] = useState<Mondai | 'missing' | null>(null);

  const fill = async (request: { mondai: Mondai; count: number } | { missing: true }) => {
    setBusy('missing' in request ? 'missing' : request.mondai);
    try {
      const result = await jlptApi.fill(level, request);
      toast(t.jlpt.added(result.created, result.failed), result.failed ? 'info' : 'success');
      await reload();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const rows = data?.levels.find((l) => l.level === level)?.mondai ?? [];
  const ready = rows.length > 0 && rows.every((r) => r.groups >= r.fullTestGroups);

  return (
    <>
      <div className="admin__toolbar admin__toolbar--between admin__toolbar--section">
        <div>
          <h2 className="admin__section-title">{t.jlpt.bankTitle}</h2>
          <p className="admin__intro">{t.jlpt.bankIntro}</p>
        </div>
      </div>
      <div className="admin__toolbar admin__toolbar--between">
        <Segmented<JlptLevel>
          label={t.dashboard.level}
          value={level}
          onChange={setLevel}
          options={JLPT_CONTENT_LEVELS.map((l) => ({ value: l, label: l, tone: 'exam' }))}
        />
        {ready ? (
          <Badge tone="success" icon="check">
            {t.jlpt.fullReady}
          </Badge>
        ) : (
          <Button size="sm" icon="sparkles" onClick={() => fill({ missing: true })} loading={busy === 'missing'} disabled={busy !== null}>
            {t.jlpt.fillMissing(MISSING_BATCH)}
          </Button>
        )}
      </div>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {data && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">JLPT {level}</th>
                <th scope="col">{t.examBank.groups}</th>
                <th scope="col">{t.examBank.needed}</th>
                <th scope="col">
                  <span className="visually-hidden">{t.examBank.add(0)}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.mondai}>
                  <td data-label="JLPT">
                    <strong lang="ja">{t.jlpt.mondai[row.mondai].title}</strong> · {t.jlpt.sections[row.section]}
                  </td>
                  <td data-label={t.examBank.groups}>
                    <Badge tone={row.groups >= row.fullTestGroups ? 'success' : row.groups > 0 ? 'warning' : 'danger'}>{row.groups}</Badge>
                  </td>
                  <td data-label={t.examBank.needed}>{row.fullTestGroups}</td>
                  <td className="admin-table__actions">
                    {busy === row.mondai ? (
                      <span className="admin__busy">
                        <Spinner size={16} /> {t.examBank.generating}
                      </span>
                    ) : (
                      <span className="admin-table__buttons">
                        {FILL_SIZES.map((n) => (
                          <Button key={n} size="sm" variant="secondary" icon="sparkles" onClick={() => fill({ mondai: row.mondai, count: n })} disabled={busy !== null}>
                            {t.examBank.add(n)}
                          </Button>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
