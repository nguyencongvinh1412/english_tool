import { describe, expect, it } from 'vitest';
import { DECISION_TREES } from '../../src/features/grammar/decisions.js';
import { GRAMMAR_POINTS } from './map.js';

describe('grammar decision trees', () => {
  const points = new Set(GRAMMAR_POINTS.map((p) => p.id));

  it('lead every answer to a real grammar point or question, and use every question', () => {
    for (const tree of DECISION_TREES) {
      expect(tree.nodes[tree.start], tree.id).toBeDefined();
      const reached = new Set([tree.start]);
      for (const [id, node] of Object.entries(tree.nodes)) {
        for (const option of node.options) {
          expect(Boolean(option.next) !== Boolean(option.result), `${tree.id}.${id}`).toBe(true);
          if (option.next) {
            expect(tree.nodes[option.next], `${tree.id}.${id} -> ${option.next}`).toBeDefined();
            reached.add(option.next);
          }
          if (option.result) expect(points.has(option.result.point), `${tree.id}.${id} -> ${option.result.point}`).toBe(true);
        }
      }
      expect([...reached].sort(), tree.id).toEqual(Object.keys(tree.nodes).sort());
    }
  });
});
