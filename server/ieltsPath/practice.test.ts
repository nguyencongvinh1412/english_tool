import { describe, expect, it } from 'vitest';
import { isCorrect } from '../exams/ielts.js';
import { matchQuestion, writingDiagram, writingPrompt } from '../content/schemas.js';
import { GATE_GROUPS } from './gateContent.js';
import { pathListening, pathReading } from './practice.js';
import { STATIC_GROUPS, parseStaticGroup } from './practiceContent.js';
import { PRACTICE_TYPES, phaseSteps, WRITTEN_PHASES } from './syllabus.js';

describe('practice content', () => {
  it('has every static group valid and a pool for each written practice type of phase 1', () => {
    for (const group of STATIC_GROUPS) expect(() => parseStaticGroup(group), group.id).not.toThrow();
    const used = new Set(WRITTEN_PHASES.flatMap((phase) => phaseSteps(phase)).filter((s) => s.kind === 'practice').map((s) => (s.ref as { type: string }).type));
    for (const type of used) {
      if (type.startsWith('w-') || type.startsWith('s-')) expect(STATIC_GROUPS.filter((g) => g.type === type).length, type).toBeGreaterThanOrEqual(3);
    }
    for (const type of used) expect((PRACTICE_TYPES as readonly string[]).includes(type)).toBe(true);
  });

  it('writes enough fresh prompts for the weeks that use them', () => {
    const count = (type: string) => WRITTEN_PHASES.flatMap((phase) => phaseSteps(phase)).filter((s) => s.kind === 'practice' && (s.ref as { type: string }).type === type).length;
    for (const type of ['w-para', 'w-task1', 'w-task2', 'w-line', 'w-opinion', 'w-advdis', 's-part1', 's-part2', 's-mock', 's-full'] as const) {
      expect(STATIC_GROUPS.filter((g) => g.type === type).length, type).toBeGreaterThanOrEqual(Math.min(count(type), 6));
    }
  });

  it('accepts a short listening group with matching questions and rejects a gap that is not in the script', () => {
    const base = GATE_GROUPS.find((g) => g.id === 'gate-0-listening-1')!.payload as { questions: unknown[] };
    const match = { type: 'match', prompt: 'The library', options: ['Floor 1', 'Floor 2', 'Floor 3'], answerIndex: 1, explanation: 'Said in the talk.' };
    const ok = { ...base, questions: [...base.questions.slice(0, 5), match] };
    expect(pathListening.safeParse(ok).success).toBe(true);
    const gaps = base.questions.map((q) => ({ ...(q as object) })) as { type: string; answers?: string[] }[];
    gaps[0] = { ...gaps[0], answers: ['not in the script'] };
    expect(pathListening.safeParse({ ...base, questions: gaps.slice(0, 6) }).success).toBe(false);
  });

  it('requires 5 to 13 reading questions', () => {
    const q = { type: 'tfng', prompt: 'A statement.', answer: 'true', explanation: 'Because.' };
    const group = { title: 'T', paragraphs: ['One short paragraph.'] };
    expect(pathReading.safeParse({ ...group, questions: Array(4).fill(q) }).success).toBe(false);
    expect(pathReading.safeParse({ ...group, questions: Array(6).fill(q) }).success).toBe(true);
  });

  it('marks a matching answer by its index', () => {
    const q = matchQuestion.parse({ type: 'match', prompt: 'x', options: ['a', 'b', 'c'], answerIndex: 2, explanation: 'y' });
    expect(isCorrect(q, 2)).toBe(true);
    expect(isCorrect(q, 1)).toBe(false);
    expect(isCorrect(q, undefined)).toBe(false);
  });
});

describe('Task 1 pie charts, processes and maps', () => {
  const chart = { type: 'pie', title: 'Spending', unit: 'per cent', categories: ['A', 'B', 'C'], series: [{ name: 'Spending', values: [50, 30, 20] }] };
  const base = { taskType: 'ielts-task1', title: 'T', instructions: 'Write.', prompt: 'Describe.', minWords: 150, timeMinutes: 20 };

  it('takes a pie chart with one series, and a second chart', () => {
    expect(writingPrompt.safeParse({ ...base, chart, extraChart: { ...chart, title: 'Later' } }).success).toBe(true);
  });
  it('rejects a pie chart with two series or a negative value', () => {
    expect(writingPrompt.safeParse({ ...base, chart: { ...chart, series: [chart.series[0], chart.series[0]] } }).success).toBe(false);
    expect(writingPrompt.safeParse({ ...base, chart: { ...chart, series: [{ name: 'x', values: [60, 50, -10] }] } }).success).toBe(false);
  });
  it('takes a process of four to nine stages', () => {
    const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Stage ${i + 1}` }));
    expect(writingDiagram.safeParse({ kind: 'process', title: 'P', steps: steps(4) }).success).toBe(true);
    expect(writingDiagram.safeParse({ kind: 'process', title: 'P', steps: steps(3) }).success).toBe(false);
    expect(writingDiagram.safeParse({ kind: 'process', title: 'P', steps: steps(10) }).success).toBe(false);
  });
  it('takes two maps on a grid, and rejects a cell outside it', () => {
    const panel = (cells: { col: number; row: number; text: string }[]) => ({ label: 'x', cells });
    const ok = { kind: 'map', title: 'M', cols: 4, rows: 3, before: panel([{ col: 0, row: 0, text: 'Park' }, { col: 1, row: 1, text: 'Road' }]), after: panel([{ col: 2, row: 2, text: 'Shop' }, { col: 3, row: 0, text: 'Road' }]) };
    expect(writingDiagram.safeParse(ok).success).toBe(true);
    expect(writingDiagram.safeParse({ ...ok, after: panel([{ col: 5, row: 0, text: 'Shop' }, { col: 0, row: 0, text: 'Road' }]) }).success).toBe(false);
  });
});

