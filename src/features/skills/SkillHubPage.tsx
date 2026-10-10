/**
 * SkillHubPage
 * Lists the activities of one skill, or a coming-soon state
 */
import type React from 'react';
import { Card, EmptyState, Icon, LinkButton, PageHeader } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { getSkill, type SkillId } from './skills';
import './skills.css';

export const SkillHubPage: React.FC<{ skill: SkillId }> = ({ skill: skillId }) => {
  const { t } = useI18n();
  const skill = getSkill(skillId);
  const copy = t.skills[skillId];

  return (
    <div className="skill-hub" style={{ ['--skill' as string]: `var(--${skillId})`, ['--skill-edge' as string]: `var(--${skillId}-edge)` }}>
      <PageHeader
        eyebrow={t.nav[skillId]}
        title={
          <span className="skill-hub__title">
            <span className="skill-hub__icon">
              <Icon name={skill.icon} size={30} />
            </span>
            {copy.title}
          </span>
        }
        description={copy.description}
      />

      {skill.activities.length === 0 ? (
        <EmptyState icon={skill.icon} title={t.common.comingSoon}>
          {t.skills.comingSoonBody}
        </EmptyState>
      ) : (
        <div className="skill-hub__grid">
          {skill.activities.map((activity, index) => (
            <Card key={activity.id} tone={skillId} padding="lg" className="activity-card reveal" style={{ ['--i' as string]: index + 1 }}>
              <span className="activity-card__icon">
                <Icon name={activity.icon} size={24} />
              </span>
              <h2 className="activity-card__title">{t.skills.activities[activity.id].title}</h2>
              <p className="activity-card__description">{t.skills.activities[activity.id].description}</p>
              <LinkButton to={activity.route} variant="secondary" icon="chevronRight" className="activity-card__cta">
                {t.skills.start}
              </LinkButton>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
