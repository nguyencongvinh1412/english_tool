/**
 * AI check of a learner's mind map
 * Two passes: the first lists possible problems (wrong or misleading statements, a node linked to the wrong
 * grammar point, important gaps), checked against the app's own reference cards for the linked points; the second
 * is a stricter reviewer that keeps only what is really wrong. Issue targets and suggested links are validated here.
 */
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { grammarPoints, type User } from '../db/schema.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import type { GrammarContent } from '../grammar/content.js';
import type { MapDoc } from './doc.js';

export const MAX_ISSUES = 12;
const REFERENCE_POINTS = 20;

const short = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

export const checkSchema = z.object({
  issues: z
    .array(
      z.object({
        nodeId: z.string().max(24),
        kind: z.enum(['wrong', 'unclear', 'link', 'missing']),
        severity: z.enum(['error', 'warning', 'tip']).default('warning'),
        problem: short(500).refine((s) => s.length > 0, 'problem is empty'),
        suggestion: short(500).default(''),
        fix: z.object({ text: short(200).optional(), note: short(1000).optional(), grammar: z.string().max(80).optional() }).optional(),
      })
    )
    .max(40)
    .default([]),
});

export const verdictSchema = z.object({ verdicts: z.array(z.object({ index: z.number().int().min(0), keep: z.boolean(), reason: short(300).optional() })).max(60) });

export interface MapIssue {
  id: string;
  nodeId: string;
  /** The node's text when it was checked, so a fix is not applied to something the learner has since rewritten */
  nodeText: string;
  kind: 'wrong' | 'unclear' | 'link' | 'missing';
  severity: 'error' | 'warning' | 'tip';
  problem: string;
  suggestion: string;
  fix?: { text?: string; note?: string; link?: { kind: 'grammar'; id: string } };
}

const KNOWN = new Set(GRAMMAR_POINTS.map((p) => p.id));

/**
 * The app's reference cards for the grammar points the map links to, as short text
 */
export async function referenceFor(doc: MapDoc): Promise<string> {
  const ids = [...new Set(Object.values(doc.nodes).flatMap((n) => (n.link?.kind === 'grammar' ? [n.link.id] : [])))].slice(0, REFERENCE_POINTS);
  if (ids.length === 0) return 'No reference cards: the map links to no grammar points.';
  const rows = await db.select().from(grammarPoints).where(inArray(grammarPoints.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r.content as GrammarContent]));
  return ids
    .map((id) => {
      const meta = GRAMMAR_POINTS.find((p) => p.id === id);
      const card = byId.get(id);
      if (!card) return `[${id}] ${meta?.title.en ?? id}: (no reference card)`;
      const forms = card.forms.slice(0, 4).map((f) => `${f.label.en}: ${f.pattern} (e.g. ${f.example.en})`).join(' | ');
      const uses = card.uses.slice(0, 4).map((u) => u.title.en).join('; ');
      return `[${id}] ${meta?.title.en}: ${card.summary.en} Forms: ${forms}. Uses: ${uses}.`;
    })
    .join('\n');
}

export function checkPrompt(user: User): string {
  const language = user.studyLanguage === 'ja' ? 'Japanese' : 'English';
  const writing = user.uiLocale === 'vi' ? 'Vietnamese' : 'English';
  return `You review a Vietnamese learner's personal ${language} mind map for correctness and clarity. The map is a tree of short notes, some linked to grammar points.
Report only real problems, most important first, at most ${MAX_ISSUES}:
- "wrong": a statement, rule or example that is incorrect (check linked nodes against the reference cards, which are authoritative);
- "unclear": wording that would mislead a learner;
- "link": a node linked to the wrong grammar point (put the right id from the catalog in fix.grammar);
- "missing": an important related point or contrast that is absent (no fix needed).
Do not nitpick style or spelling of the learner's own words. If the map is fine, return {"issues": []}.
For each issue give the id of an EXISTING node ("nodeId"), "severity" (error | warning | tip), "problem" and "suggestion" in ${writing} (one or two sentences each), and "fix" only when there is one exact replacement: {"text": corrected node text, "note": corrected note, "grammar": grammar id}.
Respond with ONLY one JSON object: {"issues": [{"nodeId": "...", "kind": "wrong", "severity": "error", "problem": "...", "suggestion": "...", "fix": {"text": "..."}}]}`;
}

export function verifyPrompt(user: User): string {
  const writing = user.uiLocale === 'vi' ? 'Vietnamese' : 'English';
  return `You are a strict second reviewer of a grammar mind map check. For each reported issue decide whether the learner's node is really wrong, misleading, mislinked or missing something important, judged by the reference cards and standard grammar. Drop issues that are matters of taste, are already correct, or that you are not sure about.
Respond with ONLY one JSON object: {"verdicts": [{"index": 0, "keep": true, "reason": "short, in ${writing}"}]} with one verdict per issue, using the issue's index.`;
}

/**
 * The first pass's issues, limited to those that point at a real node and carry only valid fixes
 */
export function cleanIssues(raw: z.infer<typeof checkSchema>['issues'], doc: MapDoc): Omit<MapIssue, 'id'>[] {
  const issues: Omit<MapIssue, 'id'>[] = [];
  for (const issue of raw) {
    const node = doc.nodes[issue.nodeId];
    if (!node) continue;
    const link = issue.fix?.grammar && KNOWN.has(issue.fix.grammar) ? { kind: 'grammar' as const, id: issue.fix.grammar } : undefined;
    const text = issue.fix?.text && issue.fix.text !== node.text ? issue.fix.text : undefined;
    const note = issue.fix?.note !== undefined && issue.fix.note !== (node.note ?? '') ? issue.fix.note : undefined;
    const fix = text || note !== undefined || link ? { ...(text && { text }), ...(note !== undefined && { note }), ...(link && { link }) } : undefined;
    issues.push({ nodeId: issue.nodeId, nodeText: node.text, kind: issue.kind, severity: issue.severity, problem: issue.problem, suggestion: issue.suggestion, ...(fix && { fix }) });
  }
  return issues.slice(0, MAX_ISSUES);
}
