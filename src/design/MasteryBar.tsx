/**
 * MasteryBar
 * A stacked bar of how much of a set is mastered, known fairly well, being learned and not started. The legend
 * under it says the same in words and symbols (● ◕ ◔ ○), so the colours are never the only signal.
 */
import type React from 'react';
import './MasteryBar.css';

interface MasteryBarProps {
  mastered: number;
  good: number;
  learning: number;
  fresh: number;
  /** Legend wording: "mastered", "fairly known", "learning", "not started" */
  labels: { mastered: string; good: string; learning: string; fresh: string };
}

export const MasteryBar: React.FC<MasteryBarProps> = ({ mastered, good, learning, fresh, labels }) => {
  const total = mastered + good + learning + fresh;
  const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const items = [
    { key: 'mastered', symbol: '●', count: mastered, label: labels.mastered },
    { key: 'good', symbol: '◕', count: good, label: labels.good },
    { key: 'learning', symbol: '◔', count: learning, label: labels.learning },
    { key: 'fresh', symbol: '○', count: fresh, label: labels.fresh },
  ] as const;

  return (
    <div className="mastery">
      <div className="mastery__bar" role="img" aria-label={items.map((i) => `${i.count} ${i.label}`).join(', ')}>
        {items.map((i) => (
          <span key={i.key} className={`mastery__seg mastery__seg--${i.key}`} style={{ width: `${share(i.count)}%` }} />
        ))}
      </div>
      <ul className="mastery__legend">
        {items.map((i) => (
          <li key={i.key}>
            <span aria-hidden="true">{i.symbol}</span> {i.count} {i.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
