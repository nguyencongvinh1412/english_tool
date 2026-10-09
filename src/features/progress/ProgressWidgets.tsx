/**
 * Progress widgets: weekly XP bars, recent activity, 12-week heatmap, per-skill stats
 */
import type React from 'react';
import { Icon, type IconName } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import type { Attempt, DayStat, ProgressSummary, SkillName } from '@/shared/progress';
import './progress.css';

const SKILL_ICONS: Record<SkillName, IconName> = {
  listening: 'headphones',
  reading: 'book',
  speaking: 'mic',
  writing: 'pen',
};

/** Weekday index (0 = Sunday) for a YYYY-MM-DD day */
function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/**
 * XP per day for the last 7 days, today highlighted
 */
export const WeekChart: React.FC<{ week: DayStat[]; today: string }> = ({ week, today }) => {
  const { t } = useI18n();
  const max = Math.max(20, ...week.map((d) => d.xp));

  return (
    <div className="week-chart" role="img" aria-label={week.map((d) => `${t.progress.weekdays[weekday(d.day)]}: ${d.xp} XP`).join(', ')}>
      {week.map((d) => (
        <div key={d.day} className={`week-chart__col ${d.day === today ? 'week-chart__col--today' : ''}`}>
          <span className="week-chart__value">{d.xp > 0 ? d.xp : ''}</span>
          <span className="week-chart__track">
            <span className="week-chart__bar" style={{ height: `${(d.xp / max) * 100}%` }} />
          </span>
          <span className="week-chart__day">{t.progress.weekdays[weekday(d.day)]}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Compact list of finished activities
 */
export const RecentList: React.FC<{ attempts: Attempt[] }> = ({ attempts }) => {
  const { t, formatDate } = useI18n();

  if (attempts.length === 0) {
    return <p className="recent__empty">{t.progress.noActivity}</p>;
  }

  return (
    <ul className="recent">
      {attempts.map((attempt) => {
        const percent = attempt.score !== null && attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 100) : null;
        return (
          <li key={attempt.id} className="recent__item" style={{ ['--tone' as string]: `var(--${attempt.skill}-edge)` }}>
            <span className="recent__icon">
              <Icon name={SKILL_ICONS[attempt.skill]} size={18} />
            </span>
            <span className="recent__text">
              <span className="recent__title" lang="en">
                {attempt.title ?? t.progress.activity[attempt.activity]}
              </span>
              <span className="recent__meta">
                {t.progress.activity[attempt.activity]} · {formatDate(attempt.completedAt)}
              </span>
            </span>
            {percent !== null && <span className="recent__score">{percent}%</span>}
            <span className="recent__xp">+{attempt.xp}</span>
          </li>
        );
      })}
    </ul>
  );
};

/** Heatmap intensity steps by exercises per day */
function heatLevel(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

/**
 * GitHub-style grid of the last 12 weeks, one column per week
 */
export const Heatmap: React.FC<{ days: DayStat[] }> = ({ days }) => {
  const { t, formatDate } = useI18n();
  // Pad the start so the first column begins on Sunday
  const padding = days.length > 0 ? weekday(days[0].day) : 0;
  const cells: (DayStat | null)[] = [...Array<null>(padding).fill(null), ...days];

  return (
    <div className="heatmap">
      <div className="heatmap__grid">
        {cells.map((cell, index) =>
          cell ? (
            <span
              key={cell.day}
              className={`heatmap__cell heatmap__cell--${heatLevel(cell.count)}`}
              title={t.progress.heatmapLegend(cell.count, formatDate(cell.day))}
            />
          ) : (
            <span key={`pad-${index}`} className="heatmap__cell heatmap__cell--pad" />
          )
        )}
      </div>
      <div className="heatmap__legend" aria-hidden="true">
        {t.progress.less}
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`heatmap__cell heatmap__cell--${level}`} />
        ))}
        {t.progress.more}
      </div>
    </div>
  );
};

/**
 * Exercises, XP and average score per skill
 */
export const SkillStats: React.FC<{ skills: ProgressSummary['skills'] }> = ({ skills }) => {
  const { t } = useI18n();
  const maxXp = Math.max(1, ...Object.values(skills).map((s) => s.xp));

  return (
    <ul className="skill-stats">
      {(Object.keys(SKILL_ICONS) as SkillName[]).map((name) => {
        const stat = skills[name];
        return (
          <li key={name} className="skill-stats__row" style={{ ['--tone' as string]: `var(--${name})`, ['--tone-edge' as string]: `var(--${name}-edge)` }}>
            <span className="skill-stats__icon">
              <Icon name={SKILL_ICONS[name]} size={18} />
            </span>
            <span className="skill-stats__body">
              <span className="skill-stats__head">
                <span className="skill-stats__name">{t.skills[name].title}</span>
                <span className="skill-stats__meta">
                  {t.progress.exercises(stat.attempts)}
                  {stat.avgPercent !== null && ` · ${t.progress.avgScore(stat.avgPercent)}`}
                </span>
              </span>
              <span className="skill-stats__track">
                <span className="skill-stats__bar" style={{ width: `${(stat.xp / maxXp) * 100}%` }} />
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};
