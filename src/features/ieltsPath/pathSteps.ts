/**
 * Where each IELTS path step leads and how it is labelled on Today
 */
import type { TagTone } from '@/design';
import type { Messages } from '@/i18n/en';
import { ROUTES } from '@/app/routes';
import { grammarPath } from '@/shared/grammarApi';
import type { PathStep } from '@/shared/ieltsPathApi';

export function stepLink(step: PathStep): string {
  switch (step.kind) {
    case 'lesson':
      return `${ROUTES.IELTS_LESSON}/${step.id}`;
    case 'practice':
      return `${ROUTES.IELTS_PRACTICE}/${step.id}`;
    case 'grammar':
      return grammarPath(step.ref.pointId ?? '');
    case 'words':
      return ROUTES.VOCABULARY;
    case 'dictation':
      return ROUTES.DICTATION;
  }
}

export const stepTone = (step: PathStep): TagTone => (step.block === 'vocab-grammar' ? 'neutral' : step.block);

/** Title of a step in the learner's language */
export function stepTitle(step: PathStep, t: Messages, locale: 'en' | 'vi', pointTitle: (id: string) => string): string {
  const s = t.ieltsPath.study;
  switch (step.kind) {
    case 'lesson':
      return step.title?.[locale] ?? '';
    case 'practice':
      return s.practice[step.ref.type ?? ''] ?? '';
    case 'grammar':
      return pointTitle(step.ref.pointId ?? '');
    case 'words':
      return s.wordsTitle(step.ref.count ?? 15, s.topics[step.ref.topic ?? ''] ?? step.ref.topic ?? '');
    case 'dictation':
      return s.dictationTitle;
  }
}

/** Extra steps added after a gate carry their own label and reason */
export const stepKindKey = (step: PathStep): string => (step.ref.remedial ? 'remedial' : step.ref.buffer ? 'buffer' : step.kind);
