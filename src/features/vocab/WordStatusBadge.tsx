/**
 * WordStatusBadge
 * A word's mastery as words and a symbol (○ ◔ ◕ ●), never colour alone
 */
import type React from 'react';
import { Badge } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import type { WordStatus } from '@/shared/vocabApi';

const SYMBOL: Record<WordStatus, string> = { new: '○', learning: '◔', good: '◕', mastered: '●' };
const TONE = { new: 'neutral', learning: 'neutral', good: 'brand', mastered: 'success' } as const;

export const WordStatusBadge: React.FC<{ status: WordStatus }> = ({ status }) => {
  const { t } = useI18n();
  return (
    <Badge tone={TONE[status]}>
      <span aria-hidden="true">{SYMBOL[status]}</span> {t.vocab.status[status]}
    </Badge>
  );
};
