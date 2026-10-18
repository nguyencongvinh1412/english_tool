/**
 * MapCanvas
 * The mind map as a tree on TreeCanvas. Selecting or renaming a node creates new objects for those nodes only,
 * so React Flow and the other nodes do nothing; the layout comes from the parent and only changes with the document.
 */
import type React from 'react';
import { memo, useContext, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { Icon } from '@/design';
import { isImeComposing } from '@/shared/ime';
import { TreeCanvas, type FocusRequest } from '@/features/grammar/tree/TreeCanvas';
import { descendantCount, type MapDoc, type NodeColor } from './doc';
import { MapActionsContext, type MapActions } from './mapActions';
import { NODE_H, NODE_W, type MapLayout } from './mapLayout';

interface NodeData extends Record<string, unknown> {
  id: string;
  text: string;
  tone: NodeColor;
  isRoot: boolean;
  link?: 'grammar' | 'word';
  hasNote: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  hidden: number;
  selected?: boolean;
  editing?: boolean;
  /** In a proposal preview: new or changed compared with the saved map */
  mark?: 'added' | 'changed';
}

const EditInput: React.FC<{ id: string; initial: string }> = ({ id, initial }) => {
  const actions = useContext(MapActionsContext)!;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (isImeComposing(event)) return;
    if (event.key === 'Enter') actions.commitText(id, event.currentTarget.value);
    else if (event.key === 'Tab') {
      event.preventDefault();
      actions.commitText(id, event.currentTarget.value, 'child');
    } else if (event.key === 'Escape') actions.cancelEdit();
  };
  return <input ref={ref} className="mnode__input nodrag nopan" defaultValue={initial} maxLength={200} onKeyDown={onKeyDown} onBlur={(e) => actions.commitText(id, e.currentTarget.value)} aria-label={initial} />;
};

const MapNodeView = memo(({ data }: NodeProps<Node<NodeData>>) => {
  const actions = useContext(MapActionsContext)!;
  return (
    <div className={`mnode mnode--${data.tone} ${data.isRoot ? 'is-root' : ''} ${data.selected ? 'is-selected' : ''} ${data.mark ? `is-${data.mark}` : ''}`} data-node-id={data.id} title={data.text}>
      <Handle type="target" position={Position.Left} className="tree-handle" isConnectable={false} />
      {data.editing ? (
        <EditInput id={data.id} initial={data.text} />
      ) : (
        <>
          {data.link && <Icon name={data.link === 'grammar' ? 'graph' : 'book'} size={14} />}
          <span className="mnode__text">{data.text}</span>
          {data.hasNote && <span className="mnode__dot" aria-hidden="true" />}
        </>
      )}
      {data.hasChildren && (
        <button
          type="button"
          className="mnode__toggle nodrag nopan"
          aria-label={data.collapsed ? `+${data.hidden}` : '−'}
          aria-expanded={!data.collapsed}
          onClick={(event) => {
            event.stopPropagation();
            actions.toggle(data.id);
          }}
        >
          {data.collapsed ? `+${data.hidden}` : '−'}
        </button>
      )}
      <Handle type="source" position={Position.Right} className="tree-handle" isConnectable={false} />
    </div>
  );
});
MapNodeView.displayName = 'MapNodeView';

const NODE_TYPES = { map: MapNodeView };

interface Props {
  doc: MapDoc;
  layout: MapLayout;
  tones: Map<string, NodeColor>;
  selected: string;
  editing: string | null;
  actions: MapActions;
  fitKey: string;
  anchor: { id: string; from: { x: number; y: number }; nonce: number } | null;
  focusRequest: FocusRequest | null;
  label: string;
  marks?: Map<string, 'added' | 'changed'>;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
}

export const MapCanvas: React.FC<Props> = ({ doc, layout, tones, selected, editing, actions, fitKey, anchor, focusRequest, label, marks, onSelect, onEdit }) => {
  const baseNodes = useMemo<Node[]>(
    () =>
      [...layout.positions].map(([id, position]) => {
        const node = doc.nodes[id];
        return {
          id,
          type: 'map',
          position,
          width: NODE_W,
          height: NODE_H,
          data: {
            id,
            text: node.text,
            tone: tones.get(id) ?? 'brand',
            isRoot: id === doc.root,
            link: node.link?.kind,
            hasNote: Boolean(node.note),
            hasChildren: node.children.length > 0,
            collapsed: Boolean(node.collapsed),
            hidden: node.collapsed ? descendantCount(doc, id) : 0,
            mark: marks?.get(id),
          } satisfies NodeData,
        };
      }),
    [doc, layout, tones, marks]
  );

  // Only the selected and the edited node get new objects
  const nodes = useMemo<Node[]>(() => baseNodes.map((node) => (node.id === selected || node.id === editing ? { ...node, data: { ...node.data, selected: node.id === selected, editing: node.id === editing } } : node)), [baseNodes, selected, editing]);

  const edges = useMemo<Edge[]>(() => layout.links.map((link) => ({ id: `${link.from}>${link.to}`, source: link.from, target: link.to, className: `mmap-edge mmap-edge--${tones.get(link.to) ?? 'brand'}` })), [layout, tones]);

  return (
    <MapActionsContext.Provider value={actions}>
      <TreeCanvas
        className="mmap-flow"
        label={label}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitKey={fitKey}
        anchor={anchor}
        focusRequest={focusRequest}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDoubleClick={(_, node) => onEdit(node.id)}
      />
    </MapActionsContext.Provider>
  );
};
