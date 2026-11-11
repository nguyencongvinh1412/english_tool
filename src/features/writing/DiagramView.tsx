/**
 * DiagramView
 * The two diagram kinds of IELTS Task 1 besides charts: a process in numbered stages, and a place before and after a
 * change, drawn on a grid of labelled cells. The same data is given to the examiner, so what is drawn is what is scored.
 */
import type React from 'react';
import type { MapPanel, WritingDiagram } from '@/shared/contentApi';

const Grid: React.FC<{ panel: MapPanel; cols: number; rows: number }> = ({ panel, cols, rows }) => {
  const at = (col: number, row: number) => panel.cells.find((c) => c.col === col && c.row === row)?.text;
  return (
    <div className="diagram__panel">
      <strong className="diagram__panel-label">{panel.label}</strong>
      <div className="diagram__grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="table" aria-label={panel.label}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const text = at(col, row);
          return (
            <span key={i} role="cell" className={`diagram__cell ${text ? 'diagram__cell--on' : ''}`}>
              {text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const DiagramView: React.FC<{ diagram: WritingDiagram }> = ({ diagram }) => (
  <figure className="chart diagram">
    <figcaption className="chart__title">{diagram.title}</figcaption>
    {diagram.kind === 'process' ? (
      <ol className="diagram__steps">
        {diagram.steps.map((step, i) => (
          <li key={i} className="diagram__step">
            <span className="diagram__num">{i + 1}</span>
            <span>
              <strong lang="en">{step.label}</strong>
              {step.detail && (
                <span className="diagram__detail" lang="en">
                  {step.detail}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    ) : (
      <div className="diagram__maps">
        <Grid panel={diagram.before} cols={diagram.cols} rows={diagram.rows} />
        <Grid panel={diagram.after} cols={diagram.cols} rows={diagram.rows} />
      </div>
    )}
  </figure>
);
