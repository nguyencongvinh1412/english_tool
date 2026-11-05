import { describe, expect, it } from 'vitest';
import { diffDocs } from './diff.js';
import type { MapDoc } from './doc.js';

const doc = (nodes: Record<string, string>): MapDoc => ({ root: 'r', nodes: Object.fromEntries(Object.entries(nodes).map(([id, text]) => [id, { text, children: [] }])) });

describe('diffDocs', () => {
  it('lists added, removed and renamed nodes', () => {
    const earlier = doc({ r: 'Tenses', a: 'Past', b: 'Basic tenses' });
    const current = doc({ r: 'Tenses', b: 'Tenses basics', c: 'Perfect' });
    expect(diffDocs(earlier, current)).toEqual([
      { kind: 'renamed', text: 'Tenses basics', was: 'Basic tenses' },
      { kind: 'added', text: 'Perfect' },
      { kind: 'removed', text: 'Past' },
    ]);
  });

  it('is empty for the same map', () => {
    expect(diffDocs(doc({ r: 'A' }), doc({ r: 'A' }))).toEqual([]);
  });
});
