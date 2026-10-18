/**
 * Layout of a mind map document: positions of the visible nodes and the links between them.
 * Computed when the document changes, never while the viewport moves.
 */
import { layoutTree, type TreeSource } from '@/features/grammar/tree/layout';
import type { MapDoc } from './doc';

export const NODE_W = 200;
export const NODE_H = 40;
const COL_GAP = 56;
const ROW_H = 50;

export interface MapLayout {
  positions: Map<string, { x: number; y: number }>;
  links: { from: string; to: string }[];
  /** Depth of each visible node (the root is 0) */
  depths: Map<string, number>;
}

const toTree = (doc: MapDoc, id: string): TreeSource => ({ id, children: doc.nodes[id].children.map((child) => toTree(doc, child)) });

export function layoutMap(doc: MapDoc): MapLayout {
  const expanded = new Set(Object.entries(doc.nodes).filter(([, node]) => !node.collapsed).map(([id]) => id));
  const { nodes, links } = layoutTree(toTree(doc, doc.root), { widths: [NODE_W], colGap: COL_GAP, rowHeight: ROW_H, expanded });
  return { positions: new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }])), links, depths: new Map(nodes.map((n) => [n.id, n.depth])) };
}
