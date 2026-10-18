/**
 * AI proposals for mind maps
 * The AI is given what the learner has actually studied (and, for an update, the current map) and answers with a
 * nested tree. Everything it returns is checked and converted here: grammar ids must exist, words must be in the
 * dictionary, kept nodes keep their ids, the tree must be valid and within the limits. What changed is worked out by
 * comparing documents on the server, never taken from the AI's own claims.
 */
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { srsCards, vocabItems, wordBank, type User } from '../db/schema.js';
import { GRAMMAR_POINTS } from '../grammar/map.js';
import { recentMistakes } from '../grammar/mistakes.js';
import { grammarState } from '../progress/journey.js';
import { DocError, MAX_NODES, MAX_DEPTH, NODE_COLORS, checkDoc, newId, type MapDoc, type MapNode } from './doc.js';

/** Nodes a brand-new map may have; updates may grow a map up to MAX_NODES */
export const NEW_MAP_NODES = 70;

const short = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

export interface AiNode {
  id?: string;
  text: string;
  note?: string;
  grammar?: string;
  word?: string;
  color?: (typeof NODE_COLORS)[number];
  children: AiNode[];
}

const aiNode: z.ZodType<AiNode, unknown> = z.lazy(() =>
  z.object({
    id: z.string().max(24).optional(),
    text: short(200).refine((s) => s.length > 0, 'text is empty'),
    note: short(1000).optional(),
    grammar: z.string().max(80).optional(),
    word: z.string().max(60).optional(),
    color: z.enum(NODE_COLORS).optional(),
    children: z.array(aiNode).max(40).default([]),
  })
);

export const proposalSchema = z.object({
  title: short(100).refine((s) => s.length > 0, 'title is empty'),
  summary: short(400).default(''),
  root: aiNode,
});
export type Proposal = z.infer<typeof proposalSchema>;

export type Change = { type: 'added' | 'changed' | 'moved' | 'removed'; id: string; text: string; from?: string };

/* ---------- What the AI is told about the learner ---------- */

const MASTERY_TEXT: Record<string, string> = { none: 'not started', learning: 'learning', good: 'fairly solid', mastered: 'mastered' };
const WORDS_SHOWN = 40;

/**
 * The learner's own data, as prompt text
 */
export async function learnerContext(user: User): Promise<string> {
  const language = user.studyLanguage;
  const parts: string[] = [];

  if (language === 'en') {
    const state = await grammarState(user.id);
    const mistakes = await recentMistakes(user.id);
    parts.push(
      'Grammar catalog (id | title | CEFR | learner state). Link a node to a point only with an id from this list:',
      ...GRAMMAR_POINTS.map((p) => `${p.id} | ${p.title.en} | ${p.cefr} | ${MASTERY_TEXT[state.rows.get(p.id)?.mastery ?? 'none']}`)
    );
    if (mistakes.length > 0) parts.push('', 'Grammar points the learner got wrong recently: ' + mistakes.slice(0, 8).map((m) => `${m.pointId} (${m.count}x)`).join(', '));
  }

  const bank = await db
    .select({ term: vocabItems.term, meaning: vocabItems.meaningVi, meaningEn: vocabItems.meaningsEn })
    .from(wordBank)
    .innerJoin(vocabItems, eq(vocabItems.id, wordBank.itemId))
    .where(and(eq(wordBank.userId, user.id), eq(vocabItems.language, language)))
    .orderBy(desc(wordBank.createdAt))
    .limit(WORDS_SHOWN);
  const studied = await db
    .select({ term: vocabItems.term, meaning: vocabItems.meaningVi, meaningEn: vocabItems.meaningsEn })
    .from(srsCards)
    .innerJoin(vocabItems, eq(vocabItems.id, srsCards.itemId))
    .where(and(eq(srsCards.userId, user.id), eq(vocabItems.language, language)))
    .orderBy(desc(srsCards.intervalDays))
    .limit(WORDS_SHOWN);
  const words = [...new Map([...bank, ...studied].map((w) => [w.term, w])).values()].slice(0, WORDS_SHOWN);
  if (words.length > 0) parts.push('', 'Words the learner is studying (use one in "word" to link it): ' + words.map((w) => `${w.term}${w.meaning ?? w.meaningEn[0] ? ` (${w.meaning ?? w.meaningEn[0]})` : ''}`).join('; '));
  if (parts.length === 0) parts.push('The learner has not studied anything yet.');
  return parts.join('\n');
}

/**
 * The current map as the nested tree the AI reads and returns (existing ids included, so kept nodes stay the same)
 */
export function docToTree(doc: MapDoc, id = doc.root): AiNode {
  const node = doc.nodes[id];
  return {
    id,
    text: node.text,
    ...(node.note && { note: node.note }),
    ...(node.link?.kind === 'grammar' && { grammar: node.link.id }),
    ...(node.link?.kind === 'word' && { word: node.link.id.replace(/^[a-z]+:/, '') }),
    ...(node.color && { color: node.color }),
    children: node.children.map((child) => docToTree(doc, child)),
  };
}

export type Mode = 'learned' | 'topic' | 'update';

/**
 * System prompt: the job, the output format and the rules that keep the map useful and valid
 */
