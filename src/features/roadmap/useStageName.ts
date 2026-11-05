/**
 * Display name of a roadmap stage ("B1 — foundation", "Exam practice")
 */
import { useI18n } from '@/i18n/I18nProvider';
import type { Stage } from '@/shared/roadmapApi';

export function useStageName(): (stage: Stage) => string {
  const { t } = useI18n();
  return (stage) => {
    if (stage.kind === 'exam-prep') return t.roadmapNew.stage.examPrep;
    if (stage.part === 'foundation') return t.roadmapNew.stage.foundation(stage.level);
    if (stage.part === 'advanced') return t.roadmapNew.stage.advanced(stage.level);
    return t.roadmapNew.stage.level(stage.level);
  };
}
