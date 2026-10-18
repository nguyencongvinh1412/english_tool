/**
 * GrammarTree
 * The grammar map as a tree: English grammar -> clusters (collapsed at first) -> points. Cross-links (what to learn
 * first, what it is confused with, what goes with it) are not part of the tree: the point under the pointer is
 * described in a side panel and its linked points are tagged on the map. A second view lays out the prerequisites
 * of one point as a tree around it.
 *
 * Performance: hovering changes only the few nodes that are linked to the hovered point (the others keep the same
 * object, so React skips them); the layout is recomputed only when clusters expand or collapse; the viewport is never
 * in React state.
 */
import type React from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Handle, MarkerType, Position, type Edge, type Node, type NodeMouseHandler, type NodeProps } from '@xyflow/react';
import { Badge, Button, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { comparePath, grammarPath, type GrammarMap as MapData, type GrammarMapPoint, type Mastery } from '@/shared/grammarApi';
import { TreeCanvas, type FocusRequest } from './TreeCanvas';
import { buildMapTree, buildPrerequisiteTree, buildRelations, clusterNodeId, pointOfNode, ROOT_ID, sideOf, TONES, type Relation, type Tone } from './treeData';
import { layoutTree } from './layout';

const NODE_H = 40;
const WIDTHS = [190, 220, 210];
const COL_GAP = 56;
const ROW_H = 52;
const PREREQ_LAYOUT = { widths: [230, 210], colGap: COL_GAP, rowHeight: ROW_H };

type PointData = { pointId: string; label: string; cefr: string; tone: Tone; ready: boolean; mastery?: Mastery; center?: boolean; relation?: Relation; relationLabel?: string; focus?: boolean };
type ClusterData = { label: string; tone: Tone; count: number; open: boolean; hint: number };
type RootData = { label: string };

const Handles = () => (
  <>
    <Handle type="target" position={Position.Left} className="tree-handle" isConnectable={false} />
    <Handle type="source" position={Position.Right} className="tree-handle" isConnectable={false} />
  </>
);

const RootNode = memo(({ data }: NodeProps<Node<RootData>>) => (
  <div className="gtree-root">
    {data.label}
    <Handles />
  </div>
));
RootNode.displayName = 'RootNode';

const ClusterNode = memo(({ data }: NodeProps<Node<ClusterData>>) => (
  <div className={`gtree-cluster gtree-tone--${data.tone} ${data.open ? 'is-open' : ''}`} role="button" aria-expanded={data.open}>
    <span className="gtree-cluster__chevron" aria-hidden="true" />
    <span className="gtree-cluster__title">{data.label}</span>
    {data.hint > 0 && <span className="gtree-cluster__hint" title={String(data.hint)}>{data.hint}</span>}
    <span className="gtree-cluster__count">{data.count}</span>
    <Handles />
  </div>
));
ClusterNode.displayName = 'ClusterNode';

const PointNode = memo(({ data }: NodeProps<Node<PointData>>) => (
  <div
    className={`gtree-point gtree-tone--${data.tone} ${data.ready ? '' : 'is-empty'} ${data.center ? 'is-center' : ''} ${data.focus ? 'is-focus' : ''} ${data.relation ? `is-rel is-rel--${data.relation}` : ''}`}
    data-point-id={data.pointId}
    data-relation={data.relationLabel}
  >
    <span className="gtree-point__title">
      {data.mastery && data.mastery !== 'none' && <span className={`mastery-dot mastery-dot--${data.mastery}`} />}
      {data.label}
    </span>
    <span className="gtree-point__cefr">{data.cefr}</span>
    <Handles />
  </div>
));
PointNode.displayName = 'PointNode';

const NODE_TYPES = { root: RootNode, cluster: ClusterNode, point: PointNode };

type Mode = { kind: 'tree' } | { kind: 'prereq'; pointId: string };

/** Hover moves faster than the eye: wait a moment before highlighting */
const HOVER_DELAY_MS = 80;

const RelationGroup: React.FC<{ title: string; ids: string[]; points: Map<string, GrammarMapPoint>; from: string; compare?: boolean; onLocate: (id: string) => void }> = ({ title, ids, points, from, compare, onLocate }) => {
  const { t, locale } = useI18n();
  if (ids.length === 0) return null;
  return (
    <div className="gtree-panel__group">
      <h3>{title}</h3>
      <ul>
        {ids.map((id) => {
          const other = points.get(id);
          if (!other) return null;
          return (
            <li key={id}>
              <Link to={grammarPath(id)}>{other.title[locale]}</Link>
              <Badge tone="reading">{other.cefr}</Badge>
              {compare && (
                <Link to={comparePath(from, id)} className="gtree-panel__compare">
                  {t.grammar.compareDetail}
                </Link>
              )}
              <button type="button" className="gtree-panel__locate" onClick={() => onLocate(id)} aria-label={`${t.grammar.tree.locate}: ${other.title[locale]}`} title={t.grammar.tree.locate}>
                <Icon name="target" size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const GrammarTree: React.FC<{ data: MapData; mastery: Map<string, Mastery> }> = ({ data, mastery }) => {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>({ kind: 'tree' });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [active, setActive] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ id: string; from: { x: number; y: number }; nonce: number } | null>(null);
  const [reveal, setReveal] = useState<{ ids: string[]; nonce: number } | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [fitSeq, setFitSeq] = useState(0);
  const seq = useRef(0);
  const hoverTimer = useRef<number | undefined>(undefined);

  const tree = useMemo(() => buildMapTree(data), [data]);
  const relations = useMemo(() => buildRelations(data), [data]);
  const points = useMemo(() => new Map(data.points.map((p) => [p.id, p])), [data]);
  const toneOf = useMemo(() => new Map(data.clusters.map((c, i) => [c.id, TONES[i % TONES.length]])), [data]);
  const relationLabels: Record<Relation, string> = { before: t.grammar.links.builds, next: t.grammar.links.leadsTo, contrast: t.grammar.links.contrasts, related: t.grammar.links.related };

  const layout = useMemo(() => layoutTree(tree, { widths: WIDTHS, colGap: COL_GAP, rowHeight: ROW_H, expanded }), [tree, expanded]);

  const baseNodes = useMemo<Node[]>(() => {
    const clusterById = new Map(data.clusters.map((c) => [clusterNodeId(c.id), c]));
    return layout.nodes.map((placed): Node => {
      const position = { x: placed.x, y: placed.y };
      if (placed.id === ROOT_ID) return { id: placed.id, type: 'root', position, width: WIDTHS[0], height: NODE_H, data: { label: t.grammar.tree.root } satisfies RootData };
      const cluster = clusterById.get(placed.id);
      if (cluster) {
        const count = data.points.filter((p) => p.cluster === cluster.id).length;
        return { id: placed.id, type: 'cluster', position, width: WIDTHS[1], height: NODE_H, data: { label: cluster.title[locale], tone: toneOf.get(cluster.id)!, count, open: placed.expanded, hint: 0 } satisfies ClusterData };
      }
      const point = points.get(placed.id)!;
      return {
        id: placed.id,
        type: 'point',
        position,
        width: WIDTHS[2],
        height: NODE_H,
        data: { pointId: point.id, label: point.title[locale], cefr: point.cefr, tone: toneOf.get(point.cluster)!, ready: point.ready, mastery: mastery.get(point.id) } satisfies PointData,
      };
    });
  }, [layout, data, points, toneOf, locale, mastery, t]);

  // Hover highlight: only linked nodes get new objects; everything else keeps its identity
  const treeNodes = useMemo<Node[]>(() => {
    const links = active ? relations.get(active) : undefined;
    if (!active) return baseNodes;
    const visible = new Set(baseNodes.map((n) => n.id));
    const hidden = new Map<string, number>();
    for (const id of links?.keys() ?? []) {
      if (visible.has(id)) continue;
      const cluster = points.get(id)?.cluster;
      if (cluster) hidden.set(clusterNodeId(cluster), (hidden.get(clusterNodeId(cluster)) ?? 0) + 1);
    }
    return baseNodes.map((node) => {
      if (node.type === 'point') {
        const own = node.id === active;
        const list = links?.get(node.id);
        if (!own && !list) return node;
        return { ...node, data: { ...node.data, focus: own, relation: list?.[0], relationLabel: list?.map((r) => relationLabels[r]).join(' · ') } };
      }
      const count = hidden.get(node.id);
      return count ? { ...node, data: { ...node.data, hint: count } } : node;
    });
    // relationLabels follows the locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseNodes, active, relations, points, locale]);

  const treeEdges = useMemo<Edge[]>(
    () =>
      layout.links.map((link) => {
        const clusterId = link.from === ROOT_ID ? link.to : link.from.startsWith('cluster:') ? link.from : null;
        const tone = clusterId ? toneOf.get(clusterId.slice('cluster:'.length)) : undefined;
        return { id: `${link.from}>${link.to}`, source: link.from, target: link.to, className: `gtree-edge ${tone ? `gtree-tone--${tone}` : ''}` };
      }),
    [layout, toneOf]
  );

  // Prerequisite view
  const prereq = useMemo(() => (mode.kind === 'prereq' ? buildPrerequisiteTree(data, mode.pointId, PREREQ_LAYOUT) : null), [mode, data]);
  const prereqNodes = useMemo<Node[]>(() => {
    if (!prereq || mode.kind !== 'prereq') return [];
    return prereq.nodes.map((placed) => {
      const point = points.get(pointOfNode(placed.id))!;
      const center = sideOf(placed.id) === 'center';
      return {
        id: placed.id,
        type: 'point',
        position: { x: placed.x, y: placed.y },
        width: PREREQ_LAYOUT.widths[center ? 0 : 1],
        height: NODE_H,
        data: { pointId: point.id, label: point.title[locale], cefr: point.cefr, tone: toneOf.get(point.cluster)!, ready: point.ready, mastery: mastery.get(point.id), center } satisfies PointData,
      } satisfies Node;
    });
  }, [prereq, mode, points, toneOf, locale, mastery]);
  const prereqEdges = useMemo<Edge[]>(
    () =>
      (prereq?.links ?? []).map((link) => ({
        id: `${link.from}>${link.to}`,
        source: link.from,
        target: link.to,
        className: `gtree-edge gtree-edge--${link.side}`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#7d8590' },
      })),
    [prereq]
  );

  const toggle = useCallback(
    (id: string) => {
      const opening = !expanded.has(id);
      if (opening) {
        // Show the group with its children
        const children = tree.children?.find((c) => c.id === id)?.children ?? [];
        setReveal({ ids: [id, ...children.map((c) => c.id)], nonce: ++seq.current });
        setAnchor(null);
      } else {
        // Closing: keep the group where the pointer is
        const node = baseNodes.find((n) => n.id === id);
        if (node) setAnchor({ id, from: { ...node.position }, nonce: ++seq.current });
        setReveal(null);
      }
      setExpanded((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    },
    [baseNodes, expanded, tree]
  );

  const locate = useCallback(
    (pointId: string) => {
      const cluster = points.get(pointId)?.cluster;
      if (cluster) setExpanded((prev) => (prev.has(clusterNodeId(cluster)) ? prev : new Set(prev).add(clusterNodeId(cluster))));
      setFocusRequest({ id: pointId, nonce: ++seq.current });
    },
    [points]
  );

  const touchOnly = () => window.matchMedia?.('(hover: none)').matches ?? false;
  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      if (node.type === 'cluster') return toggle(node.id);
      if (node.type !== 'point') return;
      const pointId = pointOfNode(node.id);
      // Touch screens have no hover: the first tap shows the panel, the panel opens the point
      if (touchOnly() && mode.kind === 'tree') setActive(pointId);
      else navigate(grammarPath(pointId));
    },
    [toggle, navigate, mode.kind]
  );

  const onPointerOver = (event: React.PointerEvent) => {
    if (mode.kind !== 'tree') return;
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-point-id]')?.dataset.pointId;
    if (!id) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setActive((current) => (current === id ? current : id)), HOVER_DELAY_MS);
  };
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const expandAll = () => {
    setExpanded(new Set(data.clusters.map((c) => clusterNodeId(c.id))));
    setAnchor(null);
    setReveal(null);
    setFitSeq((n) => n + 1);
  };
  const collapseAll = () => {
    setExpanded(new Set());
    setAnchor(null);
    setReveal(null);
    setFitSeq((n) => n + 1);
  };

  const activePoint = active ? points.get(active) : undefined;
  const links = active ? relations.get(active) : undefined;
  const idsOf = (relation: Relation) => [...(links ?? [])].filter(([, list]) => list.includes(relation)).map(([id]) => id);
  const inPrereq = mode.kind === 'prereq';
  const prereqTitle = mode.kind === 'prereq' ? points.get(mode.pointId)?.title[locale] : '';

  return (
    <div className="gtree-wrap">
      <div className="gtree-toolbar">
        {inPrereq ? (
          <>
            <Button size="sm" variant="secondary" icon="graph" onClick={() => setMode({ kind: 'tree' })}>
              {t.grammar.tree.back}
            </Button>
            <strong>{t.grammar.tree.prereqTitle(prereqTitle ?? '')}</strong>
            {prereq && prereq.nodes.length === 1 && <span className="grammar__hint">{t.grammar.tree.prereqEmpty}</span>}
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" icon="plus" onClick={expandAll}>
              {t.grammar.tree.expandAll}
            </Button>
            <Button size="sm" variant="secondary" icon="x" onClick={collapseAll}>
              {t.grammar.tree.collapseAll}
            </Button>
            <span className="grammar__hint">{t.grammar.mapHint}</span>
          </>
        )}
      </div>

      <div className="gtree-body">
        <div className="gtree" onPointerOver={onPointerOver}>
          <TreeCanvas
            className="gtree-flow"
            label={t.grammar.title}
            nodes={inPrereq ? prereqNodes : treeNodes}
            edges={inPrereq ? prereqEdges : treeEdges}
            nodeTypes={NODE_TYPES}
            fitKey={inPrereq ? `prereq:${mode.pointId}` : `tree:${fitSeq}`}
            anchor={inPrereq ? null : anchor}
            reveal={inPrereq ? null : reveal}
            focusRequest={focusRequest}
            onNodeClick={onNodeClick}
          />
        </div>

        {!inPrereq && (
          <aside className="gtree-panel" aria-live="polite">
            {activePoint ? (
              <>
                <h2>{activePoint.title[locale]}</h2>
                <p className="gtree-panel__meta">
                  <Badge tone="reading">{activePoint.cefr}</Badge>
                  {!activePoint.ready && <span className="grammar__hint">{t.grammar.notReady}</span>}
                </p>
                {activePoint.summary && <p className="gtree-panel__summary">{activePoint.summary[locale]}</p>}
                <div className="gtree-panel__actions">
                  <Link to={grammarPath(activePoint.id)} className="btn btn--primary btn--sm">
                    {t.grammar.tree.open}
                  </Link>
                  <Button size="sm" variant="secondary" icon="graph" onClick={() => setMode({ kind: 'prereq', pointId: activePoint.id })}>
                    {t.grammar.tree.prereqButton}
                  </Button>
                </div>
                <RelationGroup title={t.grammar.links.builds} ids={idsOf('before')} points={points} from={activePoint.id} onLocate={locate} />
                <RelationGroup title={t.grammar.links.leadsTo} ids={idsOf('next')} points={points} from={activePoint.id} onLocate={locate} />
                <RelationGroup title={t.grammar.links.contrasts} ids={idsOf('contrast')} points={points} from={activePoint.id} compare onLocate={locate} />
                <RelationGroup title={t.grammar.links.related} ids={idsOf('related')} points={points} from={activePoint.id} onLocate={locate} />
                {links === undefined && <p className="grammar__hint">{t.grammar.tree.noLinks}</p>}
              </>
            ) : (
              <p className="grammar__hint">{t.grammar.tree.panelHint}</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
