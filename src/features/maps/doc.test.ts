import { describe, expect, it } from 'vitest';
import { addChild, descendantCount, setAllCollapsed, toneMap, visibleOrder, addSibling, canAddChild, commit, indent, MAX_DEPTH, MAX_NODES, moveSibling, outdent, redo, removeNode, startHistory, toggleCollapsed, toMarkdown, undo, updateNode, type MapDoc } from './doc';

const base = (): MapDoc => ({
  root: 'r',
  nodes: {
    r: { text: 'Root', children: ['a', 'b', 'c'] },
    a: { text: 'A', children: ['a1', 'a2'] },
    a1: { text: 'A1', children: [] },
    a2: { text: 'A2', children: [], note: 'line 1\nline 2', link: { kind: 'grammar', id: 'past-simple' } },
    b: { text: 'B', children: [] },
    c: { text: 'C', children: [] },
  },
});

describe('map document operations', () => {
  it('adds a child last and opens a collapsed parent', () => {
    const doc: MapDoc = { ...base(), nodes: { ...base().nodes, a: { ...base().nodes.a, collapsed: true } } };
    const result = addChild(doc, 'a', 'new')!;
    expect(result.doc.nodes.a.children).toEqual(['a1', 'a2', result.id]);
    expect(result.doc.nodes.a.collapsed).toBe(false);
    expect(result.doc.nodes[result.id]).toEqual({ text: 'new', children: [] });
    // The original is untouched and unchanged nodes keep their identity
    expect(doc.nodes.a.children).toHaveLength(2);
    expect(result.doc.nodes.b).toBe(doc.nodes.b);
  });

  it('adds a sibling right after, and a child when given the root', () => {
    const after = addSibling(base(), 'a', 'x')!;
    expect(after.doc.nodes.r.children).toEqual(['a', after.id, 'b', 'c']);
    expect(addSibling(base(), 'r', 'x')!.doc.nodes.r.children).toHaveLength(4);
  });

  it('removes a subtree and suggests what to select next', () => {
    const result = removeNode(base(), 'a')!;
    expect(Object.keys(result.doc.nodes).sort()).toEqual(['b', 'c', 'r']);
    expect(result.select).toBe('b');
    expect(removeNode(result.doc, 'c')!.select).toBe('b');
    expect(removeNode(base(), 'r')).toBeNull();
    const only = { root: 'r', nodes: { r: { text: 'R', children: ['x'] }, x: { text: 'X', children: [] } } };
    expect(removeNode(only, 'x')!.select).toBe('r');
  });

  it('reorders among siblings and stops at the ends', () => {
    expect(moveSibling(base(), 'b', -1).nodes.r.children).toEqual(['b', 'a', 'c']);
    expect(moveSibling(base(), 'b', 1).nodes.r.children).toEqual(['a', 'c', 'b']);
    const first = base();
    expect(moveSibling(first, 'a', -1)).toBe(first);
    expect(moveSibling(first, 'r', 1)).toBe(first);
  });

  it('indents under the previous sibling and outdents after the parent', () => {
    const indented = indent(base(), 'b');
    expect(indented.nodes.r.children).toEqual(['a', 'c']);
    expect(indented.nodes.a.children).toEqual(['a1', 'a2', 'b']);
    const first = base();
    expect(indent(first, 'a')).toBe(first);

    const out = outdent(base(), 'a2');
    expect(out.nodes.a.children).toEqual(['a1']);
    expect(out.nodes.r.children).toEqual(['a', 'a2', 'b', 'c']);
    // Children of the root have nowhere to go
    expect(outdent(first, 'a')).toBe(first);
  });

  it('refuses to indent past the depth limit', () => {
    // r -> x and r -> t1 -> ... -> t11: the chain ends on level 12, the deepest allowed
    const nodes: MapDoc['nodes'] = { r: { text: 'r', children: ['x', 't1'] }, x: { text: 'x', children: [] } };
    for (let i = 1; i <= MAX_DEPTH - 1; i++) nodes[`t${i}`] = { text: `t${i}`, children: i < MAX_DEPTH - 1 ? [`t${i + 1}`] : [] };
    const deep: MapDoc = { root: 'r', nodes };
    // Moving the whole chain under x would put its end on level 13
    expect(indent(deep, 't1')).toBe(deep);
    expect(canAddChild(deep, `t${MAX_DEPTH - 1}`)).toBe(false);
    expect(canAddChild(deep, 'x')).toBe(true);
  });

  it('caps the number of nodes', () => {
    const nodes: MapDoc['nodes'] = { r: { text: 'r', children: Array.from({ length: MAX_NODES - 1 }, (_, i) => `n${i}`) } };
    for (let i = 0; i < MAX_NODES - 1; i++) nodes[`n${i}`] = { text: 'x', children: [] };
    expect(addChild({ root: 'r', nodes }, 'r', 'one too many')).toBeNull();
  });

  it('toggles collapse only where there are children', () => {
    expect(toggleCollapsed(base(), 'a').nodes.a.collapsed).toBe(true);
    const doc = base();
    expect(toggleCollapsed(doc, 'b')).toBe(doc);
  });

  it('writes an indented Markdown outline', () => {
    expect(toMarkdown(base())).toBe(['# Root', '', '- A', '  - A1', '  - A2 [grammar: past-simple]', '    > line 1', '    > line 2', '- B', '- C', ''].join('\n'));
  });

  it('keeps an undo history', () => {
    let h = startHistory(base());
    h = commit(h, updateNode(h.present, 'a', { text: 'A!' }));
    h = commit(h, updateNode(h.present, 'a', { text: 'A!!' }));
    expect(h.present.nodes.a.text).toBe('A!!');
    h = undo(h);
    expect(h.present.nodes.a.text).toBe('A!');
    h = redo(h);
    expect(h.present.nodes.a.text).toBe('A!!');
    // A new edit drops what could be redone
    h = commit(undo(h), updateNode(h.present, 'b', { text: 'B!' }));
    expect(h.future).toEqual([]);
    expect(undo(startHistory(base())).past).toEqual([]);
  });

  it('colours branches in turn, with own colours winning and passing down', () => {
    const doc = base();
    doc.nodes.b = { ...doc.nodes.b, color: 'exam' };
    doc.nodes.a2 = { ...doc.nodes.a2, color: 'writing' };
    const tones = toneMap(doc);
    expect(tones.get('r')).toBe('brand');
    expect(tones.get('a')).toBe('listening');
    expect(tones.get('a1')).toBe('listening');
    expect(tones.get('a2')).toBe('writing');
    expect(tones.get('b')).toBe('exam');
    expect(tones.get('c')).toBe('speaking');
  });

  it('lists nodes in reading order, skipping collapsed branches', () => {
    expect(visibleOrder(base())).toEqual(['r', 'a', 'a1', 'a2', 'b', 'c']);
    expect(visibleOrder(toggleCollapsed(base(), 'a'))).toEqual(['r', 'a', 'b', 'c']);
    expect(descendantCount(base(), 'a')).toBe(2);
  });

  it('opens or closes everything, keeping unchanged nodes as they are', () => {
    const closed = setAllCollapsed(base(), true);
    expect(closed.nodes.a.collapsed).toBe(true);
    expect(closed.nodes.r.collapsed).toBeFalsy();
    const open = setAllCollapsed(closed, false);
    expect(open.nodes.a.collapsed).toBe(false);
    expect(visibleOrder(open)).toEqual(['r', 'a', 'a1', 'a2', 'b', 'c']);
  });
});
