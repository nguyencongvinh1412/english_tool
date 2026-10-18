/**
 * Builds the trees shown on the grammar page from the map data: the whole map (root, clusters, points) and the
 * prerequisite tree of one point, plus the cross-links (confusable, related, learn first) of every point.
 */
import type { GrammarMap } from '@/shared/grammarApi';
import { layoutTree, type PlacedNode, type TreeSource } from './layout';

export type Relation = 'before' | 'next' | 'contrast' | 'related';

export const ROOT_ID = 'root';
export const clusterNodeId = (clusterId: string) => `cluster:${clusterId}`;

/** Cluster colours, in cluster order */
export const TONES = ['listening', 'reading', 'speaking', 'writing', 'exam', 'brand'] as const;
export type Tone = (typeof TONES)[number];

/**
 * Root -> clusters -> points
 */
export function buildMapTree(data: GrammarMap): TreeSource {
  return {
    id: ROOT_ID,
    children: data.clusters.map((cluster) => ({
      id: clusterNodeId(cluster.id),
      children: data.points.filter((p) => p.cluster === cluster.id).map((p) => ({ id: p.id })),
    })),
  };
}

/**
 * For every point: the other points linked to it and how. A confusable point comes first, because it is the most
 * important thing to show.
 */
export function buildRelations(data: GrammarMap): Map<string, Map<string, Relation[]>> {
  const result = new Map<string, Map<string, Relation[]>>();
  const add = (from: string, to: string, relation: Relation) => {
    const links = result.get(from) ?? new Map<string, Relation[]>();
    links.set(to, [...(links.get(to) ?? []), relation]);
    result.set(from, links);
  };
  for (const edge of data.edges) {
    if (edge.kind === 'builds') {
      add(edge.to, edge.from, 'before');
      add(edge.from, edge.to, 'next');
    } else {
      const kind: Relation = edge.kind === 'contrast' ? 'contrast' : 'related';
      add(edge.from, edge.to, kind);
      add(edge.to, edge.from, kind);
    }
  }
  for (const links of result.values()) for (const list of links.values()) list.sort((a, b) => Number(b === 'contrast') - Number(a === 'contrast'));
  return result;
}

export const PREREQ_DEPTH = 3;
export const centerId = (pointId: string) => `C:${pointId}`;
/** Ids in the prerequisite tree carry their side, because a point can be on both */
export const sideOf = (nodeId: string): 'left' | 'right' | 'center' => (nodeId.startsWith('L:') ? 'left' : nodeId.startsWith('R:') ? 'right' : 'center');
export const pointOfNode = (nodeId: string): string => (/^[LRC]:/.test(nodeId) ? nodeId.slice(2) : nodeId);

/**
 * Breadth-first tree over "builds" links from a point; each point appears once, under its first parent
 */
function reach(start: string, prefix: 'L' | 'R', next: (id: string) => string[]): TreeSource[] {
  const seen = new Set<string>([start]);
  const grow = (id: string, depth: number): TreeSource[] => {
    if (depth >= PREREQ_DEPTH) return [];
    const fresh = next(id).filter((other) => !seen.has(other));
    fresh.forEach((other) => seen.add(other));
    return fresh.map((other) => ({ id: `${prefix}:${other}`, children: grow(other, depth + 1) }));
  };
  return grow(start, 0);
}

export interface PrerequisiteTree {
  nodes: PlacedNode[];
  links: { from: string; to: string; side: 'left' | 'right' }[];
}

/**
 * What to learn before a point (left) and what it leads to (right), laid out around the point
 */
export function buildPrerequisiteTree(data: GrammarMap, pointId: string, layout: { widths: number[]; colGap: number; rowHeight: number }): PrerequisiteTree {
  const before = (id: string) => data.edges.filter((e) => e.kind === 'builds' && e.to === id).map((e) => e.from);
  const after = (id: string) => data.edges.filter((e) => e.kind === 'builds' && e.from === id).map((e) => e.to);
  const root = centerId(pointId);
  const left = layoutTree({ id: root, children: reach(pointId, 'L', before) }, { ...layout, direction: -1, expandAll: true });
  const right = layoutTree({ id: root, children: reach(pointId, 'R', after) }, { ...layout, direction: 1, expandAll: true });

  // Both layouts centre the point on their own rows: line the two roots up
  const dy = right.nodes[0].y - left.nodes[0].y;
  const shifted = left.nodes.map((n) => ({ ...n, y: n.y + dy }));
  return {
    nodes: [...right.nodes, ...shifted.slice(1)],
    // Arrows point in learning order: from the prerequisite towards the point, and from the point onwards
    links: [...left.links.map((l) => ({ from: l.to, to: l.from, side: 'left' as const })), ...right.links.map((l) => ({ ...l, side: 'right' as const }))],
  };
}
