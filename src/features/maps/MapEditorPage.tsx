/**
 * MapEditorPage
 * Edit one mind map as a tree or an outline. Every change is a pure operation on the document (see doc.ts) kept in
 * an undo history and saved automatically a moment later, with a version check so another tab cannot be overwritten.
 */
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Banner, Button, Icon, Segmented, Spinner, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { ApiRequestError, errorMessage } from '@/shared/http';
import { mapsApi, type MindMap } from '@/shared/mapsApi';
import type { FocusRequest } from '@/features/grammar/tree/TreeCanvas';
import {
  MAX_DEPTH,
  MAX_NODES,
  addChild,
  addSibling,
  canAddChild,
  commit,
  indent,
  moveSibling,
  outdent,
  parentMap,
  redo,
  removeNode,
  setAllCollapsed,
  startHistory,
  subtreeIds,
  toMarkdown,
  toggleCollapsed,
  toneMap,
  undo,
  updateNode,
  visibleOrder,
  type History,
  type MapDoc,
  type MapNode,
} from './doc';
import { layoutMap } from './mapLayout';
import { MapActionsContext, type MapActions } from './mapActions';
import { MapCanvas } from './MapCanvas';
import { MapOutline } from './MapOutline';
import { useMapProposal } from './useMapProposal';
import { NodePanel } from './NodePanel';
import './maps.css';

type View = 'map' | 'outline';
type SaveState = 'saved' | 'saving' | 'dirty' | 'error' | 'conflict';

const SAVE_DELAY_MS = 800;
const RETRY_MS = 3000;
const WIDE = '(min-width: 900px)';
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

