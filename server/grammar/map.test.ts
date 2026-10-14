import { describe, expect, it } from 'vitest';
import { GRAMMAR_CLUSTERS, GRAMMAR_POINTS, grammarEdges } from './map.js';

describe('grammar map', () => {
  const ids = new Set(GRAMMAR_POINTS.map((p) => p.id));

  it('has unique points in known clusters, and every link points at a real point', () => {
    expect(ids.size).toBe(GRAMMAR_POINTS.length);
    const clusters = new Set(GRAMMAR_CLUSTERS.map((c) => c.id));
    for (const point of GRAMMAR_POINTS) {
      expect(clusters.has(point.cluster), point.id).toBe(true);
      for (const id of [...(point.builds ?? []), ...(point.contrasts ?? []), ...(point.related ?? [])]) {
        expect(ids.has(id), `${point.id} -> ${id}`).toBe(true);
        expect(id, point.id).not.toBe(point.id);
      }
    }
  });

  it('has no cycles in what to learn first', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      if (done.has(id)) return;
      expect(visiting.has(id), `cycle through ${id}`).toBe(false);
      visiting.add(id);
      for (const before of GRAMMAR_POINTS.find((p) => p.id === id)?.builds ?? []) visit(before);
      visiting.delete(id);
      done.add(id);
    };
    GRAMMAR_POINTS.forEach((p) => visit(p.id));
  });

  it('keeps one edge per contrast pair and timelines inside the axis', () => {
    const contrasts = grammarEdges().filter((e) => e.kind === 'contrast');
    const keys = contrasts.map((e) => [e.from, e.to].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    for (const point of GRAMMAR_POINTS) {
      for (const mark of point.timeline?.marks ?? []) {
        expect(Math.abs(mark.from)).toBeLessThanOrEqual(1);
        if (mark.to !== undefined) expect(mark.to).toBeGreaterThanOrEqual(mark.from);
      }
    }
  });
});
