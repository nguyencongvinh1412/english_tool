/**
 * WeeklyReviewDialog
 * Last week in numbers (days, minutes, how much of the weekly targets), the best and weakest skill, and one
 * suggestion. Opens once per week per browser when Today loads; closing it is always fine and changes nothing.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Button, Modal } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDay, weeklyApi, type WeeklyReview } from '@/shared/roadmapApi';
import './today.css';

const seenKey = (weekStart: string) => `weekly-seen-${weekStart}`;

function wasSeen(weekStart: string): boolean {
  try {
    return localStorage.getItem(seenKey(weekStart)) !== null;
  } catch {
    return false;
  }
}

function markSeen(weekStart: string): void {
  try {
    localStorage.setItem(seenKey(weekStart), '1');
  } catch {
    // storage blocked: it may show again on the next visit, which is harmless
  }
}

export const WeeklyReviewDialog: React.FC = () => {
  const { t } = useI18n();
  const w = t.weekly;
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState(false);

  useEffect(() => {
    weeklyApi
      .get()
      .then(({ review: data }) => {
        if (!data || wasSeen(data.weekStart)) return;
        setReview(data);
        setOpen(true);
      })
      .catch(() => {});
  }, []);

  if (!review) return null;
  const close = () => {
    markSeen(review.weekStart);
    setOpen(false);
  };
  const skill = (name: string) => t.today.kinds[name as keyof typeof t.today.kinds];
  const quiet = review.studyDays === 0;

  return (
    <Modal
      open={open}
      title={w.title(`${formatDay(review.weekStart)}–${formatDay(review.weekEnd)}`)}
      onClose={close}
      closeLabel={w.close}
      footer={
        review.suggestion && !applied && !quiet ? (
          <>
            <Button variant="ghost" onClick={close}>
              {w.keep}
            </Button>
            <Button
              onClick={async () => {
                await weeklyApi.apply(review.suggestion!.skill).catch(() => null);
                setApplied(true);
              }}
            >
              {w.apply}
            </Button>
          </>
        ) : (
          <Button onClick={close}>{w.close}</Button>
        )
      }
    >
      <div className="weekly">
        <div className="weekly__stats">
          <div>
            <strong>
              {review.studyDays}/{review.plannedDays}
            </strong>
            <span>{w.days}</span>
          </div>
          <div>
            <strong>{review.minutes === null ? '–' : `${review.minutes}′`}</strong>
            <span>{review.minutes === null ? w.minutesNone : w.minutes(review.plannedMinutes)}</span>
          </div>
          <div>
            <strong>{review.percent}%</strong>
            <span>{w.percent}</span>
          </div>
        </div>
        {quiet ? (
          <p>{w.quiet}</p>
        ) : (
          <>
            <ul className="weekly__targets">
              {review.targets.map((target) => (
                <li key={`${target.kind}-${target.skill ?? ''}`}>
                  <span>{target.kind === 'words' ? w.words(target.goal) : target.kind === 'grammar' ? w.grammar(target.goal) : w.sessions(target.goal, skill(target.skill!))}</span>
                  <strong>
                    {target.have >= target.goal ? `${target.have} ✓` : `${target.have} / ${target.goal}`}
                  </strong>
                </li>
              ))}
            </ul>
            <p>{w.bestWeak(review.best ? skill(review.best) : null, review.weak ? skill(review.weak) : null)}</p>
            {note ? (
              <p className="weekly__note">{note}</p>
            ) : (
              <p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="sparkles"
                  loading={noteBusy}
                  onClick={async () => {
                    setNoteBusy(true);
                    setNoteError(false);
                    try {
                      setNote(await weeklyApi.note());
                    } catch {
                      // A plan limit opens the upgrade prompt by itself; anything else is said here
                      setNoteError(true);
                    } finally {
                      setNoteBusy(false);
                    }
                  }}
                >
                  {w.aiNote}
                </Button>{' '}
                <span className="roadmap__muted">{w.aiNoteMeta}</span>
                {noteError && <span className="roadmap__muted"> {w.aiNoteFailed}</span>}
              </p>
            )}
            {review.suggestion && <p className="weekly__suggestion">{applied ? w.applied : w.suggestion(review.suggestion.minutes, skill(review.suggestion.skill))}</p>}
          </>
        )}
      </div>
    </Modal>
  );
};
