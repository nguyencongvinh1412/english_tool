import { describe, expect, it } from 'vitest';
import { GATE_GROUPS, GATES, parseGateGroup } from './gateContent.js';
import { PATH_SKILLS } from './bands.js';

describe('gate content', () => {
  it('every group matches its schema (gap answers appear in the source text)', () => {
    for (const group of GATE_GROUPS) expect(() => parseGateGroup(group), group.id).not.toThrow();
  });

  it('every gate points at existing groups of the right skill', () => {
    const byId = new Map(GATE_GROUPS.map((g) => [g.id, g]));
    for (const gate of Object.values(GATES)) {
      for (const skill of PATH_SKILLS) {
        expect(gate.groups[skill].length, `gate ${gate.gate} ${skill}`).toBeGreaterThan(0);
        for (const id of gate.groups[skill]) expect(byId.get(id)?.skill, id).toBe(skill);
      }
    }
  });

  it('Gate 0 asks 20 listening and 26 reading questions', () => {
    const count = (ids: string[]) => ids.reduce((n, id) => n + ((GATE_GROUPS.find((g) => g.id === id)!.payload as { questions: unknown[] }).questions.length), 0);
    expect(count(GATES[0].groups.listening)).toBe(20);
    expect(count(GATES[0].groups.reading)).toBe(26);
  });

  it('no group puts the correct option in the same position more than twice', () => {
    for (const group of GATE_GROUPS) {
      const questions = ((group.payload as { questions?: { type: string; answerIndex?: number }[] }).questions ?? []).filter((q) => q.type === 'mcq');
      const uses = new Map<number, number>();
      for (const q of questions) uses.set(q.answerIndex!, (uses.get(q.answerIndex!) ?? 0) + 1);
      expect(Math.max(0, ...uses.values()), group.id).toBeLessThanOrEqual(2);
    }
  });
});
