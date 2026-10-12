/**
 * DefinitionSheet
 * Definition of an English word the learner tapped, with a button to save it to the word bank
 */
import type React from 'react';
import { useState } from 'react';
import { Banner, Button, Icon, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import type { WordDefinition } from '@/shared/contentApi';
import { enVocabApi, type SavedWord } from '@/shared/enVocabApi';
import './define.css';

interface DefinitionSheetProps {
  word: string;
  state: WordDefinition | 'loading' | { error: unknown };
  /** Sentence the word was met in, kept with the saved word */
  context?: string;
  source: SavedWord['source'];
  onClose: () => void;
}

export const DefinitionSheet: React.FC<DefinitionSheetProps> = ({ word, state, context, source, onClose }) => {
  const { t, locale } = useI18n();
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | { error: unknown }>('idle');

  const save = async (definition: WordDefinition) => {
    setSaving('saving');
    try {
      await enVocabApi.save(definition, context, source);
      setSaving('saved');
    } catch (error) {
      setSaving({ error });
    }
  };

  return (
    <div className="define" role="dialog" aria-label={word}>
      <button type="button" className="define__close" onClick={onClose} aria-label={t.common.close}>
        <Icon name="x" size={18} />
      </button>
      {state === 'loading' ? (
        <p className="define__loading">
          <Spinner size={18} /> {t.reading.defining}
        </p>
      ) : 'error' in state ? (
        <Banner tone="danger">{errorMessage(state.error, t)}</Banner>
      ) : (
        <>
          <p className="define__word" lang="en">
            {state.word} <span className="define__pos">{state.partOfSpeech}</span> <span className="define__ipa">{state.ipa}</span>
          </p>
          <p lang="en">{state.meaning}</p>
          {locale === 'vi' && state.translation && (
            <p className="define__translation">
              <strong>{t.reading.translation}:</strong> {state.translation}
            </p>
          )}
          <p className="define__example" lang="en">
            <strong>{t.reading.example}:</strong> {state.example}
          </p>
          <div className="define__actions">
            <Button
              size="sm"
              variant={saving === 'saved' ? 'secondary' : 'primary'}
              icon={saving === 'saved' ? 'check' : 'plus'}
              onClick={() => void save(state)}
              loading={saving === 'saving'}
              disabled={saving === 'saved'}
            >
              {saving === 'saved' ? t.wordBank.saved : t.wordBank.save}
            </Button>
          </div>
          {typeof saving === 'object' && <Banner tone="danger">{errorMessage(saving.error, t)}</Banner>}
        </>
      )}
    </div>
  );
};