export function proposalPrompt(user: User, mode: Mode): string {
  const language = user.studyLanguage === 'ja' ? 'Japanese' : 'English';
  const writing = user.uiLocale === 'vi' ? 'Vietnamese' : 'English';
  const job =
    mode === 'update'
      ? 'Update the learner\'s existing mind map. Keep what is correct and what the learner wrote; add what the instruction or their recent study calls for; fix mistakes. Copy the "id" of every node you keep exactly; nodes you add have no "id". Remove a node only when the instruction asks for it or it is wrong.'
      : mode === 'topic'
        ? 'Create a new mind map about the topic the learner names.'
        : 'Create a new mind map that organises what the learner has actually studied (the data below), grouping related points and showing how they connect.';
  return `You build tree-shaped mind maps that help a Vietnamese learner of ${language} see how ideas fit together.
${job}

Respond with ONLY one JSON object:
{"title": "short map name", "summary": "one sentence on what you made or changed", "root": {"id"?: "...", "text": "...", "note"?: "...", "grammar"?: "grammar-point-id", "word"?: "headword", "color"?: "listening|reading|speaking|writing|exam|brand", "children": [ ...same shape... ]}}

Rules:
- Write node text and notes in ${writing}; keep ${language} example sentences and terms in ${language}.
- Node text is short (at most 6 words). A note is one tip or example, at most 140 characters, only where it helps.
- 3 to 7 children per node, at most 5 levels, at most ${mode === 'update' ? MAX_NODES : NEW_MAP_NODES} nodes in total.
- "grammar" must be an id from the catalog${user.studyLanguage === 'en' ? '' : ' (there is none for this language: do not use it)'}; "word" must be a headword from the learner's list. Leave both out when nothing fits; never invent ids.
- Group by meaning (for example by tense, by use, or contrasts that are easy to confuse), not alphabetically. Put points the learner finds hard where they are easy to see.
- Do not claim the learner knows something the data does not show.`;
}

/**
 * Turns the AI's nested tree into a document: kept ids stay, new nodes get ids, links are checked
 * @param base - The map being updated (null for a new map)
 * @param wordIds - Dictionary id for each word the AI named (missing means not in the dictionary)
 * @throws DocError when the result is not a valid map
 */
export function treeToDoc(tree: AiNode, base: MapDoc | null, wordIds: Map<string, string>): MapDoc {
  const known = new Set(GRAMMAR_POINTS.map((p) => p.id));
  const nodes: Record<string, MapNode> = {};
  const used = new Set<string>();
  const fresh = (): string => {
    let id = newId();
    while (used.has(id) || base?.nodes[id]) id = newId();
    return id;
  };

  const walk = (node: AiNode, depth: number, isRoot: boolean): string => {
    if (depth > MAX_DEPTH) throw new DocError('The proposed map is too deep.');
    const kept = isRoot && base ? base.root : node.id && base?.nodes[node.id] && !used.has(node.id) ? node.id : null;
    const id = kept ?? (isRoot ? 'root' : fresh());
    used.add(id);
    const before = kept && base ? base.nodes[kept] : undefined;

    const link = node.grammar && known.has(node.grammar) ? { kind: 'grammar' as const, id: node.grammar } : node.word && wordIds.has(node.word.toLowerCase()) ? { kind: 'word' as const, id: wordIds.get(node.word.toLowerCase())! } : before?.link;
    const children = node.children.map((child) => walk(child, depth + 1, false));
    nodes[id] = {
      text: node.text,
      ...((node.note ?? before?.note) && { note: node.note ?? before?.note }),
      ...(link && { link }),
      children,
      ...((node.color ?? before?.color) && { color: node.color ?? before?.color }),
      ...(before?.collapsed && { collapsed: true }),
    };
    return id;
  };

  const root = walk(tree, 1, true);
  const doc: MapDoc = { root, nodes };
  if (Object.keys(nodes).length > (base ? MAX_NODES : NEW_MAP_NODES)) throw new DocError('The proposed map is too big.');
  checkDoc(doc);
  return doc;
}

/** Every word the AI named, in lower case, to look up once */
export function wordsIn(tree: AiNode): string[] {
  const words = new Set<string>();
  const walk = (node: AiNode) => {
    if (node.word) words.add(node.word.toLowerCase());
    node.children.forEach(walk);
  };
  walk(tree);
  return [...words];
}

/**
 * Dictionary ids for words, in the learner's study language
 */
export async function lookupWords(terms: string[], language: 'en' | 'ja'): Promise<Map<string, string>> {
  if (terms.length === 0) return new Map();
  const rows = await db
    .select({ id: vocabItems.id, term: vocabItems.term })
    .from(vocabItems)
    .where(and(eq(vocabItems.language, language), inArray(sql`lower(${vocabItems.term})`, terms)));
  return new Map(rows.map((r) => [r.term.toLowerCase(), r.id]));
}

/**
 * What differs between the current map and the proposal
 */
export function diffDocs(base: MapDoc, next: MapDoc): Change[] {
  const parentOf = (doc: MapDoc) => {
    const parents = new Map<string, string>();
    for (const [id, node] of Object.entries(doc.nodes)) for (const child of node.children) parents.set(child, id);
    return parents;
  };
  const before = parentOf(base);
  const after = parentOf(next);
  const changes: Change[] = [];
  for (const [id, node] of Object.entries(next.nodes)) {
    const old = base.nodes[id];
    if (!old) {
      changes.push({ type: 'added', id, text: node.text });
    } else if (old.text !== node.text || (old.note ?? '') !== (node.note ?? '') || old.link?.kind !== node.link?.kind || old.link?.id !== node.link?.id || (old.color ?? null) !== (node.color ?? null)) {
      changes.push({ type: 'changed', id, text: node.text, ...(old.text !== node.text && { from: old.text }) });
    } else if (before.get(id) !== after.get(id)) {
      changes.push({ type: 'moved', id, text: node.text });
    }
  }
  for (const [id, node] of Object.entries(base.nodes)) if (!next.nodes[id]) changes.push({ type: 'removed', id, text: node.text });
  return changes;
}