const Editor: React.FC<{ initial: MindMap; onReload: () => void; onAiUpdated: (previousVersion: number) => void }> = ({ initial, onReload, onAiUpdated }) => {
  const { t } = useI18n();
  const toast = useToast();
  const e = t.maps.editor;

  const [history, setHistory] = useState<History>(() => startHistory(initial.doc));
  const [title, setTitle] = useState(initial.title);
  const [selected, setSelected] = useState(initial.doc.root);
  const [editing, setEditing] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => (window.matchMedia?.(WIDE).matches ? 'map' : 'outline'));
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [anchor, setAnchor] = useState<{ id: string; from: { x: number; y: number }; nonce: number } | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState('');
  const seq = useRef(0);

  const doc = history.present;
  const layout = useMemo(() => layoutMap(doc), [doc]);
  const tones = useMemo(() => toneMap(doc), [doc]);
  const parents = useMemo(() => parentMap(doc), [doc]);

  // The selected node can disappear (undo, delete): fall back to the root
  const current = doc.nodes[selected] ? selected : doc.root;
  const node = doc.nodes[current];

  /* ---------- Saving ---------- */

  const latest = useRef({ doc, title });
  useEffect(() => {
    latest.current = { doc, title };
  });
  const sent = useRef({ doc: initial.doc, title: initial.title });
  const version = useRef(initial.version);
  const saving = useRef(false);
  const again = useRef(false);
  const conflict = useRef(false);

  const flush = useCallback(
    async (keepalive = false): Promise<void> => {
      if (conflict.current) return;
      if (saving.current) {
        again.current = true;
        return;
      }
      const { doc: nextDoc, title: nextTitle } = latest.current;
      const cleanTitle = nextTitle.trim() || sent.current.title;
      const body: { version: number; doc?: MapDoc; title?: string } = { version: version.current };
      if (nextDoc !== sent.current.doc) body.doc = nextDoc;
      if (cleanTitle !== sent.current.title) body.title = cleanTitle;
      if (!body.doc && body.title === undefined) {
        setSaveState('saved');
        return;
      }
      saving.current = true;
      setSaveState('saving');
      try {
        const result = await mapsApi.save(initial.id, body, keepalive);
        version.current = result.version;
        sent.current = { doc: body.doc ?? sent.current.doc, title: body.title ?? sent.current.title };
        setSaveState('saved');
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 409) {
          conflict.current = true;
          setSaveState('conflict');
        } else if (error instanceof ApiRequestError && error.status === 400) {
          // The server refused this document: tell the learner and stop retrying the same thing
          setSaveState('error');
          toast(errorMessage(error, t), 'danger');
        } else {
          setSaveState('error');
          window.setTimeout(() => void flush(), RETRY_MS);
        }
      } finally {
        saving.current = false;
        if (again.current) {
          again.current = false;
          void flush();
        }
      }
    },
    [initial.id, t, toast]
  );

  useEffect(() => {
    if (doc === sent.current.doc && title.trim() === sent.current.title) return;
    if (conflict.current) return;
    setSaveState((s) => (s === 'saving' ? s : 'dirty'));
    const timer = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [doc, title, flush]);

  // Save what is pending when the page closes or the learner leaves the editor
  useEffect(() => {
    const onHide = () => void flush(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      void flush(true);
    };
  }, [flush]);

  // The AI works from the saved map: save what is pending first, and leave the editor when its update is accepted
  const { propose, dialog, asking } = useMapProposal(({ previousVersion }) => {
    // The saved map now differs from what is open here, so drop any pending save of the old copy
    conflict.current = true;
    if (previousVersion !== null) onAiUpdated(previousVersion);
  });
  const askAi = async () => {
    await flush();
    if (conflict.current) return;
    await propose({ intent: 'update', mapId: initial.id, instruction: instruction.trim() || undefined });
  };

  /* ---------- Editing ---------- */

  const apply = useCallback(
    (next: MapDoc, anchorId: string, options: { select?: string; edit?: string | null } = {}) => {
      const from = layout.positions.get(anchorId);
      setHistory((h) => commit(h, next));
      if (from) setAnchor({ id: anchorId, from: { ...from }, nonce: ++seq.current });
      if (options.select) {
        setSelected(options.select);
        setFocusRequest({ id: options.select, onlyIfHidden: true, nonce: ++seq.current });
      }
      setEditing(options.edit ?? null);
    },
    [layout]
  );

  const addChildTo = (id: string) => {
    const result = addChild(doc, id, e.newNode);
    if (!result) {
      toast(doc.nodes && Object.keys(doc.nodes).length >= MAX_NODES ? e.limitNodes(MAX_NODES) : e.limitDepth(MAX_DEPTH), 'danger');
      return;
    }
    apply(result.doc, id, { select: result.id, edit: result.id });
  };

  const addSiblingOf = (id: string) => {
    const result = addSibling(doc, id, e.newNode);
    if (!result) {
      toast(e.limitNodes(MAX_NODES), 'danger');
      return;
    }
    apply(result.doc, id, { select: result.id, edit: result.id });
  };

  const remove = (id: string) => {
    const result = removeNode(doc, id);
    if (result) apply(result.doc, parents.get(id) ?? doc.root, { select: result.select });
  };

  const move = (id: string, kind: 'up' | 'down' | 'indent' | 'outdent') => {
    const next = kind === 'up' ? moveSibling(doc, id, -1) : kind === 'down' ? moveSibling(doc, id, 1) : kind === 'indent' ? indent(doc, id) : outdent(doc, id);
    if (next !== doc) apply(next, id, { select: id });
  };

  const toggle = (id: string) => {
    // A hidden selection moves to the node that was collapsed
    const hides = !doc.nodes[id].collapsed && subtreeIds(doc, id).includes(current) && current !== id;
    apply(toggleCollapsed(doc, id), id, { select: hides ? id : undefined });
  };

  const change = (id: string, changes: Partial<MapNode>) => apply(updateNode(doc, id, changes), id);

  // Stable for the nodes: they read the latest handlers through a ref
  const handlers = useRef<Pick<MapActions, 'commitText' | 'toggle'>>({ commitText: () => undefined, toggle: () => undefined });
  useEffect(() => {
    handlers.current = {
      commitText: (id, text, then) => {
        const clean = text.trim();
        setEditing(null);
        const next = clean && clean !== doc.nodes[id]?.text ? updateNode(doc, id, { text: clean }) : doc;
        if (then === 'child') {
          const result = addChild(next, id, e.newNode);
          if (result) return apply(result.doc, id, { select: result.id, edit: result.id });
        }
        if (next !== doc) apply(next, id, { select: id });
      },
      toggle,
    };
  });
  const actions = useMemo<MapActions>(() => ({ commitText: (id, text, then) => handlers.current.commitText(id, text, then), cancelEdit: () => setEditing(null), toggle: (id) => handlers.current.toggle(id) }), []);

  const select = useCallback((id: string) => {
    setSelected(id);
    setEditing(null);
  }, []);

  /* ---------- Keyboard ---------- */

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event.target) || event.defaultPrevented) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      setHistory(event.shiftKey ? redo : undo);
      return;
    }
    if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      setHistory(redo);
      return;
    }
    const isRoot = current === doc.root;
    if (event.altKey && event.key.startsWith('Arrow')) {
      event.preventDefault();
      move(current, event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowRight' ? 'indent' : 'outdent');
      return;
    }
    const order = visibleOrder(doc);
    const index = order.indexOf(current);
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        addSiblingOf(current);
        break;
      case 'Tab':
        event.preventDefault();
        addChildTo(current);
        break;
      case 'Delete':
      case 'Backspace':
        if (!isRoot) {
          event.preventDefault();
          remove(current);
        }
        break;
      case 'F2':
        event.preventDefault();
        setEditing(current);
        break;
      case 'ArrowUp':
        event.preventDefault();
        select(order[Math.max(0, index - 1)]);
        break;
      case 'ArrowDown':
        event.preventDefault();
        select(order[Math.min(order.length - 1, index + 1)]);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (node.children.length > 0 && !node.collapsed && !isRoot) toggle(current);
        else if (parents.get(current)) select(parents.get(current)!);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (node.collapsed) toggle(current);
        else if (node.children.length > 0) select(node.children[0]);
        break;
    }
  };

  // Listen on the document: after an edit ends the focused input disappears and focus falls back to the page
  const keyHandler = useRef(onKeyDown);
  useEffect(() => {
    keyHandler.current = onKeyDown;
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  /* ---------- Export ---------- */

  const markdown = () => toMarkdown({ ...doc, nodes: { ...doc.nodes, [doc.root]: { ...doc.nodes[doc.root], text: title.trim() || doc.nodes[doc.root].text } } });
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(title.trim() || 'mind-map').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'mind-map'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast(t.errors.generic, 'danger');
    }
  };

  const siblings = parents.get(current) ? doc.nodes[parents.get(current)!].children : [];
  const canMove = {
    up: siblings.indexOf(current) > 0,
    down: siblings.length > 0 && siblings.indexOf(current) < siblings.length - 1,
    indent: indent(doc, current) !== doc,
    outdent: outdent(doc, current) !== doc,
  };

  return (
    <div className="mmap">
      <div className="mmap-head">
        <Link to={ROUTES.MAPS} className="mmap-head__back">
          ← {e.back}
        </Link>
        <input className="input mmap-head__title" value={title} maxLength={100} aria-label={e.mapTitle} onChange={(ev) => setTitle(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()} />
        <span className={`mmap-head__state mmap-head__state--${saveState}`} role="status">
          {saveState === 'conflict' ? '' : saveState === 'error' ? e.save.error : e.save[saveState]}
        </span>
      </div>

      {saveState === 'conflict' && (
        <Banner tone="warning">
          <strong>{e.conflictTitle}</strong> {e.conflictBody}{' '}
          <Button size="sm" variant="secondary" onClick={onReload}>
            {e.reload}
          </Button>
        </Banner>
      )}

      <div className="mmap-toolbar">
        <Segmented<View>
          label={e.view}
          value={view}
          onChange={setView}
          options={[
            { value: 'map', label: e.views.map, tone: 'reading' },
            { value: 'outline', label: e.views.outline, tone: 'reading' },
          ]}
        />
        <Button size="sm" variant="secondary" disabled={history.past.length === 0} onClick={() => setHistory(undo)}>
          ↶ {e.undo}
        </Button>
        <Button size="sm" variant="secondary" disabled={history.future.length === 0} onClick={() => setHistory(redo)}>
          ↷ {e.redo}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => apply(setAllCollapsed(doc, false), current)}>
          {e.expandAll}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => apply(setAllCollapsed(doc, true), doc.root, { select: doc.root })}>
          {e.collapseAll}
        </Button>
        <Button size="sm" variant="ghost" icon="file" onClick={download}>
          {e.download}
        </Button>
        <Button size="sm" variant="ghost" icon="copy" onClick={() => void copy()}>
          {copied ? e.copied : e.copy}
        </Button>
      </div>

      <details className="mmap-ai">
        <summary>
          <Icon name="sparkles" size={16} /> {t.maps.ai.update}
        </summary>
        <div className="maps-ai__row">
          <input className="input" value={instruction} maxLength={400} placeholder={t.maps.ai.updateHint} aria-label={t.maps.ai.updateHint} onChange={(ev) => setInstruction(ev.target.value)} />
          <Button variant="secondary" icon="sparkles" loading={asking} onClick={() => void askAi()}>
            {t.maps.ai.update}
          </Button>
        </div>
        {asking && <p className="grammar__hint">{t.maps.ai.working}</p>}
      </details>
      {dialog}

      <div className="mmap-body">
        <div className="mmap-stage">
          {view === 'map' ? (
            <MapCanvas
              doc={doc}
              layout={layout}
              tones={tones}
              selected={current}
              editing={editing}
              actions={actions}
              fitKey={initial.id}
              anchor={anchor}
              focusRequest={focusRequest}
              label={title}
              onSelect={select}
              onEdit={setEditing}
            />
          ) : (
            <MapActionsContext.Provider value={actions}>
              <MapOutline doc={doc} tones={tones} selected={current} editing={editing} onSelect={select} onEdit={setEditing} />
            </MapActionsContext.Provider>
          )}
        </div>
        <NodePanel
          id={current}
          node={node}
          isRoot={current === doc.root}
          canMove={canMove}
          onChange={(changes) => change(current, changes)}
          onAddChild={() => addChildTo(current)}
          onAddSibling={() => addSiblingOf(current)}
          onRemove={() => remove(current)}
          onMove={(kind) => move(current, kind)}
          onToggle={() => toggle(current)}
        />
      </div>
      <p className="grammar__hint">{canAddChild(doc, current) ? '' : e.limitDepth(MAX_DEPTH)}</p>
    </div>
  );
};

