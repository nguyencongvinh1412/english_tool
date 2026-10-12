/**
 * VocabBankSection
 * Japanese flashcard decks with how many cards have Vietnamese meanings, and a button to translate more with AI
 */
import type React from 'react';
import { useState } from 'react';
import { Badge, Banner, Button, Spinner, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { vocabApi, type VocabKind } from '@/shared/vocabApi';
import type { JlptLevel } from '@/shared/contentApi';
import { useAsync } from './useAsync';

const ENRICH_SIZE = 40;

export const VocabBankSection: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, reload } = useAsync(() => vocabApi.adminStatus());
  const [busy, setBusy] = useState<string | null>(null);

  const enrich = async (kind: VocabKind, level: JlptLevel): Promise<void> => {
    setBusy(`${kind}-${level}`);
    try {
      const result = await vocabApi.enrich(kind, level, ENRICH_SIZE);
      toast(t.vocab.adminDone(result.updated), result.updated < result.requested ? 'info' : 'success');
      await reload();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="admin__toolbar admin__toolbar--between admin__toolbar--section">
        <div>
          <h2 className="admin__section-title">{t.vocab.adminTitle}</h2>
          <p className="admin__intro">{t.vocab.adminIntro}</p>
        </div>
      </div>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {data && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">JLPT</th>
                <th scope="col">{t.vocab.progress}</th>
                <th scope="col">
                  <span className="visually-hidden">{t.vocab.adminTranslate}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.decks.map((deck) => {
                const key = `${deck.kind}-${deck.level}`;
                return (
                  <tr key={key}>
                    <td data-label="JLPT">
                      <strong>{deck.level}</strong> · {deck.kind === 'kanji' ? 'Kanji' : t.vocab.words}
                    </td>
                    <td data-label={t.vocab.progress}>
                      <Badge tone={deck.translated >= deck.total ? 'success' : deck.translated > 0 ? 'warning' : 'neutral'}>
                        {t.vocab.adminTranslated(deck.translated, deck.total)}
                      </Badge>
                    </td>
                    <td className="admin-table__actions">
                      {busy === key ? (
                        <span className="admin__busy">
                          <Spinner size={16} /> {t.examBank.generating}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="sparkles"
                          onClick={() => enrich(deck.kind, deck.level)}
                          disabled={busy !== null || deck.translated >= deck.total}
                        >
                          {t.vocab.adminTranslate}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};
