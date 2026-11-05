/**
 * ActivityProgress
 * "Question 3 / 8" with one segment per step: done, current, still to come. The words carry the meaning; the
 * segments only echo it.
 */
import type React from 'react';

/** Past this many steps a segment each would be too thin to read; one bar is used instead */
const LONG = 12;

export const ActivityProgress: React.FC<{ label: string; index: number; total: number }> = ({ label, index, total }) => (
  <div className="activity-progress">
    <div className="activity-progress__label">
      <span>{label}</span>
    </div>
    {total > LONG ? (
      <div className="activity-progress__line" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (index / total) * 100)}%` }} />
      </div>
    ) : (
      <ol className="activity-progress__bars" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <li key={i} className={i < index ? 'is-done' : i === index ? 'is-current' : ''} />
        ))}
      </ol>
    )}
  </div>
);
