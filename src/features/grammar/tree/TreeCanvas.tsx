/**
 * TreeCanvas
 * React Flow set up for large static trees: no dragging or connecting, only the nodes in view are mounted, and the
 * viewport lives in React Flow's own store (panning and zooming never re-render our components).
 * Shared by the grammar tree, the prerequisite tree and, later, personal mind maps.
 */
import type React from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeMouseHandler, type NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './tree.css';

export interface FocusRequest {
  id: string;
  /** Only move the view when the node is outside it */
  onlyIfHidden?: boolean;
  /** Changes on every request, so asking for the same node twice works */
  nonce: number;
}

interface Props {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  /** The view fits the whole tree when this changes (a new tree), not when nodes expand or collapse */
  fitKey: string;
  /**
   * A node that must stay where the user sees it when the layout changes (the one they just expanded):
   * `from` is its flow position before the change, and the viewport is shifted by how far it moved
   */
  anchor?: { id: string; from: { x: number; y: number }; nonce: number } | null;
  /** Nodes to bring into view after they appear (a just-opened group and its children) */
  reveal?: { ids: string[]; nonce: number } | null;
  focusRequest?: FocusRequest | null;
  onNodeClick?: NodeMouseHandler;
  onNodeDoubleClick?: NodeMouseHandler;
  onPaneClick?: () => void;
  className?: string;
  label: string;
}

const Inner: React.FC<Props> = ({ nodes, edges, nodeTypes, fitKey, anchor, reveal, focusRequest, onNodeClick, onNodeDoubleClick, onPaneClick, className, label }) => {
  const flow = useReactFlow();
  const nodesRef = useRef(nodes);
  // Declared first: the effects below read the current nodes
  useLayoutEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Fit once per tree, after the nodes exist
  useEffect(() => {
    const id = requestAnimationFrame(() => void flow.fitView({ padding: 0.12, maxZoom: 1, minZoom: 0.35 }));
    return () => cancelAnimationFrame(id);
  }, [fitKey, flow]);

  // Keep the toggled node under the pointer: shift the viewport by the node's movement
  const handled = useRef(0);
  useLayoutEffect(() => {
    if (!anchor || handled.current === anchor.nonce) return;
    const node = nodesRef.current.find((n) => n.id === anchor.id);
    if (!node) return;
    handled.current = anchor.nonce;
    const view = flow.getViewport();
    const dx = (anchor.from.x - node.position.x) * view.zoom;
    const dy = (anchor.from.y - node.position.y) * view.zoom;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) void flow.setViewport({ x: view.x + dx, y: view.y + dy, zoom: view.zoom });
  }, [anchor, nodes, flow]);

  // Bring a freshly opened group and its children into view (after the new nodes are in React Flow's store)
  useEffect(() => {
    if (!reveal) return;
    const timer = window.setTimeout(() => void flow.fitView({ nodes: reveal.ids.map((id) => ({ id })), padding: 0.12, maxZoom: 1, minZoom: 0.45, duration: 300 }), 30);
    return () => window.clearTimeout(timer);
  }, [reveal, flow]);

  useEffect(() => {
    if (!focusRequest) return;
    const node = nodesRef.current.find((n) => n.id === focusRequest.id);
    if (!node) return;
    const width = node.width ?? 160;
    const height = node.height ?? 40;
    if (focusRequest.onlyIfHidden) {
      const view = flow.getViewport();
      const box = document.querySelector('.tree-canvas')?.getBoundingClientRect();
      const left = node.position.x * view.zoom + view.x;
      const top = node.position.y * view.zoom + view.y;
      if (box && left >= 0 && top >= 0 && left + width * view.zoom <= box.width && top + height * view.zoom <= box.height) return;
    }
    void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: Math.max(flow.getZoom(), 0.9), duration: 350 });
  }, [focusRequest, flow]);

  return (
    <ReactFlow
      className={`tree-canvas ${className ?? ''}`}
      aria-label={label}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      selectNodesOnDrag={false}
      zoomOnDoubleClick={false}
      onlyRenderVisibleElements
      minZoom={0.25}
      maxZoom={1.6}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onPaneClick={onPaneClick}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={28} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
};

export const TreeCanvas: React.FC<Props> = (props) => (
  <ReactFlowProvider>
    <Inner {...props} />
  </ReactFlowProvider>
);
