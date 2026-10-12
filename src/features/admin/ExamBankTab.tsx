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
import { ieltsApi, type IeltsSlot } from '@/shared/ieltsApi';
import { useAsync } from './useAsync';
import { VocabBankSection } from './VocabBankSection';
import { JlptBankSection } from './JlptBankSection';

const FILL_SIZES = [3, 10];
/** IELTS groups are long (a full passage or section), so they are added a few at a time */
const IELTS_FILL_SIZES = [1, 3];
const LEVELS = ['A2', 'B1', 'B2', 'C1'];

export const ExamBankTab: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, isLoading, reload } = useAsync(() => examApi.bank());
  const [level, setLevel] = useState('B1');
  const [busy, setBusy] = useState<ToeicPart | null>(null);
  const ielts = useAsync(() => ieltsApi.bank());
  const [ieltsBusy, setIeltsBusy] = useState<IeltsSlot | null>(null);

  const fillIelts = async (slot: IeltsSlot, count: number): Promise<void> => {
    setIeltsBusy(slot);
    try {
      const result = await ieltsApi.fill(slot, count, level);
      toast(t.examBank.added(result.created, result.failed), result.failed ? 'info' : 'success');
      await ielts.reload();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setIeltsBusy(null);
    }
  };

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

      <div className="admin__toolbar admin__toolbar--between admin__toolbar--section">
        <div>
          <h2 className="admin__section-title">{t.ielts.bankTitle}</h2>
          <p className="admin__intro">{t.ielts.bankIntro}</p>
        </div>
      </div>
      {ielts.error !== null && <Banner tone="danger">{errorMessage(ielts.error, t)}</Banner>}
      {ielts.data && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">IELTS</th>
                <th scope="col">{t.examBank.groups}</th>
                <th scope="col">{t.examBank.needed}</th>
                <th scope="col">
                  <span className="visually-hidden">{t.examBank.add(0)}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ielts.data.slots.map((row) => (
                <tr key={row.slot}>
                  <td data-label="IELTS">
                    <strong>{t.ielts.slots[row.slot]}</strong>
                  </td>
                  <td data-label={t.examBank.groups}>
                    <Badge tone={row.groups >= row.fullTestGroups ? 'success' : row.groups > 0 ? 'warning' : 'danger'}>{row.groups}</Badge>
                  </td>
                  <td data-label={t.examBank.needed}>{row.fullTestGroups}</td>
                  <td className="admin-table__actions">
                    {ieltsBusy === row.slot ? (
                      <span className="admin__busy">
                        <Spinner size={16} /> {t.examBank.generating}
                      </span>
                    ) : (
                      <span className="admin-table__buttons">
                        {IELTS_FILL_SIZES.map((n) => (
                          <Button key={n} size="sm" variant="secondary" icon="sparkles" onClick={() => fillIelts(row.slot, n)} disabled={ieltsBusy !== null}>
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

      <JlptBankSection />

      <VocabBankSection />
    </>
  );
};