export const MapEditorPage: React.FC = () => {
  const { t } = useI18n();
  const { mapId } = useParams();
  const [map, setMap] = useState<MindMap | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Changing the key remounts the editor with fresh data after a conflict
  const [generation, setGeneration] = useState(0);
  const toast = useToast();
  // After the AI updated this map, the version to restore to undo it
  const [undo, setUndo] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!mapId) return;
    mapsApi
      .get(mapId)
      .then((result) => {
        setMap(result.map);
        setGeneration((n) => n + 1);
      })
      .catch(setError);
  }, [mapId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error !== null) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!map) return <Spinner size={30} label={t.common.loading} />;
  const reload = () => {
    setMap(null);
    load();
  };
  const restore = async () => {
    if (undo === null) return;
    try {
      await mapsApi.restore(map.id, undo);
      setUndo(null);
      toast(t.maps.ai.restored, 'success');
      reload();
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    }
  };
  return (
    <>
      {undo !== null && (
        <Banner tone="success">
          {t.maps.ai.undoDone}{' '}
          <Button size="sm" variant="secondary" onClick={() => void restore()}>
            {t.maps.ai.undo}
          </Button>
        </Banner>
      )}
      <Editor
        key={`${map.id}:${generation}`}
        initial={map}
        onReload={reload}
        onAiUpdated={(previousVersion) => {
          setUndo(previousVersion);
          reload();
        }}
      />
    </>
  );
};
