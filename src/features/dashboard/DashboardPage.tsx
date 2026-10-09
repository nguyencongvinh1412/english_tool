/**
 * DashboardPage
 * Greeting, today's snapshot, the four skills and mock tests
 */
import type React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Icon, LinkButton, StatTile } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { SKILLS } from '@/features/skills/skills';
import './dashboard.css';

export const DashboardPage: React.FC = () => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const quota = user.aiQuota;

  const goalLabel =
    user.targetExam === 'none'
      ? user.onboarded && user.cefrLevel
        ? t.onboarding.goals.none.label
        : t.dashboard.noGoal
      : `${t.onboarding.goals[user.targetExam].label}${user.targetScore ? ` · ${user.targetScore}` : ''}`;

  return (
    <div className="dashboard">
      <section className="dash-hero reveal" style={{ ['--i' as string]: 0 }}>
        <div className="dash-hero__text">
          <h1 className="dash-hero__title">{t.dashboard.greeting(user.displayName)}</h1>
          <p className="dash-hero__subtitle">{t.dashboard.subtitle}</p>
          <LinkButton to={ROUTES.DICTATION} size="lg" icon="headphones">
            {t.skills.activities.dictation.title}
          </LinkButton>
        </div>
        <div className="dash-hero__art" aria-hidden="true">
          <span className="dash-bubble dash-bubble--a">Hello!</span>
          <span className="dash-bubble dash-bubble--b">Xin chào!</span>
          <span className="dash-bubble dash-bubble--c">How are you?</span>
        </div>
      </section>

      <section className="dash-stats">
        <div className="reveal" style={{ ['--i' as string]: 1 }}>
          <StatTile icon="target" tone="exam" value={goalLabel} label={t.dashboard.goal} />
        </div>
        <div className="reveal" style={{ ['--i' as string]: 2 }}>
          <StatTile icon="sparkles" tone="listening" value={user.cefrLevel ?? '—'} label={t.dashboard.level} />
        </div>
        <div className="reveal" style={{ ['--i' as string]: 3 }}>
          <StatTile
            icon="bolt"
            tone="xp"
            value={quota.limit === null ? '∞' : Math.max(0, quota.limit - quota.used)}
            label={t.dashboard.aiLeft}
          />
        </div>
      </section>

      <h2 className="dash-section-title reveal" style={{ ['--i' as string]: 4 }}>
        {t.dashboard.skillsTitle}
      </h2>
      <section className="dash-skills">
        {SKILLS.map((skill, index) => (
          <Link
            key={skill.id}
            to={skill.route}
            className="dash-skill-link reveal"
            style={{ ['--i' as string]: 5 + index }}
          >
            <Card interactive tone={skill.id} className="dash-skill" padding="lg">
              <span className="dash-skill__icon" style={{ background: `var(--${skill.id}-edge)` }}>
                <Icon name={skill.icon} size={28} />
              </span>
              <div className="dash-skill__text">
                <h3 className="dash-skill__title">{t.skills[skill.id].title}</h3>
                <p className="dash-skill__description">{t.skills[skill.id].description}</p>
              </div>
              {skill.activities.length > 0 ? (
                <Badge tone={skill.id}>{t.dashboard.activities(skill.activities.length)}</Badge>
              ) : (
                <Badge tone="neutral" icon="lock">
                  {t.common.comingSoon}
                </Badge>
              )}
            </Card>
          </Link>
        ))}
      </section>

      <Link to={ROUTES.EXAMS} className="dash-skill-link reveal" style={{ ['--i' as string]: 9 }}>
        <Card interactive tone="exam" className="dash-exams" padding="lg">
          <span className="dash-skill__icon" style={{ background: 'var(--exam-edge)' }}>
            <Icon name="exam" size={28} />
          </span>
          <div className="dash-skill__text">
            <h3 className="dash-skill__title">{t.dashboard.examsTitle}</h3>
            <p className="dash-skill__description">{t.dashboard.examsBody}</p>
          </div>
          <Badge tone="exam" icon="lock">
            {t.common.comingSoon}
          </Badge>
        </Card>
      </Link>
    </div>
  );
};
