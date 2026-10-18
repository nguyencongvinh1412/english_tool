/**
 * useMapProposal
 * Runs the whole "the AI drafts a map" flow: ask, show the dialog, then rename, confirm or cancel the draft.
 * Returns the dialog to render and a `propose` function to call.
 */
import { useCallback, useState } from 'react';
import { useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ApiRequestError, errorMessage } from '@/shared/http';
import { mapsApi, type MapDraft, type MindMap, type ProposeBody } from '@/shared/mapsApi';
import { ProposalDialog } from './ProposalDialog';

export interface Confirmed {
  map: MindMap;
  /** Set when an existing map was replaced: the version that can be restored to undo it */
  previousVersion: number | null;
}

export function useMapProposal(onConfirmed: (result: Confirmed) => void) {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<MapDraft | null>(null);
  const [asking, setAsking] = useState(false);
  const [applying, setApplying] = useState(false);

  const propose = useCallback(
    async (body: ProposeBody) => {
      setAsking(true);
      try {
        setDraft(await mapsApi.propose(body));
      } catch (error) {
        toast(errorMessage(error, t), 'danger');
      } finally {
        setAsking(false);
      }
    },
    [t, toast]
  );

  const confirm = async (title: string) => {
    if (!draft) return;
    setApplying(true);
    try {
      const result = await mapsApi.confirmDraft(draft.id, title);
      setDraft(null);
      onConfirmed(result);
    } catch (error) {
      toast(errorMessage(error, t), 'danger');
      // A proposal made from an older version of the map cannot be applied any more
      if (error instanceof ApiRequestError && (error.code === 'draft_stale' || error.status === 404)) setDraft(null);
    } finally {
      setApplying(false);
    }
  };

  const cancel = () => {
    const current = draft;
    setDraft(null);
    // Discarding the draft discards its new name too
    if (current) void mapsApi.cancelDraft(current.id).catch(() => undefined);
  };

  const rename = async (title: string) => {
    if (!draft) return;
    try {
      setDraft(await mapsApi.renameDraft(draft.id, title));
      toast(t.maps.ai.proposal.nameUpdated, 'success');
    } catch (error) {
      toast(errorMessage(error, t), 'danger');
    }
  };

  const dialog = draft ? <ProposalDialog key={draft.id} draft={draft} busy={applying} onRename={rename} onConfirm={(title) => void confirm(title)} onCancel={cancel} /> : null;
  return { propose, dialog, asking };
}
