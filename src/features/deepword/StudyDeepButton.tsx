/**
 * StudyDeepButton
 * "Study in depth" for a word found elsewhere (a vocabulary mistake in a writing check): finds the word in the word
 * list, or looks it up and saves it, then puts it in the Deep words queue.
 */
import type React from 'react';
import { useState } from 'react';
import { Button } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ApiRequestError } from '@/shared/http';
import { contentApi } from '@/shared/contentApi';
import { deepWordApi } from '@/shared/deepWordApi';
import { enVocabApi } from '@/shared/enVocabApi';

export const StudyDeepButton: React.FC<{ word: string; context?: string }> = ({ word, context }) => {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'busy' | 'added' | 'failed'>('idle');
  const clean = word.toLowerCase().replace(/[^a-z' -]/g, '').trim();
  if (!clean) return null;

  const add = async () => {
    setState('busy');
    try {
      try {
        await deepWordApi.queueAdd(`en:${clean}`);
      } catch (error) {
        // Not in the word list yet: look it up and save it first
        if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
        const { definition } = await contentApi.define(clean, context ?? clean);
        const { word: saved } = await enVocabApi.save(definition, context, 'manual');
        await deepWordApi.queueAdd(saved.id);
      }
      setState('added');
    } catch {
      setState('failed');
    }
  };

  return (
    <Button size="sm" variant="secondary" icon={state === 'added' ? 'check' : 'sparkles'} onClick={() => void add()} loading={state === 'busy'} disabled={state === 'busy' || state === 'added'}>
      {state === 'added' ? t.deepWord.touch.added : state === 'failed' ? t.deepWord.touch.failed : `${t.deepWord.touch.button}: ${clean}`}
    </Button>
  );
};
