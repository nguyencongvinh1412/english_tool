/**
 * ProfileProgress
 * Totals, 12-week heatmap, per-skill stats and paginated practice history
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Button, Card, StatTile } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useProgress, type Attempt } from '@/shared/progress';
import { progressApi } from '@/shared/progressApi';
import { Heatmap, RecentList, SkillStats } from './ProgressWidgets';
import './progress.css';

export const ProfileProgress: React.FC = () => {
  const { t } = useI18n();
  const { summary } = useProgress();
  const [history, setHistory] = useState<Attempt[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    progressApi
      .history()
      .then((page) => {
        setHistory(page.attempts);
        setNextBefore(page.nextBefore);
      })
      .catch(() => {});
  }, [summary?.attemptsTotal]);

  const loadMore = async (): Promise<void> => {
    if (!nextBefore) return;
    setIsLoadingMore(true);
    try {
      const page = await progressApi.history(nextBefore);
      setHistory((current) => [...current, ...page.attempts]);
      setNextBefore(page.nextBefore);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (!summary) return null;

  return (
    <section className="profile-progress">
      <div className="profile-progress__stats">
        <StatTile icon="flame" tone="streak" value={t.progress.days(summary.streak.current)} label={t.progress.streakShort} />
        <StatTile icon="flame" tone="speaking" value={t.progress.days(summary.streak.best)} label={t.progress.bestStreak} />
        <StatTile icon="bolt" tone="xp" value={summary.xpTotal} label={t.progress.xpTotal} />
        <StatTile icon="check" tone="brand" value={summary.attemptsTotal} label={t.progress.exercisesLabel} />
      </div>

      <div className="profile-progress__grid">
        <Card padding="lg">
          <h2 className="profile-form__title profile-progress__title">{t.progress.heatmapTitle}</h2>
          <Heatmap days={summary.heatmap} />
        </Card>
        <Card padding="lg">
          <h2 className="profile-form__title profile-progress__title">{t.progress.skillStats}</h2>
          <SkillStats skills={summary.skills} />
        </Card>
      </div>

      <Card padding="lg">
        <h2 className="profile-form__title profile-progress__title">{t.progress.history}</h2>
        <RecentList attempts={history} />
        {nextBefore && (
          <Button variant="secondary" size="sm" onClick={loadMore} loading={isLoadingMore} className="profile-progress__more">
            {t.progress.loadMore}
          </Button>
        )}
      </Card>
    </section>
  );
};
