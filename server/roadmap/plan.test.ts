import { describe, expect, it } from 'vitest';
import { addDays, buildPlan, buildStages, buildTimePlan, type Catalog, type PlanInput } from './plan.js';

const catalog: Catalog = { words: { A2: 400, B1: 300, B2: 500 }, grammar: { A2: 20, B1: 24, B2: 20 } };
const toeic: PlanInput = { language: 'en', goalType: 'toeic', fromLevel: 'B1', targetLevel: 'B1', hoursPerWeek: 5, startDate: '2026-11-02', deadline: null, measured: false };

describe('buildStages', () => {
  it('splits a goal inside the learner\'s level into foundation, advanced and exam practice', () => {
    const stages = buildStages(toeic, catalog);
    expect(stages.map((s) => [s.kind, s.level, s.part])).toEqual([
      ['level', 'B1', 'foundation'],
      ['level', 'B1', 'advanced'],
      ['exam-prep', 'B1', null],
    ]);
    // 150 h x 0.4 = 60 h inside the level, plus 20 h of exam practice
    expect(stages.reduce((n, s) => n + s.hours, 0)).toBe(80);
    expect(stages.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('covers each level between the learner and the goal', () => {
    const stages = buildStages({ ...toeic, fromLevel: 'A2', targetLevel: 'B2', goalType: 'cefr' }, catalog);
    expect([...new Set(stages.map((s) => s.level))]).toEqual(['B1', 'B2']);
    // A general goal has no exam practice stage
    expect(stages.every((s) => s.kind === 'level')).toBe(true);
  });

  it('does not split a short level', () => {
    const stages = buildStages({ ...toeic, fromLevel: 'A2', targetLevel: 'B1', hoursPerWeek: 40, goalType: 'cefr' }, catalog);
    expect(stages).toHaveLength(1);
    expect(stages[0].part).toBeNull();
  });

  it('sets vocabulary and grammar targets from the catalogue, halfway for the foundation stage', () => {
    const [foundation, advanced] = buildStages(toeic, catalog);
    expect(advanced.objectives.vocabMastered).toBe(Math.round(300 * 0.7));
    expect(foundation.objectives.vocabMastered).toBe(Math.round(300 * 0.7 * 0.5));
    expect(advanced.objectives.grammarGood).toBe(Math.round(24 * 0.8));
  });

  it('practises listening and reading for TOEIC, all four skills for IELTS', () => {
    expect(Object.keys(buildStages(toeic, catalog)[0].objectives.sessions)).toEqual(['listening', 'reading']);
    expect(Object.keys(buildStages({ ...toeic, goalType: 'ielts' }, catalog)[0].objectives.sessions)).toHaveLength(4);
  });

  it('works for Japanese levels', () => {
    const stages = buildStages({ ...toeic, language: 'ja', goalType: 'jlpt', fromLevel: 'N4', targetLevel: 'N3' }, { words: { N3: 600 }, grammar: {} });
    expect(stages[0].level).toBe('N3');
    expect(stages[stages.length - 1].kind).toBe('exam-prep');
  });

  it('rejects an unknown goal level', () => {
    expect(() => buildStages({ ...toeic, targetLevel: 'Z9' }, catalog)).toThrow();
  });
});

describe('buildTimePlan', () => {
  const stages = buildStages(toeic, catalog);

  it('gives a range around the expected time, wider when the level was only self-assessed', () => {
    const self = buildTimePlan(toeic, stages);
    const measured = buildTimePlan({ ...toeic, measured: true }, stages);
    expect(self.weeks.mid).toBe(16);
    expect(self.etaFrom < self.etaTo).toBe(true);
    expect(measured.etaFrom > self.etaFrom).toBe(true);
    expect(measured.etaTo < self.etaTo).toBe(true);
  });

  it('is ok when the whole range is before the deadline', () => {
    expect(buildTimePlan({ ...toeic, deadline: addDays(toeic.startDate, 400) }, stages).feasibility).toBe('ok');
  });

  it('is tight when the deadline falls inside the range', () => {
    const plan = buildTimePlan({ ...toeic, deadline: addDays(toeic.startDate, 16 * 7) }, stages);
    expect(plan.feasibility).toBe('tight');
    expect(plan.fixes?.laterDeadline).toBe(plan.etaTo);
  });

  it('is hard when even the start of the range is after the deadline', () => {
    const plan = buildTimePlan({ ...toeic, deadline: addDays(toeic.startDate, 30) }, stages);
    expect(plan.feasibility).toBe('hard');
    // More hours per week would bring the high end back to the deadline
    expect(plan.fixes!.hoursPerWeek).toBeGreaterThan(toeic.hoursPerWeek);
  });

  it('has no deadline to miss without one', () => {
    const { plan } = buildPlan(toeic, catalog);
    expect(plan.feasibility).toBe('ok');
    expect(plan.fixes).toBeNull();
  });
});

describe('skills below the minimum asked for', () => {
  const stages = buildStages(toeic, catalog);

  it('adds hours for each level a skill still has to climb, and nothing when there are no gaps', () => {
    const base = buildTimePlan(toeic, stages);
    const gapped = buildTimePlan({ ...toeic, skillGaps: { listening: 1, reading: 0, writing: 2 } }, stages);
    // 3 levels short x 150 h (the goal level B1) x 0.15 = 68 h
    expect(gapped.extraHours).toBe(68);
    expect(gapped.totalHours).toBe(base.totalHours + 68);
    expect(gapped.skillGaps).toEqual({ listening: 1, writing: 2 });
    expect(base.extraHours).toBe(0);
  });

  it('pushes the expected date later', () => {
    const base = buildTimePlan(toeic, stages);
    const gapped = buildTimePlan({ ...toeic, skillGaps: { listening: 2 } }, stages);
    expect(gapped.etaTo > base.etaTo).toBe(true);
  });
});

