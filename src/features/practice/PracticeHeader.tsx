/**
 * PracticeHeader
 * Back to library + exercise title + level badge
 */
import type React from 'react';
import { Badge, Button } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import './practice.css';

export const PracticeHeader: React.FC<{ title: string; level: string | null; onBack: () => void; extra?: React.ReactNode }> = ({
  title,
  level,
  onBack,
  extra,
}) => {
  const { t } = useI18n();

  return (
    <div className="practice-head">
      <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
        {t.library.back}
      </Button>
      <h1 className="practice-head__title" lang="en">
        {title}
      </h1>
      {level && <Badge tone="neutral">{level}</Badge>}
      {extra}
    </div>
  );
};
