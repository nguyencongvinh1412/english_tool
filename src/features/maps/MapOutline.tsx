/**
 * MapOutline
 * The same map as an indented list: the accessible view, and the easier one to edit on a phone
 */
import type React from 'react';
import { useContext, useEffect, useRef } from 'react';
import { Icon } from '@/design';
import { isImeComposing } from '@/shared/ime';
import { descendantCount, type MapDoc, type NodeColor } from './doc';
import { MapActionsContext } from './mapActions';

const OutlineEdit: React.FC<{ id: string; initial: string }> = ({ id, initial }) => {
  const actions = useContext(MapActionsContext)!;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="moutline__input"
      defaultValue={initial}
      maxLength={200}
      aria-label={initial}
      onBlur={(e) => actions.commitText(id, e.currentTarget.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (isImeComposing(event)) return;
        if (event.key === 'Enter') actions.commitText(id, event.currentTarget.value);
        else if (event.key === 'Tab') {
          event.preventDefault();
          actions.commitText(id, event.currentTarget.value, 'child');
        } else if (event.key === 'Escape') actions.cancelEdit();
      }}
    />
  );
};

interface Props {
  doc: MapDoc;
  tones: Map<string, NodeColor>;
  selected: string;
  editing: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
}

export const MapOutline: React.FC<Props> = ({ doc, tones, selected, editing, onSelect, onEdit }) => {
  const actions = useContext(MapActionsContext)!;

  const renderNode = (id: string, depth: number): React.ReactNode => {
    const node = doc.nodes[id];
    const open = !node.collapsed;
    return (
      <li key={id} role="treeitem" aria-expanded={node.children.length > 0 ? open : undefined} aria-selected={id === selected}>
        <div className={`moutline__row mnode--${tones.get(id)} ${id === selected ? 'is-selected' : ''}`} style={{ paddingLeft: `${depth * 1.25}rem` }}>
          {node.children.length > 0 ? (
            <button type="button" className="moutline__toggle" onClick={() => actions.toggle(id)} aria-label={open ? '−' : `+${descendantCount(doc, id)}`}>
              <span className={`moutline__chevron ${open ? 'is-open' : ''}`} />
            </button>
          ) : (
            <span className="moutline__toggle" />
          )}
          <span className="moutline__dot" />
          {editing === id ? (
            <OutlineEdit id={id} initial={node.text} />
          ) : (
            <button type="button" className="moutline__text" onClick={() => onSelect(id)} onDoubleClick={() => onEdit(id)}>
              {node.link && <Icon name={node.link.kind === 'grammar' ? 'graph' : 'book'} size={14} />}
              {node.text}
              {node.collapsed && <small> +{descendantCount(doc, id)}</small>}
            </button>
          )}
        </div>
        {open && node.children.length > 0 && <ul role="group">{node.children.map((child) => renderNode(child, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <ul className="moutline" role="tree">
      {renderNode(doc.root, 0)}
    </ul>
  );
};
