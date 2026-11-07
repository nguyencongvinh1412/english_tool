/**
 * Depth of a word (Deep Word Learning). Pure functions, so the rules are easy to test.
 *
 * A word is known in three aspects (form, meaning, use), each by recognising it (r) and by producing it (p).
 * Each of the six cells is 0 (not yet), 1 (in progress) or 2 (done). The overall stage, 1 to 5, comes from the cells
 * and from how often the learner used the word without help.
 */

export type Cell = 0 | 1 | 2;
export type Aspect = 'form' | 'meaning' | 'use';
export type Level = 'r' | 'p';
export type Result = 'pass' | 'partial' | 'fail';

export interface Cells {
  formR: Cell;
  formP: Cell;
  meaningR: Cell;
  meaningP: Cell;
  useR: Cell;
  useP: Cell;
}

export const EMPTY_CELLS: Cells = { formR: 0, formP: 0, meaningR: 0, meaningP: 0, useR: 0, useP: 0 };

/** How often the learner produced the word correctly without help */
export interface Evidence {
  /** Correct unaided productions (including the one being applied) */
  unaidedPasses: number;
  /** Different days those happened on */
  passDays: number;
}

/** Productions needed on separate days before a production cell counts as done */
export const PRODUCTIVE_DAYS = 2;

export const STAGES = ['met', 'recognised', 'understood', 'assisted', 'spontaneous'] as const;

export const cellKey = (aspect: Aspect, level: Level): keyof Cells => `${aspect}${level === 'r' ? 'R' : 'P'}` as keyof Cells;

/**
 * Cells after one exercise. A cell never goes down. Recognising: any try moves the cell to "in progress" and a
 * correct answer finishes it. Producing: only a correct (or partly correct) use counts, a wrong one changes
 * nothing; a correct unaided use finishes the cell only on separate days (a helped one stays "in progress").
 */
export function applyResult(cells: Cells, aspect: Aspect, level: Level, result: Result, assisted: boolean, evidence: Evidence): Cells {
  const key = cellKey(aspect, level);
  let target: Cell = 1;
  if (level === 'r') {
    if (result === 'pass' && !assisted) target = 2;
  } else if (result === 'fail') {
    target = 0;
  } else if (result === 'pass' && !assisted && evidence.passDays >= PRODUCTIVE_DAYS) {
    target = 2;
  }
  return { ...cells, [key]: Math.max(cells[key], target) as Cell };
}

/**
 * Overall stage 1 to 5: met, recognised, understood, used with help, used without help
 */
export function computeStage(cells: Cells, evidence: Evidence): 1 | 2 | 3 | 4 | 5 {
  if (cells.useP === 2 && evidence.unaidedPasses >= PRODUCTIVE_DAYS && evidence.passDays >= PRODUCTIVE_DAYS) return 5;
  if (cells.useP >= 1) return 4;
  if (cells.meaningR === 2 && cells.useR === 2) return 3;
  if (cells.formR >= 1 && cells.meaningR >= 1) return 2;
  return 1;
}
