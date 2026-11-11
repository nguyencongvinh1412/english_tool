import { describe, expect, it } from 'vitest';
import { GATE_GROUPS, GATES, parseGateGroup } from './gateContent.js';
import { FULL_TYPES, GENERATED_TYPES } from './practice.js';
import { PATH_SKILLS } from './bands.js';

const questionsOf = (id: string) => (GATE_GROUPS.find((g) => g.id === id)!.payload as { questions: unknown[] }).questions.length;

describe('gate content', () => {
  it('every group matches its schema (gap answers appear in the source text)', () => {
    for (const group of GATE_GROUPS) expect(() => parseGateGroup(group), group.id).not.toThrow();
  });

  it('group ids are unique', () => {
    const ids = GATE_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every gate points at existing groups of the right skill, or at a known pool', () => {
    const byId = new Map(GATE_GROUPS.map((g) => [g.id, g]));
    const pools = new Set<string>([...GENERATED_TYPES, ...FULL_TYPES]);
    for (const gate of Object.values(GATES)) {
      for (const version of ['A', 'B'] as const) {
        for (const skill of PATH_SKILLS) {
          const source = gate.versions[version][skill];
          if (Array.isArray(source)) {
            expect(source.length, `gate ${gate.gate}${version} ${skill}`).toBeGreaterThan(0);
            for (const id of source) expect(byId.get(id)?.skill, id).toBe(skill);
          } else {
            if ('real' in source) expect(source.real.every((id) => id.startsWith('book-')), `gate ${gate.gate}${version} ${skill}`).toBe(true);
            expect(source.pool.length, `gate ${gate.gate}${version} ${skill}`).toBeGreaterThan(0);
            for (const type of source.pool) expect(pools.has(type), type).toBe(true);
          }
        }
      }
    }
  });

  it('Gate 0 asks 20 listening and 26 reading questions', () => {
    const count = (ids: string[]) => ids.reduce((n, id) => n + questionsOf(id), 0);
    expect(count(GATES[0].versions.A.listening as string[])).toBe(20);
    expect(count(GATES[0].versions.A.reading as string[])).toBe(26);
  });

  it('Gates 1-4 (version A) have 10 listening and 10 reading questions, scaled by 4 to 40', () => {
    for (const gate of [1, 2, 3, 4]) {
      expect(questionsOf(`gate-${gate}-listening`), `gate ${gate} listening`).toBe(10);
      expect(questionsOf(`gate-${gate}-reading`), `gate ${gate} reading`).toBe(10);
    }
  });

  it('Gates 5-6 are full tests: four listening sections and three reading passages from the pool, in both versions', () => {
    for (const gate of [5, 6]) {
      for (const version of ['A', 'B'] as const) {
        const { listening, reading } = GATES[gate].versions[version];
        expect(Array.isArray(listening) ? 0 : listening.pool.length).toBe(4);
        expect(Array.isArray(reading) ? 0 : reading.pool.length).toBe(3);
      }
    }
  });

  it('every gate has a writing task 1 and 2 and a speaking set in both versions, with targets in the word counts of the book', () => {
    const minWords = (gate: number) => [GATE_GROUPS.find((g) => g.id === `gate-${gate}-A-writing-1`)!, GATE_GROUPS.find((g) => g.id === `gate-${gate}-A-writing-2`)!].map((g) => (g.payload as { minWords: number }).minWords);
    expect(minWords(1)).toEqual([120, 150]);
    expect(minWords(2)).toEqual([150, 200]);
    expect(minWords(3)).toEqual([150, 230]);
    expect(minWords(4)).toEqual([160, 250]);
    expect(minWords(5)).toEqual([170, 260]);
    expect(minWords(6)).toEqual([170, 260]);
    for (const gate of [1, 2, 3, 4, 5, 6]) for (const version of ['A', 'B']) expect(GATE_GROUPS.some((g) => g.id === `gate-${gate}-${version}-speaking`), `${gate}${version}`).toBe(true);
  });

  it('speaking has Part 3 from Gate 2 on, and none in Gates 0 and 1', () => {
    const part3 = (id: string) => (GATE_GROUPS.find((g) => g.id === id)!.payload as { part3: unknown[] }).part3.length;
    expect(part3('gate-0-speaking')).toBe(0);
    expect(part3('gate-1-A-speaking')).toBe(0);
    for (const gate of [2, 3, 4, 5, 6]) expect(part3(`gate-${gate}-A-speaking`), `gate ${gate}`).toBeGreaterThanOrEqual(2);
  });

  it('no group puts the correct option in the same position more than twice', () => {
    for (const group of GATE_GROUPS) {
      const questions = ((group.payload as { questions?: { type: string; answerIndex?: number; options?: string[] }[] }).questions ?? []).filter((q) => q.type === 'mcq');
      const uses = new Map<number, number>();
      for (const q of questions) uses.set(q.answerIndex!, (uses.get(q.answerIndex!) ?? 0) + 1);
      expect(Math.max(0, ...uses.values()), group.id).toBeLessThanOrEqual(2);
    }
  });
});

describe('Gates 5 and 6 on real tests', () => {
  it('take the Listening and Reading of Gate 5 from Cambridge 17 tests 1 and 2 and of Gate 6 from Cambridge 13 tests 3 and 4, with a generated test as the fallback', () => {
    const real = (gate: number, version: 'A' | 'B', skill: 'listening' | 'reading') => (GATES[gate].versions[version][skill] as { real: string[]; pool: string[] });
    expect(real(5, 'A', 'listening').real).toEqual(['book-c17-t1-l1', 'book-c17-t1-l2', 'book-c17-t1-l3', 'book-c17-t1-l4']);
    expect(real(5, 'B', 'reading').real).toEqual(['book-c17-t2-r1', 'book-c17-t2-r2', 'book-c17-t2-r3']);
    expect(real(6, 'A', 'listening').real[0]).toBe('book-c13-t3-l1');
    expect(real(6, 'B', 'reading').real).toEqual(['book-c13-t4-r1', 'book-c13-t4-r2', 'book-c13-t4-r3']);
    expect(real(6, 'A', 'reading').pool).toEqual(['g-r', 'g-r', 'g-r']);
  });
});
