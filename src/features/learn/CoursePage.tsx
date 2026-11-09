/**
 * CoursePage
 * A skill's fixed lesson path, grouped by level: done, current, open for review, locked, or not written yet
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, Icon, PageHeader, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { curriculumApi, unitPath, type CurriculumSkill, type LearningPath, type PathUnit } from '@/shared/curriculumApi';
import './learn.css';

type UnitState = 'done' | 'current' | 'open' | 'locked' | 'soon';

function stateOf(unit: PathUnit, current: string | undefined): UnitState {
  if (!unit.ready) return 'soon';
  if (unit.progress?.completedAt) return 'done';
  if (unit.id === current) return 'current';
  return unit.open ? 'open' : 'locked';
}

export const CoursePage: React.FC<{ skill: CurriculumSkill }> = ({ skill }) => {
  const { t, locale } = useI18n();
  const [path, setPath] = useState<LearningPath | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    curriculumApi.path(skill).then(setPath).catch(setError);
  }, [skill]);

  if (error) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!path) return <Spinner size={28} label={t.common.loading} />;

  // The lesson to do next: the first open one not finished yet
  const current = path.units.find((u) => u.ready && u.open && !u.progress?.completedAt)?.id;
  const levels = [...new Set(path.units.map((u) => u.level))];
  const done = path.units.filter((u) => u.progress?.completedAt).length;
  let number = 0;

  return (
    <div className="course" style={{ ['--skill' as string]: `var(--${skill})` }}>
      <PageHeader eyebrow={t.nav[skill]} title={t.course.title} description={t.course.description} />
      <div className="course__meta">
        <Badge tone="neutral">
          {done}/{path.units.length} · {t.course.done}
        </Badge>
        <span>{path.learnerLevel ? t.course.yourLevel(path.learnerLevel) : t.course.noLevel}</span>
      </div>

      {levels.map((level) => (
        <section key={level} className="course__level">
          <h2 className="course__level-title">{t.course.level(level)}</h2>
          <ol className="course__list">
            {path.units
              .filter((u) => u.level === level)
              .map((unit) => {
                number++;
                const state = stateOf(unit, current);
                const label =
                  state === 'done' ? t.course.review : state === 'current' ? (unit.progress ? t.course.continue : t.course.start) : state === 'open' ? t.course.start : state === 'locked' ? t.course.preview : t.course.soon;
                const body = (
                  <>
                    <span className={`course-unit__dot course-unit__dot--${state}`} aria-hidden>
                      {state === 'done' ? <Icon name="check" size={16} /> : state === 'locked' ? <Icon name="lock" size={14} /> : number}
                    </span>
                    <span className="course-unit__main">
                      <span className="course-unit__title">{unit.title[locale]}</span>
                      <span className="course-unit__sub">
                        {state === 'done' && unit.progress?.bestBand != null
                          ? t.course.best(unit.progress.bestBand)
                          : state === 'locked'
                            ? t.course.locked
                            : unit.title[locale === 'vi' ? 'en' : 'vi']}
                      </span>
                    </span>
                    <span className="course-unit__action">
                      {label}
                      {state !== 'soon' && <Icon name="chevronRight" size={16} />}
                    </span>
                  </>
                );
                return (
                  <li key={unit.id}>
                    {state === 'soon' ? (
                      <div className="course-unit course-unit--soon" aria-disabled>
                        {body}
                      </div>
                    ) : (
                      <Link to={unitPath(skill, unit.id)} className={`course-unit course-unit--${state}`}>
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
};
