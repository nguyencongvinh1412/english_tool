/**
 * ExamBankTab
 * TOEIC bank size per part and buttons to generate more groups with AI
 */
import type React from 'react';
import { useState } from 'react';
import { Badge, Banner, Button, Select, Spinner, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { examApi, type ToeicPart } from '@/shared/examApi';
import { useAsync } from './useAsync';

const FILL_SIZES = [3, 10];
const LEVELS = ['A2', 'B1', 'B2', 'C1'];

export const ExamBankTab: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, isLoading, reload } = useAsync(() => examApi.bank());
  const [level, setLevel] = useState('B1');
  const [busy, setBusy] = useState<ToeicPart | null>(null);

  const fill = async (part: ToeicPart, count: number): Promise<void> => {
    setBusy(part);
    try {
      const result = await examApi.fill(part, count, level);
      toast(t.examBank.added(result.created, result.failed), result.failed ? 'info' : 'success');
      await reload();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading && !data) return <div className="admin__loading"><Spinner size={32} label={t.common.loading} /></div>;
  if (error) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!data) return null;

  return (
    <>
      <div className="admin__toolbar admin__toolbar--between">
        <p className="admin__intro">{t.examBank.intro}</p>
        <label className="usage__period">
          <span className="visually-hidden">{t.dashboard.level}</span>
          <Select value={level} onChange={(event) => setLevel(event.target.value)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col">{t.examBank.groups}</th>
              <th scope="col">{t.examBank.needed}</th>
              <th scope="col">
                <span className="visually-hidden">{t.examBank.add(0)}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.parts.map((row) => (
              <tr key={row.part}>
                <td data-label="Part">
                  <strong>{t.exams.partName(row.part)}</strong> · {t.exams.partTitles[row.part]}
                </td>
                <td data-label={t.examBank.groups}>
                  <Badge tone={row.groups >= row.fullTestGroups ? 'success' : row.groups > 0 ? 'warning' : 'danger'}>{row.groups}</Badge>
                </td>
                <td data-label={t.examBank.needed}>{row.fullTestGroups}</td>
                <td className="admin-table__actions">
                  {busy === row.part ? (
                    <span className="admin__busy">
                      <Spinner size={16} /> {t.examBank.generating}
                    </span>
                  ) : (
                    <span className="admin-table__buttons">
                      {FILL_SIZES.map((n) => (
                        <Button key={n} size="sm" variant="secondary" icon="sparkles" onClick={() => fill(row.part, n)} disabled={busy !== null}>
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
    </>
  );
};
