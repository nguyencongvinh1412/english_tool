/**
 * ExamsPage
 * Placeholder until the exam engine lands in phase 5
 */
import type React from 'react';
import { EmptyState, PageHeader } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';

export const ExamsPage: React.FC = () => {
  const { t } = useI18n();

  return (
    <div>
      <PageHeader eyebrow="TOEIC · IELTS Academic" title={t.dashboard.examsTitle} description={t.dashboard.examsBody} />
      <EmptyState icon="exam" title={t.common.comingSoon}>
        {t.skills.comingSoonBody}
      </EmptyState>
    </div>
  );
};
