/**
 * Mind map document operations
 * Pure functions on the tree the server stores (`root` + `nodes`). Each returns a new document and copies only the
 * nodes it changes, so unchanged nodes keep their identity and React can skip them.
 */

export const MAX_NODES = 300;
export const MAX_DEPTH = 12;
export const NODE_COLORS = ['listening', 'reading', 'speaking', 'writing', 'exam', 'brand'] as const;
export type NodeColor = (typeof NODE_COLORS)[number];

export interface NodeLink {
  kind: 'grammar' | 'word';
  id: string;
}

export interface MapNode {
  text: string;
  note?: string;
  link?: NodeLink;
  children: string[];
  collapsed?: boolean;
  color?: NodeColor;
}

export interface MapDoc {
  root: string;
  nodes: Record<string, MapNode>;
}

export const newNodeId = (): string => Math.random().toString(36).slice(2, 10);

export const countNodes = (doc: MapDoc): number => Object.keys(doc.nodes).length;

/**
 * Parent of every node, in one pass
 */
export function parentMap(doc: MapDoc): Map<string, string> {
  const parents = new Map<string, string>();
  for (const [id, node] of Object.entries(doc.nodes)) for (const child of node.children) parents.set(child, id);
  return parents;
}

/**
 * A node and everything below it
 */
export function subtreeIds(doc: MapDoc, id: string): string[] {
  const ids: string[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    ids.push(current);
    stack.push(...doc.nodes[current].children);
  }
  return ids;
}

/** Levels from the root (the root is 1) */
export function depthOf(doc: MapDoc, id: string): number {
  const parents = parentMap(doc);
  let depth = 1;
  for (let current = parents.get(id); current !== undefined; current = parents.get(current)) depth++;
  return depth;
}

/** Height of the subtree under a node, counting the node */
function heightOf(doc: MapDoc, id: string): number {
  return 1 + Math.max(0, ...doc.nodes[id].children.map((child) => heightOf(doc, child)));
}

export const canAddChild = (doc: MapDoc, parentId: string): boolean => countNodes(doc) < MAX_NODES && depthOf(doc, parentId) < MAX_DEPTH;

const patch = (doc: MapDoc, id: string, changes: Partial<MapNode>): MapDoc => ({ ...doc, nodes: { ...doc.nodes, [id]: { ...doc.nodes[id], ...changes } } });

/**
 * Adds a last child; the parent is opened so the new node shows
 * @returns The new document and the new id, or null when a limit is reached
 */
export function addChild(doc: MapDoc, parentId: string, text = ''): { doc: MapDoc; id: string } | null {
  if (!canAddChild(doc, parentId)) return null;
  const id = newNodeId();
  const parent = doc.nodes[parentId];
  const next: MapDoc = { ...doc, nodes: { ...doc.nodes, [id]: { text, children: [] }, [parentId]: { ...parent, children: [...parent.children, id], collapsed: false } } };
  return { doc: next, id };
}

/**
 * Adds a node right after another one (a child of the root when the root is given)
 */
export function addSibling(doc: MapDoc, id: string, text = ''): { doc: MapDoc; id: string } | null {
  const parentId = parentMap(doc).get(id);
  if (parentId === undefined) return addChild(doc, id, text);
  if (!canAddChild(doc, parentId)) return null;
  const newId = newNodeId();
  const parent = doc.nodes[parentId];
  const at = parent.children.indexOf(id) + 1;
  const children = [...parent.children.slice(0, at), newId, ...parent.children.slice(at)];
  return { doc: { ...doc, nodes: { ...doc.nodes, [newId]: { text, children: [] }, [parentId]: { ...parent, children } } }, id: newId };
}

/**
 * Deletes a node and everything below it (the root stays)
 * @returns The new document and the node to select next, or null for the root
 */
export function removeNode(doc: MapDoc, id: string): { doc: MapDoc; select: string } | null {
  const parentId = parentMap(doc).get(id);
  if (parentId === undefined) return null;
  const parent = doc.nodes[parentId];
  const index = parent.children.indexOf(id);
  const children = parent.children.filter((child) => child !== id);
  const nodes = { ...doc.nodes, [parentId]: { ...parent, children } };
  for (const gone of subtreeIds(doc, id)) delete nodes[gone];
  return { doc: { ...doc, nodes }, select: children[Math.min(index, children.length - 1)] ?? parentId };
}

export const updateNode = (doc: MapDoc, id: string, changes: Partial<MapNode>): MapDoc => patch(doc, id, changes);

export const toggleCollapsed = (doc: MapDoc, id: string): MapDoc => (doc.nodes[id].children.length === 0 ? doc : patch(doc, id, { collapsed: !doc.nodes[id].collapsed }));

/**
 * Moves a node earlier (-1) or later (1) among its siblings
 */
