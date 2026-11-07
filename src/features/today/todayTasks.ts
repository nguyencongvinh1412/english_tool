/**
 * Where each Today task leads, and how it is labelled
 */
import type { TagTone } from '@/design';
import type { Messages } from '@/i18n/en';
import { ROUTES } from '@/app/routes';
import { grammarPath } from '@/shared/grammarApi';
import type { TodaySkill, TodayTask } from '@/shared/todayApi';

type Language = 'en' | 'ja';

const SKILL_ROUTE: Record<Language, Record<TodaySkill, string>> = {
  en: { listening: ROUTES.DICTATION, reading: ROUTES.READING_PASSAGE, speaking: ROUTES.PRONUNCIATION, writing: ROUTES.WRITING_EMAIL },
  ja: { listening: ROUTES.JA_DICTATION, reading: ROUTES.JA_READING, speaking: ROUTES.JA_PRONUNCIATION, writing: ROUTES.JA_WRITING },
};

/** An activity that needs no AI, offered when a task does and the credits are used up */
const ALTERNATIVE: Record<Language, Partial<Record<TodaySkill, string>>> = {
  en: { speaking: ROUTES.DICTATION, writing: ROUTES.READING_GAPFILL },
  ja: { speaking: ROUTES.JA_DICTATION, writing: ROUTES.JA_READING },
};

export function taskLink(task: TodayTask, language: Language): string {
  const vocab = language === 'ja' ? ROUTES.JA_VOCAB : ROUTES.VOCABULARY;
  switch (task.type) {
    case 'review-words':
    case 'learn-words':
      return vocab;
    case 'learn-deep-word':
      return `${vocab}?tab=deep&start=1`;
    case 'review-grammar':
      return ROUTES.GRAMMAR;
    case 'fix-mistakes':
    case 'learn-grammar':
      return grammarPath(task.pointId);
    case 'practice-skill':
      return SKILL_ROUTE[language][task.skill];
  }
}

export function taskAlternative(task: TodayTask, language: Language): string | null {
  return task.type === 'practice-skill' ? (ALTERNATIVE[language][task.skill] ?? null) : null;
}

/** Label family and kind key (matches t.today.kinds) */
export function taskKind(task: TodayTask): { tone: TagTone; kind: 'vocab' | 'grammar' | 'mistakes' | TodaySkill } {
  switch (task.type) {
    case 'review-words':
    case 'learn-words':
    case 'learn-deep-word':
      return { tone: 'neutral', kind: 'vocab' };
    case 'review-grammar':
    case 'learn-grammar':
      return { tone: 'neutral', kind: 'grammar' };
    case 'fix-mistakes':
      return { tone: 'neutral', kind: 'mistakes' };
    case 'practice-skill':
      return { tone: task.skill, kind: task.skill };
  }
}

/**
 * The words for a task: title, a short "10 min · 42 cards" line and the reason it is here
 */
export function taskText(task: TodayTask, t: Messages, pointTitle: (id: string) => string): { title: string; meta: string; why: string } {
  const k = t.today.tasks;
  switch (task.type) {
    case 'review-words':
      return { title: k.reviewWords.title, meta: k.reviewWords.meta(task.minutes, task.count), why: k.reviewWords.why };
    case 'review-grammar':
      return { title: k.reviewGrammar.title, meta: k.reviewGrammar.meta(task.minutes, task.count), why: k.reviewGrammar.why };
    case 'fix-mistakes':
      return { title: k.fixMistakes.title(pointTitle(task.pointId)), meta: t.today.minutes(task.minutes), why: k.fixMistakes.why(task.count) };
    case 'learn-grammar':
      return { title: pointTitle(task.pointId), meta: t.today.minutes(task.minutes), why: k.learnGrammar.why(task.level) };
    case 'learn-deep-word':
      return { title: task.resume ? k.learnDeepWord.resumeTitle(task.term) : k.learnDeepWord.title(task.term), meta: t.today.minutes(task.minutes), why: k.learnDeepWord.why };
    case 'learn-words':
      return { title: k.learnWords.title(task.level), meta: t.today.minutes(task.minutes), why: k.learnWords.why(task.remaining, task.level) };
    case 'practice-skill':
      return { title: k.skill.titles[task.skill], meta: t.today.minutes(task.minutes), why: k.skill.why(t.today.kinds[task.skill]) };
  }
}

/** A link into an activity that remembers it came from Today (and the planned minutes), for the frame's header */
export function fromToday(url: string, minutes: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}from=today&min=${minutes}`;
}
