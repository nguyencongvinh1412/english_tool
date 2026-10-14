/**
 * Skill catalogue: which activities each skill offers and where they live
 */
import type { IconName } from '@/design';
import type { Messages } from '@/i18n/en';
import { ROUTES } from '@/app/routes';
import type { StudyLanguage } from '@/shared/types';

export type SkillId = 'listening' | 'reading' | 'speaking' | 'writing';
export type ActivityId = keyof Messages['skills']['activities'];

export interface SkillDefinition {
  id: SkillId;
  icon: IconName;
  route: string;
  activities: { id: ActivityId; icon: IconName; route: string; /** Planned but not built yet */ soon?: boolean }[];
}

export const SKILLS: SkillDefinition[] = [
  {
    id: 'listening',
    icon: 'headphones',
    route: ROUTES.LISTENING,
    activities: [
      { id: 'dictation', icon: 'type', route: ROUTES.DICTATION },
      { id: 'listeningQuiz', icon: 'headphones', route: ROUTES.LISTENING_QUIZ },
    ],
  },
  {
    id: 'reading',
    icon: 'book',
    route: ROUTES.READING,
    activities: [
      { id: 'enVocab', icon: 'layers', route: ROUTES.VOCABULARY },
      { id: 'grammar', icon: 'graph', route: ROUTES.GRAMMAR },
      { id: 'readingPassage', icon: 'book', route: ROUTES.READING_PASSAGE },
      { id: 'gapfill', icon: 'type', route: ROUTES.READING_GAPFILL },
    ],
  },
  {
    id: 'speaking',
    icon: 'mic',
    route: ROUTES.SPEAKING,
    activities: [
      { id: 'pronunciation', icon: 'mic', route: ROUTES.PRONUNCIATION },
      { id: 'conversation', icon: 'chat', route: ROUTES.CONVERSATION },
      { id: 'scenarios', icon: 'sparkles', route: ROUTES.SCENARIOS },
      { id: 'ieltsSpeaking', icon: 'exam', route: ROUTES.SPEAKING_IELTS },
    ],
  },
  {
    id: 'writing',
    icon: 'pen',
    route: ROUTES.WRITING,
    activities: [
      { id: 'writingEmail', icon: 'chat', route: ROUTES.WRITING_EMAIL },
      { id: 'writingTask1', icon: 'chart', route: ROUTES.WRITING_TASK1 },
      { id: 'writingTask2', icon: 'pen', route: ROUTES.WRITING_TASK2 },
    ],
  },
];

/** Japanese activities */
export const JA_SKILLS: SkillDefinition[] = [
  {
    id: 'listening',
    icon: 'headphones',
    route: ROUTES.LISTENING,
    activities: [
      { id: 'jaDictation', icon: 'type', route: ROUTES.JA_DICTATION },
      { id: 'jaListening', icon: 'headphones', route: ROUTES.JA_LISTENING },
    ],
  },
  {
    id: 'reading',
    icon: 'book',
    route: ROUTES.READING,
    activities: [
      { id: 'vocab', icon: 'layers', route: ROUTES.JA_VOCAB },
      { id: 'kana', icon: 'type', route: ROUTES.KANA },
      { id: 'jaReading', icon: 'book', route: ROUTES.JA_READING },
    ],
  },
  {
    id: 'speaking',
    icon: 'mic',
    route: ROUTES.SPEAKING,
    activities: [
      { id: 'jaPronunciation', icon: 'mic', route: ROUTES.JA_PRONUNCIATION },
      { id: 'jaConversation', icon: 'chat', route: ROUTES.JA_CONVERSATION },
      { id: 'jaScenarios', icon: 'sparkles', route: ROUTES.JA_SCENARIOS },
    ],
  },
  {
    id: 'writing',
    icon: 'pen',
    route: ROUTES.WRITING,
    activities: [{ id: 'jaWriting', icon: 'pen', route: ROUTES.JA_WRITING }],
  },
];

/**
 * Skills of a study language
 */
export function skillsFor(language: StudyLanguage): SkillDefinition[] {
  return language === 'ja' ? JA_SKILLS : SKILLS;
}

/**
 * Activities that can be used now
 */
export const availableActivities = (skill: SkillDefinition) => skill.activities.filter((activity) => !activity.soon);

/**
 * Looks up a skill by id
 */
export function getSkill(id: SkillId, language: StudyLanguage = 'en'): SkillDefinition {
  const skill = skillsFor(language).find((s) => s.id === id);
  if (!skill) throw new Error(`Unknown skill ${id}`);
  return skill;
}
