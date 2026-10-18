/**
 * NodePanel
 * Edit the selected node: text, note, colour and the lesson it links to, plus structure buttons
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { grammarPath } from '@/shared/grammarApi';
import { mapsApi, type LookupResult } from '@/shared/mapsApi';
import { useGrammarTitles } from '@/features/grammar/useGrammarTitles';
import { NODE_COLORS, type MapNode, type NodeColor, type NodeLink } from './doc';

interface Props {
  id: string;
  node: MapNode;
  isRoot: boolean;
  canMove: { up: boolean; down: boolean; indent: boolean; outdent: boolean };
  onChange: (changes: Partial<MapNode>) => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onRemove: () => void;
  onMove: (kind: 'up' | 'down' | 'indent' | 'outdent') => void;
  onToggle: () => void;
}

/**
 * Searches grammar points and words, and links the node to the one picked
 */
const LinkPicker: React.FC<{ onPick: (link: NodeLink, text: string) => void }> = ({ onPick }) => {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const p = t.maps.editor.panel;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      mapsApi
        .lookup(q)
        .then((r) => active && setResult(r))
        .catch(() => active && setResult({ grammar: [], words: [] }));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const shown = query.trim().length >= 2 ? result : null;
  return (
    <div className="mpanel__picker">
      <input type="search" className="input" placeholder={p.linkSearch} aria-label={p.linkSearch} value={query} onChange={(e) => setQuery(e.target.value)} />
      {shown && shown.grammar.length === 0 && shown.words.length === 0 && <p className="grammar__hint">{p.noResults}</p>}
      {shown && (
        <ul className="mpanel__results">
          {shown.grammar.map((g) => (
            <li key={`g:${g.id}`}>
              <button type="button" onClick={() => onPick({ kind: 'grammar', id: g.id }, g.title[locale])}>
                <Icon name="graph" size={14} /> {g.title[locale]} <Badge tone="reading">{g.cefr}</Badge>
              </button>
            </li>
          ))}
          {shown.words.map((w) => (
            <li key={`w:${w.id}`}>
              <button type="button" onClick={() => onPick({ kind: 'word', id: w.id }, w.term)}>
                <Icon name="book" size={14} /> {w.term} {w.meaning && <small>{w.meaning}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const NodePanel: React.FC<Props> = ({ id, node, isRoot, canMove, onChange, onAddChild, onAddSibling, onRemove, onMove, onToggle }) => {
  const { t, locale } = useI18n();
  const titles = useGrammarTitles();
  const e = t.maps.editor;
  const p = e.panel;
  // Text and note are committed when the field loses focus, so one edit is one undo step
  const [text, setText] = useState(node.text);
  const [note, setNote] = useState(node.note ?? '');
  const [prev, setPrev] = useState({ id, text: node.text, note: node.note });
  if (prev.id !== id || prev.text !== node.text || prev.note !== node.note) {
    setPrev({ id, text: node.text, note: node.note });
    setText(node.text);
    setNote(node.note ?? '');
  }

  const linkLabel = node.link ? (node.link.kind === 'grammar' ? (titles.get(node.link.id)?.[locale] ?? node.link.id) : node.link.id.replace(/^[a-z]+:/, '')) : null;

  return (
    <aside className="mpanel" aria-label={p.text}>
      <label className="mpanel__field">
        <span>{p.text}</span>
        <input className="input" value={text} maxLength={200} onChange={(ev) => setText(ev.target.value)} onBlur={() => text.trim() && text.trim() !== node.text && onChange({ text: text.trim() })} onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()} />
      </label>

      <label className="mpanel__field">
        <span>{p.note}</span>
        <textarea className="input" rows={3} maxLength={1000} value={note} placeholder={p.notePlaceholder} onChange={(ev) => setNote(ev.target.value)} onBlur={() => note !== (node.note ?? '') && onChange({ note: note.trim() === '' ? undefined : note })} />
      </label>

      <div className="mpanel__field">
        <span>{p.color}</span>
        <div className="mpanel__colors" role="radiogroup" aria-label={p.color}>
          <button type="button" role="radio" aria-checked={!node.color} className={`mpanel__swatch mpanel__swatch--auto ${!node.color ? 'is-on' : ''}`} onClick={() => onChange({ color: undefined })}>
            {p.colorAuto}
          </button>
          {NODE_COLORS.map((color: NodeColor) => (
            <button key={color} type="button" role="radio" aria-checked={node.color === color} aria-label={p.colors[color]} title={p.colors[color]} className={`mpanel__swatch mnode--${color} ${node.color === color ? 'is-on' : ''}`} onClick={() => onChange({ color })} />
          ))}
        </div>
      </div>

      <div className="mpanel__field">
        <span>{p.link}</span>
        {node.link ? (
          <div className="mpanel__link">
            <Icon name={node.link.kind === 'grammar' ? 'graph' : 'book'} size={16} />
            <strong>{linkLabel}</strong>
            <small>{node.link.kind === 'grammar' ? p.linkGrammar : p.linkWord}</small>
            {node.link.kind === 'grammar' && (
              <Link to={grammarPath(node.link.id)} className="mpanel__open">
                {p.openLink}
              </Link>
            )}
            {node.link.kind === 'word' && (
              <Link to={ROUTES.VOCABULARY} className="mpanel__open">
                {p.openLink}
              </Link>
            )}
            <button type="button" className="mpanel__remove" onClick={() => onChange({ link: undefined })}>
              {p.removeLink}
            </button>
          </div>
        ) : (
          <>
            <small className="grammar__hint">{p.linkNone}</small>
            <LinkPicker onPick={(link, label) => onChange({ link, ...(node.text === t.maps.editor.newNode ? { text: label } : {}) })} />
          </>
        )}
      </div>

      <div className="mpanel__actions">
        <Button size="sm" variant="secondary" icon="plus" onClick={onAddChild}>
          {e.addChild}
        </Button>
        {!isRoot && (
          <Button size="sm" variant="secondary" icon="plus" onClick={onAddSibling}>
            {e.addSibling}
          </Button>
        )}
        {node.children.length > 0 && (
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {node.collapsed ? e.expand : e.collapse}
          </Button>
        )}
      </div>
      {!isRoot && (
        <div className="mpanel__actions">
          <Button size="sm" variant="ghost" disabled={!canMove.up} onClick={() => onMove('up')}>
            ↑ {e.moveUp}
          </Button>
          <Button size="sm" variant="ghost" disabled={!canMove.down} onClick={() => onMove('down')}>
            ↓ {e.moveDown}
          </Button>
          <Button size="sm" variant="ghost" disabled={!canMove.indent} onClick={() => onMove('indent')}>
            → {e.indent}
          </Button>
          <Button size="sm" variant="ghost" disabled={!canMove.outdent} onClick={() => onMove('outdent')}>
            ← {e.outdent}
          </Button>
          <Button size="sm" variant="ghost" icon="trash" onClick={onRemove}>
            {e.remove}
          </Button>
        </div>
      )}
      <p className="grammar__hint">{p.shortcuts}</p>
    </aside>
  );
};
