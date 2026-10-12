/**
 * VocabBankSection
 * Japanese and English flashcard decks with how many cards have Vietnamese meanings, and a button to translate more with AI
 */
import type React from 'react';
import { useState } from 'react';
import { Badge, Banner, Button, Spinner, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { vocabApi, type VocabKind } from '@/shared/vocabApi';
import { enVocabApi } from '@/shared/enVocabApi';
import type { JlptLevel } from '@/shared/contentApi';
import { useAsync } from './useAsync';

const ENRICH_SIZE = 40;

export const VocabBankSection: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, reload } = useAsync(() => vocabApi.adminStatus());
  const [busy, setBusy] = useState<string | null>(null);

  const enrich = async (deck: { kind: VocabKind; level: JlptLevel } | { deck: string }): Promise<void> => {
    setBusy('deck' in deck ? deck.deck : `${deck.kind}-${deck.level}`);
    try {
      const result = 'deck' in deck ? await enVocabApi.enrich(deck.deck, ENRICH_SIZE) : await vocabApi.enrich(deck.kind, deck.level, ENRICH_SIZE);
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
                          onClick={() => enrich({ kind: deck.kind, level: deck.level })}
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

      <div className="admin__toolbar admin__toolbar--between admin__toolbar--section">
        <div>
          <h2 className="admin__section-title">{t.enVocab.adminTitle}</h2>
          <p className="admin__intro">{t.enVocab.adminIntro}</p>
        </div>
      </div>
      {data && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t.enVocab.dashboardTitle}</th>
                <th scope="col">{t.vocab.progress}</th>
                <th scope="col">
                  <span className="visually-hidden">{t.vocab.adminTranslate}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.enDecks.map((deck) => (
                <tr key={deck.deck}>
                  <td data-label={t.enVocab.dashboardTitle}>
                    <strong>{t.enVocab.groups[deck.group]}</strong> {deck.label}
                  </td>
                  <td data-label={t.vocab.progress}>
                    <Badge tone={deck.translated >= deck.total ? 'success' : deck.translated > 0 ? 'warning' : 'neutral'}>
                      {t.vocab.adminTranslated(deck.translated, deck.total)}
                    </Badge>
                  </td>
                  <td className="admin-table__actions">
                    {busy === deck.deck ? (
                      <span className="admin__busy">
                        <Spinner size={16} /> {t.examBank.generating}
                      </span>
                    ) : (
                      <Button size="sm" variant="secondary" icon="sparkles" onClick={() => enrich({ deck: deck.deck })} disabled={busy !== null || deck.translated >= deck.total}>
                        {t.vocab.adminTranslate}
                      </Button>
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
