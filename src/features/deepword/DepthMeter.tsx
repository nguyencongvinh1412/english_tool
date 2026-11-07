/**
 * DepthMeter
 * How deep a word is known: the 5 stages as a ladder, and the 3 aspects (form, meaning, use) each known by
 * recognising and by producing. Always words and symbols, never colour alone.
 */
import type React from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { ASPECTS, cellOf, type Cells, type DeepStage, type Level } from '@/shared/deepWordApi';

const SYMBOLS = ['○', '◔', '●'] as const;
const LEVELS: Level[] = ['r', 'p'];

/** The 5 stages as a ladder: stages passed are light, the current one solid, the rest dashed */
export const StageLadder: React.FC<{ stage: DeepStage }> = ({ stage }) => {
  const { t } = useI18n();
  const d = t.deepWord;
  return (
    <div className="dw-ladder">
      <ol className="dw-ladder__cells" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <li key={n} className={n < stage ? 'is-past' : n === stage ? 'is-now' : ''} />
        ))}
      </ol>
      <p className="dw-ladder__label">
        {d.stageOf(stage)} · {d.stageNames[stage - 1]}
      </p>
    </div>
  );
};

/** Three bars (Form, Meaning, Use), each with two halves: recognise and produce */
export const DepthBars: React.FC<{ cells: Cells }> = ({ cells }) => {
  const { t } = useI18n();
  const d = t.deepWord;
  return (
    <div className="dw-bars">
      {ASPECTS.map((aspect) => (
        <div key={aspect} className="dw-bar">
          <div className="dw-bar__head">
            <span className="dw-bar__name">{d.aspects[aspect]}</span>
            <span className="dw-bar__hint">{d.aspectHints[aspect]}</span>
          </div>
          <div className="dw-bar__segs">
            {LEVELS.map((level) => {
              const value = cellOf(cells, aspect, level);
              return (
                <div key={level} className={`dw-seg dw-seg--${value}`}>
                  <span>
                    {SYMBOLS[value]} {d.levels[level]} · {d.cellState[value]}
                  </span>
                  <span className="dw-seg__fill" aria-hidden="true">
                    <span />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/** A compact 3 × 2 grid for small spaces */
export const DepthGrid: React.FC<{ cells: Cells; before?: Cells | null }> = ({ cells, before }) => {
  const { t } = useI18n();
  const d = t.deepWord;
  return (
    <div className="dw-grid" role="table">
      <span />
      {LEVELS.map((level) => (
        <span key={level} className="dw-grid__head">
          {d.levels[level]}
        </span>
      ))}
      {ASPECTS.map((aspect) => (
        <div key={aspect} style={{ display: 'contents' }} role="row">
          <strong>{d.aspects[aspect]}</strong>
          {LEVELS.map((level) => {
            const value = cellOf(cells, aspect, level);
            const was = before ? cellOf(before, aspect, level) : value;
            return (
              <span key={level} role="cell">
                {SYMBOLS[value]} {d.cellState[value]}
                {value > was ? ' ↑' : ''}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
