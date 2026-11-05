/**
 * Where to practise a skill for a roadmap stage (the activities that need no AI come first)
 */
import { ROUTES } from '@/app/routes';
import type { SkillName } from '@/shared/roadmapApi';

const BY_SKILL: Record<SkillName, string[]> = {
  listening: [ROUTES.DICTATION],
  reading: [ROUTES.READING_PASSAGE],
  speaking: [ROUTES.PRONUNCIATION],
  writing: [ROUTES.WRITING_EMAIL],
};

export const skillActivities = (skill: SkillName): string[] => BY_SKILL[skill];
