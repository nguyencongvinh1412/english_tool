/**
 * DashboardPage
 * Greeting with a "continue" suggestion, streak/XP snapshot, weekly chart,
 * recent activity, the four skills and mock tests
 */
import type React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Icon, LinkButton, StatTile } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { JaText } from '@/shared/ja/JaText';
import { ROUTES } from '@/app/routes';
import { availableActivities, skillsFor, type SkillDefinition } from '@/features/skills/skills';
import { RecentList, WeekChart } from '@/features/progress/ProgressWidgets';
import { useProgress, type ProgressSummary } from '@/shared/progress';
import './dashboard.css';

/**
 * Suggests the playable skill practiced least recently (never-practiced first)
 */
function suggestSkill(skills: SkillDefinition[], summary: ProgressSummary | null): SkillDefinition {
  const playable = skills.filter((skill) => availableActivities(skill).length > 0);
  if (!summary) return playable[0];

  return [...playable].sort((a, b) => {
    const lastA = summary.skills[a.id].lastAt;
    const lastB = summary.skills[b.id].lastAt;
    if (!lastA) return -1;
    if (!lastB) return 1;
    return Date.parse(lastA) - Date.parse(lastB);
  })[0];
}

export const DashboardPage: React.FC = () => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const { summary } = useProgress();
  const quota = user.aiQuota;
  const streak = summary?.streak;

  const isJapanese = user.studyLanguage === 'ja';
  const skills = skillsFor(user.studyLanguage);
  const suggestion = suggestSkill(skills, summary);
  const suggestedActivity = availableActivities(suggestion)[0];

  const goalLabel = isJapanese
    ? user.jaTargetLevel
      ? `JLPT ${user.jaTargetLevel}`
      : t.japanese.noGoal
    : user.targetExam === 'none'
      ? user.cefrLevel
        ? `${t.onboarding.goals.none.label} · ${user.cefrLevel}`
        : t.dashboard.noGoal
      : `${t.onboarding.goals[user.targetExam].label}${user.targetScore ? ` · ${user.targetScore}` : ''}`;

  const streakMessage = !streak
    ? t.dashboard.subtitle
    : streak.activeToday
      ? t.progress.keepStreak
      : streak.current > 0
        ? t.progress.saveStreak
        : t.progress.startStreak;

  return (
    <div className="dashboard">
      <section className="dash-hero reveal" style={{ ['--i' as string]: 0 }}>
        <div className="dash-hero__text">
          <h1 className="dash-hero__title">{t.dashboard.greeting(user.displayName)}</h1>
          {isJapanese && <JaText className="dash-hero__ja" text="今日{きょう}も一緒{いっしょ}に頑張{がんば}りましょう！" />}
          <p className="dash-hero__subtitle">{streakMessage}</p>
          <div className="dash-hero__continue">
            <LinkButton to={suggestedActivity.route} size="lg" icon={suggestedActivity.icon}>
              {t.progress.continueTitle}: {t.skills.activities[suggestedActivity.id].title}
            </LinkButton>
            <span className="dash-hero__hint">{t.progress.continueHint(t.skills[suggestion.id].title)}</span>
          </div>
        </div>
        <div className="dash-hero__art" aria-hidden="true">
          {isJapanese ? (
            <>
              <span className="dash-bubble dash-bubble--a" lang="ja">こんにちは!</span>
              <span className="dash-bubble dash-bubble--b">Xin chào!</span>
              <span className="dash-bubble dash-bubble--c" lang="ja">お元気ですか？</span>
            </>
          ) : (
            <>
              <span className="dash-bubble dash-bubble--a">Hello!</span>
              <span className="dash-bubble dash-bubble--b">Xin chào!</span>
              <span className="dash-bubble dash-bubble--c">How are you?</span>
            </>
          )}
        </div>
      </section>

      <section className="dash-stats">
        <div className="reveal" style={{ ['--i' as string]: 1 }}>
          <StatTile icon="flame" tone="streak" value={t.progress.days(streak?.current ?? 0)} label={t.progress.streakShort} />
        </div>
        <div className="reveal" style={{ ['--i' as string]: 2 }}>
          <StatTile icon="bolt" tone="xp" value={summary?.xpToday ?? 0} label={t.progress.xpToday} />
        </div>
        <div className="reveal" style={{ ['--i' as string]: 3 }}>
          <StatTile icon="target" tone="exam" value={goalLabel} label={t.dashboard.goal} />
        </div>
        <div className="reveal" style={{ ['--i' as string]: 4 }}>
          <StatTile
            icon="sparkles"
            tone="listening"
            value={quota.limit === null ? '∞' : Math.max(0, quota.limit - quota.used)}
            label={t.dashboard.aiLeft}
          />
        </div>
      </section>

      <section className="dash-activity">
        <Card padding="lg" className="reveal" style={{ ['--i' as string]: 5 }}>
          <h2 className="dash-card-title">{t.progress.thisWeek}</h2>
          {summary ? <WeekChart week={summary.week} today={summary.today} /> : <div className="dash-skeleton" />}
        </Card>
        <Card padding="lg" className="reveal" style={{ ['--i' as string]: 6 }}>
          <h2 className="dash-card-title">{t.progress.recentActivity}</h2>
          {summary ? <RecentList attempts={summary.recent.slice(0, 4)} /> : <div className="dash-skeleton" />}
        </Card>
      </section>

      <h2 className="dash-section-title reveal" style={{ ['--i' as string]: 7 }}>
        {t.dashboard.skillsTitle}
      </h2>
      <section className="dash-skills">
        {skills.map((skill, index) => {
          const stat = summary?.skills[skill.id];
          return (
            <Link key={skill.id} to={skill.route} className="dash-skill-link reveal" style={{ ['--i' as string]: 8 + index }}>
              <Card interactive tone={skill.id} className="dash-skill" padding="lg">
                <span className="dash-skill__icon" style={{ background: `var(--${skill.id}-edge)` }}>
                  <Icon name={skill.icon} size={28} />
                </span>
                <div className="dash-skill__text">
                  <h3 className="dash-skill__title">{t.skills[skill.id].title}</h3>
                  <p className="dash-skill__description">{t.skills[skill.id].description}</p>
                </div>
                {availableActivities(skill).length > 0 ? (
                  <div className="dash-skill__badges">
                    <Badge tone={skill.id}>{t.dashboard.activities(availableActivities(skill).length)}</Badge>
                    {stat && stat.attempts > 0 && (
                      <Badge tone="neutral" icon="check">
                        {t.progress.exercises(stat.attempts)}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <Badge tone="neutral" icon="lock">
                    {t.common.comingSoon}
                  </Badge>
                )}
              </Card>
            </Link>
          );
        })}
      </section>

      <Link to={ROUTES.EXAMS} className="dash-skill-link reveal" style={{ ['--i' as string]: 12 }}>
        <Card interactive tone="exam" className="dash-exams" padding="lg">
          <span className="dash-skill__icon" style={{ background: 'var(--exam-edge)' }}>
            <Icon name="exam" size={28} />
          </span>
          <div className="dash-skill__text">
            <h3 className="dash-skill__title">{isJapanese ? t.japanese.examsTitle : t.dashboard.examsTitle}</h3>
            <p className="dash-skill__description">{isJapanese ? t.japanese.examsSubtitle : t.dashboard.examsBody}</p>
          </div>
          {isJapanese ? (
            <Badge tone="neutral" icon="lock">
              {t.common.comingSoon}
            </Badge>
          ) : (
            <Badge tone="exam" icon="chevronRight">
              TOEIC · IELTS
            </Badge>
          )}
        </Card>
      </Link>
    </div>
  );
};
