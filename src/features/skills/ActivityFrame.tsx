/**
 * ActivityFrame
 * Wraps a pre-v2 activity page with a back link to its skill hub.
 * Removed once each activity is rebuilt in phase 3.
 */
import type React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { getSkill, type SkillId } from './skills';
import './skills.css';

export const ActivityFrame: React.FC<{ skill: SkillId; children: React.ReactNode }> = ({ skill, children }) => {
  const { t } = useI18n();

  return (
    <div className="legacy-page">
      <Link to={getSkill(skill).route} className="activity-back">
        <Icon name="arrowLeft" size={18} />
        {t.skills[skill].title}
      </Link>
      {children}
    </div>
  );
};
