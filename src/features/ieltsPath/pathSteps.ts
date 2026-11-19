/**
 * Where each IELTS path step leads and how it is labelled on Today
 */
import type { TagTone } from '@/design';
import type { Messages } from '@/i18n/en';
import { ROUTES } from '@/app/routes';
import { grammarPath } from '@/shared/grammarApi';
import type { PathStep } from '@/shared/ieltsPathApi';

/** The topic deck (unit of the vocabulary book) a words step of the path opens, by its topic */
const TOPIC_DECK: Record<string, number> = { family: 1, health: 3, hobbies: 4, education: 5, travel: 7, transport: 7, science: 11, technology: 12, society: 13, economy: 13, city: 14, environment: 15, work: 17 };

export function stepLink(step: PathStep): string {
  switch (step.kind) {
    case 'lesson':
      return `${ROUTES.IELTS_LESSON}/${step.id}`;
    case 'practice':
      return `${ROUTES.IELTS_PRACTICE}/${step.id}`;
    case 'grammar':
      return grammarPath(step.ref.pointId ?? '');
    case 'words':
      return TOPIC_DECK[step.ref.topic ?? ''] ? `${ROUTES.VOCABULARY}?deck=en-topic-${TOPIC_DECK[step.ref.topic ?? '']}` : ROUTES.VOCABULARY;
    case 'dictation':
      // A passage at the learner's level that they have not done
      return `${ROUTES.DICTATION}?next=1`;
    case 'pronunciation':
      return ROUTES.PRONUNCIATION;
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
    case 'pronunciation':
      return s.pronunciationTitle;
  }
}

/** Extra steps added after a gate carry their own label and reason */
export const stepKindKey = (step: PathStep): string => (step.ref.remedial ? 'remedial' : step.ref.buffer ? 'buffer' : step.ref.adaptive ? 'adaptive' : step.kind);

/** The reason an adaptive step was added: its key without the id that lesson reviews carry */
export const adaptiveReason = (step: PathStep): string => (step.ref.adaptive ?? '').split(':')[0];
