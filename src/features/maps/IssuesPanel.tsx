/**
 * IssuesPanel
 * What the AI check found in a map: each problem with a suggestion the learner can apply to that node (it goes
 * through the normal undoable edit), ignore, or leave for "ask the AI to fix all".
 */
import type React from 'react';
import { Badge, Button } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import type { MapIssue } from '@/shared/mapsApi';
import { useGrammarTitles } from '@/features/grammar/useGrammarTitles';
import type { MapDoc } from './doc';

interface Props {
  issues: MapIssue[];
  doc: MapDoc;
  busy: boolean;
  onLocate: (nodeId: string) => void;
  onApply: (issue: MapIssue) => void;
  onDismiss: (issue: MapIssue) => void;
  onFixAll: () => void;
}

const SEVERITY_TONE = { error: 'danger', warning: 'warning', tip: 'neutral' } as const;

export const IssuesPanel: React.FC<Props> = ({ issues, doc, busy, onLocate, onApply, onDismiss, onFixAll }) => {
  const { t, locale } = useI18n();
  const titles = useGrammarTitles();
  const c = t.maps.ai.check;

  if (issues.length === 0) return <p className="grammar__hint">{c.none}</p>;
  return (
    <div className="issues" aria-live="polite">
      <div className="issue__actions">
        <strong>{c.title(issues.length)}</strong>
        <Button size="sm" variant="secondary" icon="sparkles" loading={busy} onClick={onFixAll}>
          {c.fixAll}
        </Button>
      </div>
      <ul className="issues__list">
        {issues.map((issue) => {
          const node = doc.nodes[issue.nodeId];
          // The learner rewrote the node after the check: the suggestion no longer fits
          const outdated = !node || node.text !== issue.nodeText;
          return (
            <li key={issue.id} className="issue">
              <div className="issue__head">
                <Badge tone={SEVERITY_TONE[issue.severity]}>{c.kinds[issue.kind]}</Badge>
                {node ? (
                  <button type="button" className="issue__node" onClick={() => onLocate(issue.nodeId)} title={c.locate}>
                    {node.text}
                  </button>
                ) : (
                  <strong>{issue.nodeText}</strong>
                )}
              </div>
              <p>{issue.problem}</p>
              {issue.suggestion && <p className="issue__fix">{issue.suggestion}</p>}
              {issue.fix?.text && (
                <p className="issue__fix">
                  {c.becomes}: <strong>{issue.fix.text}</strong>
                </p>
              )}
              {issue.fix?.note !== undefined && (
                <p className="issue__fix">
                  {c.noteBecomes}: <strong>{issue.fix.note || '—'}</strong>
                </p>
              )}
              {issue.fix?.link && (node?.link?.id !== issue.fix.link.id || node.link.kind !== issue.fix.link.kind) && (
                <p className="issue__fix">
                  {c.linkTo}: <strong>{titles.get(issue.fix.link.id)?.[locale] ?? issue.fix.link.id}</strong>
                </p>
              )}
              {outdated && node && <p className="issue__fix">{c.outdated}</p>}
              <div className="issue__actions">
                {issue.fix && (
                  <Button size="sm" disabled={outdated} onClick={() => onApply(issue)}>
                    {c.apply}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onDismiss(issue)}>
                  {c.dismiss}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
