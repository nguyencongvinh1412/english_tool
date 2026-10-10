/**
 * Skill catalogue: which activities each skill offers and where they live
 */
import type { IconName } from '@/design';
import type { Messages } from '@/i18n/en';
import { ROUTES } from '@/app/routes';

export type SkillId = 'listening' | 'reading' | 'speaking' | 'writing';
export type ActivityId = keyof Messages['skills']['activities'];

export interface SkillDefinition {
  id: SkillId;
  icon: IconName;
  route: string;
  activities: { id: ActivityId; icon: IconName; route: string }[];
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

/**
 * Looks up a skill by id
 */
export function getSkill(id: SkillId): SkillDefinition {
  const skill = SKILLS.find((s) => s.id === id);
  if (!skill) throw new Error(`Unknown skill ${id}`);
  return skill;
}
