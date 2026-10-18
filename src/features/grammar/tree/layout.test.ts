import { describe, expect, it } from 'vitest';
import { columnX, layoutTree, type TreeSource } from './layout';

const tree: TreeSource = {
  id: 'root',
  children: [
    { id: 'a', children: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }] },
    { id: 'b', children: [{ id: 'b1' }] },
    { id: 'c' },
  ],
};
const options = { widths: [100, 80, 60], colGap: 20, rowHeight: 10 };
const byId = <T extends { id: string }>(nodes: T[]) => Object.fromEntries(nodes.map((n) => [n.id, n])) as Record<string, T>;

describe('layoutTree', () => {
  it('shows only the root children until a node is expanded', () => {
    const { nodes, links } = layoutTree(tree, options);
    expect(nodes.map((n) => n.id)).toEqual(['root', 'a', 'b', 'c']);
    expect(links).toEqual([
      { from: 'root', to: 'a' },
      { from: 'root', to: 'b' },
      { from: 'root', to: 'c' },
    ]);
    expect(byId(nodes).a.hasChildren).toBe(true);
    expect(byId(nodes).a.expanded).toBe(false);
  });

  it('stacks leaves on rows and centres parents on their children', () => {
    const { nodes } = layoutTree(tree, { ...options, expanded: new Set(['a', 'b']) });
    const n = byId(nodes);
    expect([n.a1.y, n.a2.y, n.a3.y, n.b1.y, n.c.y]).toEqual([0, 10, 20, 30, 40]);
    expect(n.a.y).toBe(10);
    expect(n.b.y).toBe(30);
    expect(n.root.y).toBe(25);
  });

  it('puts each depth in its own column', () => {
    const { nodes } = layoutTree(tree, { ...options, expandAll: true });
    const n = byId(nodes);
    expect(n.root.x).toBe(0);
    expect(n.a.x).toBe(120);
    expect(n.a1.x).toBe(220);
  });

  it('mirrors to the left of the root', () => {
    const { nodes } = layoutTree(tree, { ...options, direction: -1, expandAll: true });
    const n = byId(nodes);
    expect(n.a.x).toBe(-100);
    expect(n.a1.x).toBe(-180);
    expect(columnX(2, options.widths, options.colGap, -1)).toBe(-180);
  });

  it('repeats the last width for deeper levels', () => {
    expect(columnX(4, [100, 80, 60], 20, 1)).toBe(100 + 20 + 80 + 20 + 60 + 20 + 60 + 20);
  });
});
