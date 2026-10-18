/**
 * ProposalDialog
 * Shown when the AI has drafted a map. Above the buttons: the map's name (editable, with its own "Update name"
 * button). Then three choices: Confirm, Review first (see the draft with what changed, then confirm) and Cancel
 * (everything, including a new name, is discarded). Nothing is saved until Confirm.
 */
import type React from 'react';
import { useMemo, useState } from 'react';
import { Badge, Button, Modal, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import type { MapDraft } from '@/shared/mapsApi';
import { MapCanvas } from './MapCanvas';
import { layoutMap } from './mapLayout';
import { toneMap } from './doc';
import type { MapActions } from './mapActions';

const NO_ACTIONS: MapActions = { commitText: () => undefined, cancelEdit: () => undefined, toggle: () => undefined };
const noop = () => undefined;

interface Props {
  draft: MapDraft;
  busy: boolean;
  onRename: (title: string) => Promise<void>;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

/** The draft drawn read-only, with what is new or changed outlined */
const Preview: React.FC<{ draft: MapDraft }> = ({ draft }) => {
  const layout = useMemo(() => layoutMap(draft.doc), [draft.doc]);
  const tones = useMemo(() => toneMap(draft.doc), [draft.doc]);
  const marks = useMemo(() => new Map(draft.changes.filter((c) => c.type === 'added' || c.type === 'changed' || c.type === 'moved').map((c) => [c.id, c.type === 'added' ? ('added' as const) : ('changed' as const)])), [draft.changes]);
  // A new map has nothing to compare with, so nothing is outlined
  const shown = draft.kind === 'update' ? marks : undefined;
  return (
    <div className="proposal__preview">
      <MapCanvas doc={draft.doc} layout={layout} tones={tones} selected="" editing={null} actions={NO_ACTIONS} fitKey={draft.id} anchor={null} focusRequest={null} label={draft.title} marks={shown} onSelect={noop} onEdit={noop} />
    </div>
  );
};

export const ProposalDialog: React.FC<Props> = ({ draft, busy, onRename, onConfirm, onCancel }) => {
  const { t } = useI18n();
  const p = t.maps.ai.proposal;
  const [name, setName] = useState(draft.title);
  const [reviewing, setReviewing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const clean = name.trim();
  const isUpdate = draft.kind === 'update';

  const rename = async () => {
    setRenaming(true);
    try {
      await onRename(clean);
    } finally {
      setRenaming(false);
    }
  };

  const removed = draft.changes.filter((c) => c.type === 'removed');
  const edited = draft.changes.filter((c) => c.type !== 'removed');

  return (
    <Modal
      open
      size={reviewing ? 'lg' : 'md'}
      title={isUpdate ? p.updateTitle : p.createTitle}
      onClose={onCancel}
      closeLabel={t.common.close}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {p.cancel}
          </Button>
          {reviewing ? (
            <Button variant="secondary" onClick={() => setReviewing(false)} disabled={busy}>
              {p.back}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setReviewing(true)} disabled={busy}>
              {p.review}
            </Button>
          )}
          <Button onClick={() => onConfirm(clean)} loading={busy} disabled={!clean}>
            {p.confirm}
          </Button>
        </>
      }
    >
      <div className="proposal">
        <div className="proposal__name">
          <label htmlFor="proposal-name">{p.nameLabel}</label>
          <div className="proposal__name-row">
            <TextInput id="proposal-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            <Button variant="secondary" size="sm" onClick={() => void rename()} loading={renaming} disabled={!clean || clean === draft.title}>
              {p.updateName}
            </Button>
          </div>
        </div>

        {draft.summary && <p className="proposal__summary">{draft.summary}</p>}
        <p className="grammar__hint">{isUpdate ? p.counts(draft.nodeCount, draft.counts.added, draft.counts.changed + draft.counts.moved, draft.counts.removed) : p.newMapCounts(draft.nodeCount)}</p>

        {reviewing && (
          <>
            <Preview draft={draft} />
            {isUpdate && <p className="grammar__hint">{p.previewHint}</p>}
            {isUpdate && draft.changes.length === 0 && <p>{p.noChanges}</p>}
            {isUpdate && draft.changes.length > 0 && (
              <ul className="proposal__changes">
                {[...edited, ...removed].map((change) => (
                  <li key={`${change.type}:${change.id}`}>
                    <Badge tone={change.type === 'added' ? 'success' : change.type === 'removed' ? 'danger' : 'warning'}>{p.changes[change.type]}</Badge>
                    <span className={change.type === 'removed' ? 'proposal__gone' : ''}>{change.text}</span>
                    {change.from && <small>{p.was(change.from)}</small>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
