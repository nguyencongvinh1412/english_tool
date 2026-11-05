/**
 * What differs between an earlier version of a map and the current one, in words a learner can read
 */
import type { MapDoc } from './doc.js';

export interface MapChange {
  kind: 'added' | 'removed' | 'renamed';
  /** The node's text now (added, renamed) or then (removed) */
  text: string;
  /** For a rename: the text in the earlier version */
  was?: string;
}

/**
 * Changes that took the earlier version to the current one: nodes added, removed, and renamed (matched by id)
 */
export function diffDocs(earlier: MapDoc, current: MapDoc): MapChange[] {
  const changes: MapChange[] = [];
  for (const [id, node] of Object.entries(current.nodes)) {
    const before = earlier.nodes[id];
    if (!before) changes.push({ kind: 'added', text: node.text });
    else if (before.text !== node.text) changes.push({ kind: 'renamed', text: node.text, was: before.text });
  }
  for (const [id, node] of Object.entries(earlier.nodes)) if (!current.nodes[id]) changes.push({ kind: 'removed', text: node.text });
  return changes;
}
