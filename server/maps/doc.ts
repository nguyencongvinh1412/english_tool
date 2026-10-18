/**
 * Mind map documents
 * A map is one JSON tree: `root` plus a `nodes` record. Validation checks the shape and the tree itself
 * (one parent per node, no cycles, nothing unreachable) and caps the size, so a stored map is always safe to draw.
 */
import { z } from 'zod';
import { GRAMMAR_CLUSTERS, GRAMMAR_POINTS } from '../grammar/map.js';

export const MAX_NODES = 300;
export const MAX_DEPTH = 12;
export const MAX_MAPS_PER_USER = 20;
export const NODE_COLORS = ['listening', 'reading', 'speaking', 'writing', 'exam', 'brand'] as const;

const nodeId = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);

const nodeSchema = z.object({
  text: z.string().trim().min(1).max(200),
  note: z.string().max(1000).optional(),
  link: z.object({ kind: z.enum(['grammar', 'word']), id: z.string().min(1).max(200) }).optional(),
  children: z.array(nodeId).max(MAX_NODES),
  collapsed: z.boolean().optional(),
  color: z.enum(NODE_COLORS).optional(),
});

export const docSchema = z.object({
  root: nodeId,
  nodes: z.record(nodeId, nodeSchema),
});

export type MapNode = z.infer<typeof nodeSchema>;
export type MapDoc = z.infer<typeof docSchema>;

const KNOWN_POINTS = new Set(GRAMMAR_POINTS.map((p) => p.id));

export class DocError extends Error {}

/**
 * Checks the tree structure and the grammar links of a parsed document
 * @throws DocError with a client-safe message
 */
export function checkDoc(doc: MapDoc): void {
  const ids = Object.keys(doc.nodes);
  if (ids.length > MAX_NODES) throw new DocError(`A map can have at most ${MAX_NODES} nodes.`);
  if (!doc.nodes[doc.root]) throw new DocError('The root node is missing.');

  const parentOf = new Map<string, string>();
  for (const [id, node] of Object.entries(doc.nodes)) {
    for (const child of node.children) {
      if (!doc.nodes[child]) throw new DocError('A node points to a child that does not exist.');
      if (child === doc.root || parentOf.has(child)) throw new DocError('A node cannot have two parents.');
      parentOf.set(child, id);
    }
    if (node.link?.kind === 'grammar' && !KNOWN_POINTS.has(node.link.id)) throw new DocError('A node links to an unknown grammar point.');
  }

  // Walk from the root: every node must be reached exactly once, within the depth limit
  const seen = new Set<string>();
  const stack: { id: string; depth: number }[] = [{ id: doc.root, depth: 1 }];
  while (stack.length > 0) {
    const { id, depth } = stack.pop()!;
    if (seen.has(id)) throw new DocError('The map contains a cycle.');
    if (depth > MAX_DEPTH) throw new DocError(`A map can be at most ${MAX_DEPTH} levels deep.`);
    seen.add(id);
    for (const child of doc.nodes[id].children) stack.push({ id: child, depth: depth + 1 });
  }
  if (seen.size !== ids.length) throw new DocError('Some nodes are not connected to the root.');
}

/**
 * Word ids a document links to, to check that they exist
 */
export const wordLinks = (doc: MapDoc): string[] => [...new Set(Object.values(doc.nodes).flatMap((n) => (n.link?.kind === 'word' ? [n.link.id] : [])))];

export const newId = (): string => Math.random().toString(36).slice(2, 10);

/**
 * A map with just its root
 */
export function blankDoc(title: string): MapDoc {
  return { root: 'root', nodes: { root: { text: title.slice(0, 200), children: [] } } };
}

/**
 * A starting map from one grammar topic: the topic as the root and its points as linked children
 */
export function clusterDoc(clusterId: string, locale: 'en' | 'vi'): { title: string; doc: MapDoc } | null {
  const cluster = GRAMMAR_CLUSTERS.find((c) => c.id === clusterId);
  if (!cluster) return null;
  const nodes: MapDoc['nodes'] = {};
  const children: string[] = [];
  GRAMMAR_POINTS.filter((p) => p.cluster === cluster.id).forEach((point, i) => {
    const id = `p${i + 1}`;
    nodes[id] = { text: point.title[locale], children: [], link: { kind: 'grammar', id: point.id } };
    children.push(id);
  });
  nodes.root = { text: cluster.title[locale], children };
  return { title: cluster.title[locale], doc: { root: 'root', nodes } };
}

export type TemplateKind = 'compare' | 'outline';

const TEMPLATES: Record<TemplateKind, Record<'en' | 'vi', { title: string; branches: { text: string; children: string[] }[] }>> = {
  compare: {
    en: {
      title: 'A or B?',
      branches: [
        { text: 'Forms', children: ['A', 'B'] },
        { text: 'When to use', children: ['A', 'B'] },
        { text: 'Examples', children: ['A', 'B'] },
        { text: 'Signal words', children: ['A', 'B'] },
        { text: 'Common mistakes', children: [] },
      ],
    },
    vi: {
      title: 'A hay B?',
      branches: [
        { text: 'Cấu trúc', children: ['A', 'B'] },
        { text: 'Khi nào dùng', children: ['A', 'B'] },
        { text: 'Ví dụ', children: ['A', 'B'] },
        { text: 'Dấu hiệu nhận biết', children: ['A', 'B'] },
        { text: 'Lỗi hay gặp', children: [] },
      ],
    },
  },
  outline: {
    en: {
      title: 'Study notes',
      branches: [
        { text: 'Rules', children: [] },
        { text: 'Examples', children: [] },
        { text: 'Common mistakes', children: [] },
        { text: 'To practise', children: [] },
      ],
    },
    vi: {
      title: 'Ghi chú học tập',
      branches: [
        { text: 'Quy tắc', children: [] },
        { text: 'Ví dụ', children: [] },
        { text: 'Lỗi hay gặp', children: [] },
        { text: 'Cần luyện thêm', children: [] },
      ],
    },
  },
};

/**
 * A starter skeleton (compare two things, or general study notes) in the learner's language
 */
export function templateDoc(kind: TemplateKind, locale: 'en' | 'vi'): { title: string; doc: MapDoc } {
  const template = TEMPLATES[kind][locale];
  const nodes: MapDoc['nodes'] = {};
  const rootChildren = template.branches.map((branch, i) => {
    const id = `b${i + 1}`;
    nodes[id] = { text: branch.text, children: branch.children.map((_, j) => `${id}c${j + 1}`) };
    branch.children.forEach((text, j) => (nodes[`${id}c${j + 1}`] = { text, children: [] }));
    return id;
  });
  nodes.root = { text: template.title, children: rootChildren };
  return { title: template.title, doc: { root: 'root', nodes } };
}