export function moveSibling(doc: MapDoc, id: string, direction: -1 | 1): MapDoc {
  const parentId = parentMap(doc).get(id);
  if (parentId === undefined) return doc;
  const parent = doc.nodes[parentId];
  const from = parent.children.indexOf(id);
  const to = from + direction;
  if (to < 0 || to >= parent.children.length) return doc;
  const children = [...parent.children];
  [children[from], children[to]] = [children[to], children[from]];
  return patch(doc, parentId, { children });
}

/**
 * Makes a node the last child of the sibling before it
 */
export function indent(doc: MapDoc, id: string): MapDoc {
  const parentId = parentMap(doc).get(id);
  if (parentId === undefined) return doc;
  const siblings = doc.nodes[parentId].children;
  const previous = siblings[siblings.indexOf(id) - 1];
  // Moving one level down must not push the subtree past the depth limit
  if (previous === undefined || depthOf(doc, previous) + heightOf(doc, id) > MAX_DEPTH) return doc;
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [parentId]: { ...doc.nodes[parentId], children: siblings.filter((s) => s !== id) },
      [previous]: { ...doc.nodes[previous], children: [...doc.nodes[previous].children, id], collapsed: false },
    },
  };
}

/**
 * Makes a node a sibling placed right after its parent (children of the root cannot move out)
 */
export function outdent(doc: MapDoc, id: string): MapDoc {
  const parents = parentMap(doc);
  const parentId = parents.get(id);
  const grandId = parentId === undefined ? undefined : parents.get(parentId);
  if (parentId === undefined || grandId === undefined) return doc;
  const grand = doc.nodes[grandId];
  const at = grand.children.indexOf(parentId) + 1;
  return {
    ...doc,
    nodes: {
      ...doc.nodes,
      [parentId]: { ...doc.nodes[parentId], children: doc.nodes[parentId].children.filter((c) => c !== id) },
      [grandId]: { ...grand, children: [...grand.children.slice(0, at), id, ...grand.children.slice(at)] },
    },
  };
}

/**
 * The map as an indented Markdown list (links become a trailing tag, notes an indented quote)
 */
export function toMarkdown(doc: MapDoc): string {
  const lines: string[] = [`# ${doc.nodes[doc.root].text}`, ''];
  const walk = (id: string, depth: number) => {
    const node = doc.nodes[id];
    const tag = node.link ? ` [${node.link.kind}: ${node.link.id}]` : '';
    lines.push(`${'  '.repeat(depth)}- ${node.text}${tag}`);
    if (node.note) lines.push(...node.note.split('\n').map((line) => `${'  '.repeat(depth + 1)}> ${line}`));
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const child of doc.nodes[doc.root].children) walk(child, 0);
  return `${lines.join('\n')}\n`;
}

/**
 * Undo history: the documents before and after the current one
 */
export interface History {
  past: MapDoc[];
  present: MapDoc;
  future: MapDoc[];
}

const HISTORY_LIMIT = 50;

export const startHistory = (doc: MapDoc): History => ({ past: [], present: doc, future: [] });

export function commit(history: History, doc: MapDoc): History {
  if (doc === history.present) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: doc, future: [] };
}

export const undo = (h: History): History => (h.past.length === 0 ? h : { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] });

export const redo = (h: History): History => (h.future.length === 0 ? h : { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) });

/**
 * Colour of every node: its own, else its parent's, else the colour of its branch (the nodes under the root take
 * the six colours in turn)
 */
export function toneMap(doc: MapDoc): Map<string, NodeColor> {
  const tones = new Map<string, NodeColor>();
  const walk = (id: string, inherited: NodeColor) => {
    const tone = doc.nodes[id].color ?? inherited;
    tones.set(id, tone);
    for (const child of doc.nodes[id].children) walk(child, tone);
  };
  const root = doc.nodes[doc.root];
  tones.set(doc.root, root.color ?? 'brand');
  root.children.forEach((child, i) => walk(child, root.color ?? NODE_COLORS[i % NODE_COLORS.length]));
  return tones;
}

/**
 * Ids in reading order, skipping what is hidden under a collapsed node
 */
export function visibleOrder(doc: MapDoc): string[] {
  const order: string[] = [];
  const walk = (id: string) => {
    order.push(id);
    if (!doc.nodes[id].collapsed) doc.nodes[id].children.forEach(walk);
  };
  walk(doc.root);
  return order;
}

/** How many nodes sit below a node */
export const descendantCount = (doc: MapDoc, id: string): number => subtreeIds(doc, id).length - 1;

/**
 * Opens every node, or closes every node that has children (the root stays open)
 */
export function setAllCollapsed(doc: MapDoc, collapsed: boolean): MapDoc {
  const nodes: MapDoc['nodes'] = {};
  for (const [id, node] of Object.entries(doc.nodes)) nodes[id] = node.children.length > 0 && Boolean(node.collapsed) !== (collapsed && id !== doc.root) ? { ...node, collapsed: collapsed && id !== doc.root } : node;
  return { ...doc, nodes };
}
