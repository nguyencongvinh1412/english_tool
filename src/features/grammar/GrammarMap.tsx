/**
 * GrammarMap
 * Interactive map of English grammar: clusters laid out in a grid with their points. Hovering a point
 * shows what to learn first (solid arrows), what it is confused with (red dashes) and what goes with it
 * (dots); clicking opens the point.
 */
import type React from 'react';
import { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useI18n } from '@/i18n/I18nProvider';
import { grammarPath, type GrammarMap as MapData, type GrammarMapPoint, type Mastery } from '@/shared/grammarApi';

const TONES = ['listening', 'reading', 'speaking', 'writing', 'exam', 'brand'];
const COLUMNS = 4;
const NODE_W = 170;
const NODE_H = 54;
const GAP = 12;
const CLUSTER_W = NODE_W * 2 + GAP;
const CLUSTER_GAP_X = 70;
const CLUSTER_GAP_Y = 60;
const HEADER_H = 46;

/** How a point relates to the hovered one */
type Relation = 'before' | 'next' | 'contrast' | 'related';
type PointData = { point: GrammarMapPoint; title: string; tone: string; dim: boolean; focus: boolean; relation?: Relation; relationLabel?: string; mastery?: Mastery };
type ClusterData = { title: string; tone: string };

const PointNode = memo(({ data }: NodeProps<Node<PointData>>) => (
  <div
    className={`gmap-point ${data.dim ? 'gmap-point--dim' : ''} ${data.focus ? 'gmap-point--focus' : ''} ${data.point.ready ? '' : 'gmap-point--empty'} ${data.relation ? `gmap-point--${data.relation}` : ''}`}
    data-relation={data.relationLabel}
    style={{ ['--tone' as string]: `var(--${data.tone})`, ['--tone-soft' as string]: `var(--${data.tone}-soft, var(--surface-2))` }}
  >
    <Handle type="target" position={Position.Top} className="gmap-handle" isConnectable={false} />
    <span className="gmap-point__title">
      {data.mastery && data.mastery !== 'none' && <span className={`mastery-dot mastery-dot--${data.mastery}`} />}
      {data.title}
    </span>
    <span className="gmap-point__cefr">{data.point.cefr}</span>
    <Handle type="source" position={Position.Bottom} className="gmap-handle" isConnectable={false} />
  </div>
));
PointNode.displayName = 'PointNode';

const ClusterNode = memo(({ data }: NodeProps<Node<ClusterData>>) => (
  <div className="gmap-cluster" style={{ ['--tone' as string]: `var(--${data.tone})` }}>
    {data.title}
  </div>
));
ClusterNode.displayName = 'ClusterNode';

const NODE_TYPES = { point: PointNode, cluster: ClusterNode };

/**
 * Grid positions: clusters in rows of four, two columns of points under each heading
 */
function layout(data: MapData) {
  const positions = new Map<string, { x: number; y: number }>();
  const heights = data.clusters.map((c) => HEADER_H + Math.ceil(data.points.filter((p) => p.cluster === c.id).length / 2) * (NODE_H + GAP));
  let y = 0;
  for (let row = 0; row * COLUMNS < data.clusters.length; row++) {
    const inRow = data.clusters.slice(row * COLUMNS, row * COLUMNS + COLUMNS);
    inRow.forEach((cluster, col) => {
      const x = col * (CLUSTER_W + CLUSTER_GAP_X);
      positions.set(`cluster:${cluster.id}`, { x, y });
      data.points
        .filter((p) => p.cluster === cluster.id)
        .forEach((point, i) => positions.set(point.id, { x: x + (i % 2) * (NODE_W + GAP), y: y + HEADER_H + Math.floor(i / 2) * (NODE_H + GAP) }));
    });
    y += Math.max(...inRow.map((c) => heights[data.clusters.indexOf(c)])) + CLUSTER_GAP_Y;
  }
  return positions;
}

export const GrammarMap: React.FC<{ data: MapData; mastery: Map<string, Mastery> }> = ({ data, mastery }) => {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [focus, setFocus] = useState<string | null>(null);

  const positions = useMemo(() => layout(data), [data]);
  const toneOf = useMemo(() => new Map(data.clusters.map((c, i) => [c.id, TONES[i % TONES.length]])), [data]);
  const clusterOf = useMemo(() => new Map(data.points.map((p) => [p.id, p.cluster])), [data]);

  // Points linked to the hovered one, and how
  const relations = useMemo(() => {
    if (!focus) return null;
    const map = new Map<string, Relation[]>();
    const add = (id: string, relation: Relation) => map.set(id, [...(map.get(id) ?? []), relation]);
    for (const e of data.edges) {
      if (e.from !== focus && e.to !== focus) continue;
      const other = e.from === focus ? e.to : e.from;
      add(other, e.kind === 'builds' ? (e.to === focus ? 'before' : 'next') : e.kind === 'contrast' ? 'contrast' : 'related');
    }
    // A confusable point is the most important thing to show
    for (const list of map.values()) list.sort((a, b) => Number(b === 'contrast') - Number(a === 'contrast'));
    return map;
  }, [focus, data]);
  const relationLabels: Record<Relation, string> = { before: t.grammar.legend.builds, next: t.grammar.links.leadsTo, contrast: t.grammar.legend.contrast, related: t.grammar.legend.related };

  const nodes = useMemo<Node[]>(
    () => [
      ...data.clusters.map((cluster) => ({
        id: `cluster:${cluster.id}`,
        type: 'cluster',
        position: positions.get(`cluster:${cluster.id}`)!,
        data: { title: cluster.title[locale], tone: toneOf.get(cluster.id)! },
        draggable: false,
        selectable: false,
        style: { width: CLUSTER_W },
      })),
      ...data.points.map((point) => ({
        id: point.id,
        type: 'point',
        position: positions.get(point.id)!,
        data: {
          point,
          title: point.title[locale],
          tone: toneOf.get(point.cluster)!,
          dim: Boolean(relations && focus !== point.id && !relations.has(point.id)),
          focus: focus === point.id,
          mastery: mastery.get(point.id),
          relation: relations?.get(point.id)?.[0],
          relationLabel: relations?.get(point.id)?.map((r) => relationLabels[r]).join(' · '),
        },
        draggable: false,
        style: { width: NODE_W, height: NODE_H },
      })),
    ],
    // relationLabels follows the locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, positions, toneOf, locale, relations, focus, mastery]
  );

  const edges = useMemo<Edge[]>(
    () =>
      focus
        ? data.edges
            .filter((e) => (e.from === focus || e.to === focus) && clusterOf.get(e.from) !== clusterOf.get(e.to))
            .map((e) => ({
              id: `${e.kind}:${e.from}:${e.to}`,
              source: e.from,
              target: e.to,
              className: `gmap-edge gmap-edge--${e.kind}`,
              // Above the boxes: links inside a cluster run behind the points between them
              zIndex: 1000,
              animated: e.kind === 'contrast',
              ...(e.kind === 'builds' && { markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 } }),
            }))
        : [],
    [data, focus, clusterOf]
  );

  return (
    <div className="gmap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        // Readable size on open, starting with the tenses; drag and zoom for the rest
        defaultViewport={{ x: 24, y: 24, zoom: 0.85 }}
        minZoom={0.2}
        maxZoom={1.6}
        nodesConnectable={false}
        onNodeMouseEnter={(_, node) => node.type === 'point' && setFocus(node.id)}
        onNodeMouseLeave={() => setFocus(null)}
        onNodeClick={(_, node) => node.type === 'point' && navigate(grammarPath(node.id))}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};
