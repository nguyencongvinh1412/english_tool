import { describe, expect, it } from 'vitest';
import type { GrammarMap } from '@/shared/grammarApi';
import { buildMapTree, buildPrerequisiteTree, buildRelations, centerId } from './treeData';

const title = (en: string) => ({ en, vi: en });
const point = (id: string, cluster: string) => ({ id, cluster, title: title(id), cefr: 'A1' as const, hasTimeline: false, ready: true, status: null, summary: null, signals: [] });
const data: GrammarMap = {
  clusters: [
    { id: 'c1', title: title('One') },
    { id: 'c2', title: title('Two') },
  ],
  points: [point('a', 'c1'), point('b', 'c1'), point('c', 'c2'), point('d', 'c2')],
  edges: [
    { from: 'a', to: 'b', kind: 'builds' },
    { from: 'b', to: 'c', kind: 'builds' },
    { from: 'b', to: 'd', kind: 'builds' },
    { from: 'c', to: 'd', kind: 'contrast' },
    { from: 'a', to: 'd', kind: 'related' },
  ],
};
const layout = { widths: [100, 80], colGap: 20, rowHeight: 10 };

describe('buildMapTree', () => {
  it('groups points under their cluster', () => {
    const tree = buildMapTree(data);
    expect(tree.children?.map((c) => [c.id, c.children?.map((p) => p.id)])).toEqual([
      ['cluster:c1', ['a', 'b']],
      ['cluster:c2', ['c', 'd']],
    ]);
  });
});

describe('buildRelations', () => {
  it('records both directions and puts confusable points first', () => {
    const links = buildRelations(data);
    expect(links.get('b')?.get('a')).toEqual(['before']);
    expect(links.get('a')?.get('b')).toEqual(['next']);
    expect([...(links.get('d')?.keys() ?? [])]).toEqual(['b', 'c', 'a']);
    expect(links.get('c')?.get('d')).toEqual(['contrast']);
    expect(links.get('d')?.get('c')).toEqual(['contrast']);
  });
});

describe('buildPrerequisiteTree', () => {
  it('puts prerequisites on the left and what follows on the right', () => {
    const tree = buildPrerequisiteTree(data, 'b', layout);
    const ids = tree.nodes.map((n) => n.id).sort();
    expect(ids).toEqual([centerId('b'), 'L:a', 'R:c', 'R:d'].sort());
    const byId = Object.fromEntries(tree.nodes.map((n) => [n.id, n]));
    expect(byId['L:a'].x).toBeLessThan(0);
    expect(byId['R:c'].x).toBeGreaterThan(0);
    // The point sits level with its neighbours' middle
    expect(byId[centerId('b')].y).toBe(5);
    expect(tree.links).toContainEqual({ from: 'L:a', to: centerId('b'), side: 'left' });
    expect(tree.links).toContainEqual({ from: centerId('b'), to: 'R:c', side: 'right' });
  });

  it('shows just the point when it has no builds links', () => {
    expect(buildPrerequisiteTree({ ...data, edges: [] }, 'a', layout).nodes.map((n) => n.id)).toEqual([centerId('a')]);
  });
});
