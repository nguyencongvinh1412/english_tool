/**
 * TenseTimeline
 * Timeline drawing of a tense: past on the left, now in the middle, future on the right.
 * Points are single moments, bars are actions in progress, dots are habits, and dashed arcs
 * connect an action to a later time; a dashed tick marks the time it is measured against.
 */
import type React from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { Timeline } from '@/shared/grammarApi';

const WIDTH = 600;
const AXIS_Y = 92;
const LEFT = 36;
const RIGHT = WIDTH - 36;

/** x positions of the crosses for a habit, about 34px apart */
const repeats = (from: number, to: number) => {
  const steps = Math.max(2, Math.round((to - from) / 34));
  return Array.from({ length: steps + 1 }, (_, k) => from + ((to - from) * k) / steps);
};

/** -1…1 on the axis to x */
const xOf = (value: number) => (LEFT + RIGHT) / 2 + value * ((RIGHT - LEFT) / 2 - 12);

export const TenseTimeline: React.FC<{ timeline: Timeline; label: string }> = ({ timeline, label }) => {
  const { t, locale } = useI18n();
  const text = (value: { en: string; vi: string } | undefined) => (value ? value[locale] : '');
  const labelled = timeline.marks.filter((m) => m.label);

  return (
    <figure className="timeline">
      <svg viewBox={`0 0 ${WIDTH} 150`} role="img" aria-label={`${label}: ${labelled.map((m) => text(m.label)).join(', ')}`}>
        <defs>
          <marker id="timeline-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" className="timeline__arrow" />
          </marker>
        </defs>
        {/* Axis */}
        <line x1={LEFT} y1={AXIS_Y} x2={RIGHT} y2={AXIS_Y} className="timeline__axis" markerEnd="url(#timeline-arrow)" />
        <line x1={xOf(0)} y1={AXIS_Y - 40} x2={xOf(0)} y2={AXIS_Y + 14} className="timeline__now" />
        <text x={LEFT} y={AXIS_Y + 30} className="timeline__end">
          {t.grammar.past}
        </text>
        <text x={xOf(0)} y={AXIS_Y + 30} textAnchor="middle" className="timeline__end timeline__end--now">
          {t.grammar.now}
        </text>
        <text x={RIGHT} y={AXIS_Y + 30} textAnchor="end" className="timeline__end">
          {t.grammar.future}
        </text>

        {timeline.reference && (
          <g className="timeline__reference">
            <line x1={xOf(timeline.reference.at)} y1={AXIS_Y - 26} x2={xOf(timeline.reference.at)} y2={AXIS_Y + 12} />
            <text x={xOf(timeline.reference.at)} y={AXIS_Y + 48} textAnchor="middle">
              {text(timeline.reference.label)}
            </text>
          </g>
        )}

        {timeline.marks.map((mark, i) => {
          const from = xOf(mark.from);
          const to = xOf(mark.to ?? mark.from);
          const labelY = AXIS_Y - 34 - labelled.indexOf(mark) * 18;
          // Keep labels inside the drawing
          const labelX = Math.min(RIGHT - 70, Math.max(LEFT + 70, (from + to) / 2));
          return (
            <g key={i} className={`timeline__mark timeline__mark--${mark.kind}`}>
              {mark.kind === 'point' && <circle cx={from} cy={AXIS_Y} r={8} />}
              {mark.kind === 'span' && <rect x={from} y={AXIS_Y - 8} width={Math.max(8, to - from)} height={16} rx={8} />}
              {mark.kind === 'repeat' && repeats(from, to).map((x, k) => <path key={k} d={`M${x - 5} ${AXIS_Y - 5}l10 10m0 -10l-10 10`} />)}
              {mark.kind === 'link' && (
                <path d={`M${from} ${AXIS_Y - 6} Q${(from + to) / 2} ${AXIS_Y - 46} ${to} ${AXIS_Y - 6}`} markerEnd="url(#timeline-arrow)" />
              )}
              {mark.label && (
                <text x={labelX} y={mark.kind === 'link' ? Math.min(labelY, AXIS_Y - 50) : labelY} textAnchor="middle" className="timeline__label">
                  {text(mark.label)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
};
