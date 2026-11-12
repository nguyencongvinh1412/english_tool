/**
 * Drafts the import manifest of one test of a scanned book from its OCR text (scripts/book/ocr-book.sh), the answer key
 * read by eye (docs/reference/keys) and the book's configuration (docs/reference/books/<name>.json).
 *
 *   npm run book:draft -- c13 3            # every group of test 3
 *   npm run book:draft -- c13 3 l2 r1 w1   # only some: l1-l4 listening, r1-r3 reading, w1 w2 writing, s speaking
 *
 * The AI turns the OCR text of the questions into typed questions and splits the passage into paragraphs; it never
 * sees a transcript to rewrite (the script is cut from the audioscript pages by rule). Every answer is then checked
 * against the key, so a wrong letter or word from the AI or the OCR is reported instead of imported. Questions of tables,
 * maps and flow charts keep the book's page as a picture. Output: docs/reference/manifests/<name>-t<test>.json (for
 * npm run book:import) and a report next to it with everything a person should look at.
 */
import "../config.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { closeDb, db } from "../db/client.js";
import { users, type User } from "../db/schema.js";
import {
  ieltsListening,
  ieltsReading,
  speakingIeltsGate,
} from "../content/schemas.js";
import { verifyIelts } from "../exams/ieltsBank.js";
import { runAIJson, SCORING_MAX_TOKENS } from "../services/ai.js";

const REF = path.resolve("docs/reference");
const FEATURE = "book-draft";
const DUMMY_ASSET = "00000000-0000-4000-8000-000000000000";

/* ---------- configuration ---------- */

interface TestConfig {
  pages: {
    listening: [number, number];
    reading: [number, number];
    writing: [number, number];
    speaking: [number];
    script: [number, number];
    samples?: [number, number];
  };
  /** The recording of each section; null when the folder does not have it (the voice reads the transcript) */
  audio: (string | null)[];
  /** Listening sections whose transcript is missing from the scan (1-4): they are imported without one */
  missingScript?: number[];
}
interface BookConfig {
  name: string;
  title: string;
  idPrefix: string;
  level: string;
  keys: string;
  /** Heading patterns when the book does not say "SECTION n" (Cambridge 17 says "PART n") */
  headings?: { listening?: string; script?: string };
  /** Extra page noise to drop (a regular expression): audio icons' captions, a site's footer */
  noise?: string;
  tests: Record<string, TestConfig>;
}

/* ---------- reading the OCR ---------- */

interface Line {
  text: string;
  page: number;
}

/** The OCR reads the pound sign of the British books as a euro sign */
const FIX_POUND = (text: string) => text.replace(/€/g, "£");

let NOISE: RegExp | null = null;
const WATERMARK =
  /FB\.com\/|Fb\.com\/|IELTS Quận 6\s*:|LouisQuangVo|TheIELTSFOCUS/gi;

function pageLines(name: string, page: number): Line[] {
  const file = path.join(
    REF,
    "ocr",
    name,
    `p-${String(page).padStart(3, "0")}.txt`,
  );
  if (!existsSync(file))
    throw new Error(
      `No OCR for page ${page} of ${name}: run scripts/book/ocr-book.sh first`,
    );
  return readFileSync(file, "utf8")
    .split("\n")
    .slice(1)
    .map((raw) =>
      FIX_POUND(
        (NOISE ? raw.replace(NOISE, "") : raw)
          .replace(WATERMARK, "")
          .replace(/\s+$/, ""),
      ),
    )
    .filter((text) => text.trim() !== "")
    .map((text) => ({ text, page }));
}

const rangeLines = (name: string, [from, to]: number[]): Line[] =>
  Array.from({ length: (to ?? from) - from + 1 }, (_, i) =>
    pageLines(name, from + i),
  ).flat();

/** Splits lines into segments that start at lines matching `start` (the lines before the first match are dropped) */
function segments(lines: Line[], start: RegExp): Line[][] {
  const out: Line[][] = [];
  for (const line of lines) {
    if (start.test(line.text)) out.push([]);
    out.at(-1)?.push(line);
  }
  return out;
}

const textOf = (lines: Line[]): string =>
  lines
    .map((l) => (l.text.match(/^\s*\d{1,3}\s*$/) ? "" : l.text))
    .filter(Boolean)
    .join("\n");
const textWithPages = (lines: Line[]): string => {
  let last = -1;
  return lines
    .flatMap((l) =>
      l.page !== last
        ? ((last = l.page), [`[page ${l.page}]`, l.text])
        : [l.text],
    )
    .join("\n");
};

/* ---------- the key ---------- */

type KeyEntry =
  | { kind: "letter"; letters: string[]; either: boolean; start: number }
  | { kind: "word"; value: "TRUE" | "FALSE" | "NOT GIVEN" | "YES" | "NO" }
  | { kind: "roman"; index: number }
  | { kind: "text"; alts: string[] };

const ROMAN = [
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "xi",
  "xii",
];

/** "tail(s) / tails" and "(audio-recording) vests" become every spelling the key accepts */
function expand(alt: string): string[] {
  const paren = alt.match(/\(([^)]*)\)/);
  if (!paren) return [alt.trim()];
  return [
    alt.replace(paren[0], "").replace(/\s+/g, " ").trim(),
    alt.replace(paren[0], paren[1]).replace(/\s+/g, " ").trim(),
  ];
}

function parseKey(text: string): Map<number, KeyEntry> {
  const map = new Map<number, KeyEntry>();
  for (const line of text.split("\n")) {
    const either = line.match(/^(\d+)-(\d+) \(either order\) (.+)$/);
    if (either) {
      const entry: KeyEntry = {
        kind: "letter",
        letters: either[3].split(",").map((x) => x.trim()),
        either: true,
        start: Number(either[1]),
      };
      for (let n = Number(either[1]); n <= Number(either[2]); n++)
        map.set(n, entry);
      continue;
    }
    const one = line.match(/^(\d+) (.+)$/);
    if (!one) continue;
    const value = one[2].trim();
    const n = Number(one[1]);
    if (/^[A-L]$/.test(value))
      map.set(n, { kind: "letter", letters: [value], either: false, start: n });
    else if (["TRUE", "FALSE", "NOT GIVEN", "YES", "NO"].includes(value))
      map.set(n, { kind: "word", value: value as never });
    else if (ROMAN.includes(value))
      map.set(n, { kind: "roman", index: ROMAN.indexOf(value) });
    else map.set(n, { kind: "text", alts: value.split(" / ").flatMap(expand) });
  }
  return map;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Sets every answer from the key (it was read by eye, the AI's reading of the OCR was not) and reports where the AI's
 * own answer differed, which shows where the OCR or the layout confused it. A question whose type cannot take the key's
 * kind of answer is a problem.
 */
function settle(
  questions: DraftQuestion[],
  first: number,
  key: Map<number, KeyEntry>,
): { questions: DraftQuestion[]; warnings: string[]; problems: string[] } {
  const warnings: string[] = [];
  const problems: string[] = [];
  const settled = questions.map((original, i): DraftQuestion => {
    const q = { ...original };
    const n = first + i;
    const entry = key.get(n);
    // The AI sometimes types a Yes / No / Not Given question as True / False, or the reverse: the key says which it is
    if (
      entry?.kind === "word" &&
      q.type === "tfng" &&
      (entry.value === "YES" || entry.value === "NO")
    ) {
      Object.assign(q, {
        type: "match",
        options: ["Yes", "No", "Not Given"],
        answerIndex: undefined,
        answer: undefined,
      });
      warnings.push(
        `Q${n}: typed True/False by the AI; the key is ${entry.value}, so it became Yes / No / Not Given`,
      );
    } else if (
      entry?.kind === "word" &&
      q.type === "match" &&
      (entry.value === "TRUE" || entry.value === "FALSE")
    ) {
      Object.assign(q, {
        type: "tfng",
        options: undefined,
        answerIndex: undefined,
      });
      warnings.push(
        `Q${n}: typed Yes/No by the AI; the key is ${entry.value}, so it became True / False`,
      );
    }
    if (!entry) {
      problems.push(`Q${n}: the key has no entry`);
      return q;
    }
    if (entry.kind === "text") {
      if (q.type !== "gap")
        return (
          problems.push(
            `Q${n}: key is a word (${entry.alts[0]}) but the question is ${q.type}`,
          ),
          q
        );
      const had = (q.answers ?? []).map(norm);
      if (!entry.alts.some((alt) => had.includes(norm(alt))))
        warnings.push(
          `Q${n}: the AI had ${JSON.stringify(q.answers)}; the key says ${JSON.stringify(entry.alts)}`,
        );
      q.answers = [...new Set(entry.alts)];
    } else if (entry.kind === "letter") {
      if (q.type !== "mcq" && q.type !== "match")
        return (
          problems.push(`Q${n}: key is a letter but the question is ${q.type}`),
          q
        );
      const wanted = entry.letters.map((l) => "ABCDEFGHIJKL".indexOf(l));
      const mine = entry.either ? wanted[n - entry.start] : wanted[0];
      if (q.answerIndex !== mine)
        warnings.push(
          `Q${n}: the AI chose index ${q.answerIndex}; the key says ${entry.either ? entry.letters.join("/") : entry.letters[0]}`,
        );
      if (mine >= (q.options?.length ?? 0))
        problems.push(
          `Q${n}: the key letter ${"ABCDEFGHIJKL"[mine]} is beyond the ${q.options?.length ?? 0} options the AI found`,
        );
      q.answerIndex = mine;
      if (entry.either) q.anyOf = [...wanted].sort((a, b) => a - b);
      else delete q.anyOf;
    } else if (entry.kind === "roman") {
      if (q.type !== "match")
        return (
          problems.push(
            `Q${n}: key is a heading (${ROMAN[entry.index]}) but the question is ${q.type}`,
          ),
          q
        );
      if (q.answerIndex !== entry.index)
        warnings.push(
          `Q${n}: the AI chose heading index ${q.answerIndex}; the key says ${ROMAN[entry.index]}`,
        );
      if (entry.index >= (q.options?.length ?? 0))
        problems.push(
          `Q${n}: heading ${ROMAN[entry.index]} is beyond the ${q.options?.length ?? 0} headings the AI found`,
        );
      q.answerIndex = entry.index;
    } else if (q.type === "tfng") {
      const want = entry.value.toLowerCase().replace(" ", "_") as
        "true" | "false" | "not_given";
      if (!["TRUE", "FALSE", "NOT GIVEN"].includes(entry.value))
        problems.push(`Q${n}: key ${entry.value} on a True/False question`);
      if (q.answer !== want)
        warnings.push(
          `Q${n}: the AI said ${q.answer}; the key says ${entry.value}`,
        );
      q.answer = want;
    } else if (q.type === "match") {
      const at = (q.options ?? []).findIndex(
        (o) => o.toLowerCase() === entry.value.toLowerCase(),
      );
      if (at < 0)
        problems.push(
          `Q${n}: key ${entry.value} is not among the options ${JSON.stringify(q.options)}`,
        );
      else {
        if (q.answerIndex !== at)
          warnings.push(
            `Q${n}: the AI chose index ${q.answerIndex}; the key says ${entry.value}`,
          );
        q.answerIndex = at;
      }
    } else
      problems.push(`Q${n}: key ${entry.value} but the question is ${q.type}`);
    return q;
  });
  return { questions: settled, warnings, problems };
}

/* ---------- the AI draft ---------- */

const draftQuestion = z.object({
  type: z.enum(["gap", "mcq", "match", "tfng"]),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  answerIndex: z.number().optional(),
  anyOf: z.array(z.number()).optional(),
  answers: z.array(z.string()).optional(),
  answer: z.enum(["true", "false", "not_given"]).optional(),
  wordLimit: z.number().optional(),
  explanation: z.string(),
});
type DraftQuestion = z.infer<typeof draftQuestion>;

const listeningDraft = z.object({
  title: z.string(),
  context: z.string(),
  questions: z.array(draftQuestion),
  figurePages: z.array(z.number()).default([]),
  notes: z.array(z.string()).default([]),
});
const readingDraft = z.object({
  title: z.string(),
  paragraphs: z.array(z.string()).default([]),
  questions: z.array(draftQuestion),
  figurePages: z.array(z.number()).default([]),
  notes: z.array(z.string()).default([]),
});

const QUESTION_RULES = `Question JSON shapes (every question has "explanation": ONE sentence citing the evidence from the ${"${source}"}, ending with the answer):
- gap:   {"type":"gap","prompt":"...____...","answers":["main answer","other accepted spellings"],"wordLimit":1,"explanation":"..."}
         The prompt is the sentence or note line of the book with ____ where the number was. The word limit comes from the instruction ("ONE WORD ONLY" = 1, "NO MORE THAN TWO WORDS" = 2, "ONE WORD AND/OR A NUMBER" = 1, "TWO WORDS AND/OR A NUMBER" = 2).
         "answers" lists every answer the KEY accepts, spelled out (the key writes "tail(s)" for tail and tails, "20 / twenty percent" for two answers).
- mcq:   {"type":"mcq","prompt":"the question","options":["text of A","text of B","text of C"],"answerIndex":0,"explanation":"..."}   (3 to 5 options, in the book's order, without the letters)
- match: {"type":"match","prompt":"the item to match","options":["the whole list in the book's order, without letters"],"answerIndex":3,"explanation":"..."}
         Used for: matching headings / features / information / sentence endings, labelling a map or plan (options "A".."I"), and
         Yes / No / Not Given (options exactly ["Yes","No","Not Given"]). EVERY question of one list carries the same options.
         For a heading list marked i, ii, iii... the index is the heading's position in the list (i = 0).
- tfng:  {"type":"tfng","prompt":"the statement","answer":"true"|"false"|"not_given","explanation":"..."}   (True / False / Not Given statements)
- "Choose TWO letters": write TWO questions of type match (or mcq) with the same options and the same "anyOf":[the two right indexes]; their answerIndex values are the two right indexes, one each.
- "Choose the correct letter" with options that are letters only (A, B, C...) because the options are in a picture or table: use match with options ["A","B","C"...].
Number the questions in the book's order. Never invent a question: if a number is missing from the text, say so in "notes".`;

const PICTURE_RULES = `Pictures: the OCR of tables, maps, plans, diagrams and flow charts is scrambled. For such a block keep each question short and self-contained (for a table cell say which row and column, for a map the item to place) and list the page numbers (the [page N] markers) of the pages holding the figure in "figurePages". Put in "notes" anything a person must check against the page.`;

async function draftListening(
  user: User,
  section: number,
  questionText: string,
  key: string,
  first: number,
  count: number,
  transcript: string | null,
  repair?: string,
): Promise<z.infer<typeof listeningDraft>> {
  return runAIJson(
    user,
    {
      feature: FEATURE,
      timeoutMs: 240_000,
      maxTokens: SCORING_MAX_TOKENS,
      system: `You turn one section of a real IELTS Listening test into JSON for a practice app. The input is the OCR text of the question pages (it can contain page headers, watermarks and garbled tables), plus the official key for these questions.
${QUESTION_RULES.replace("${source}", transcript ? "transcript (quote a few words of it)" : "recording (the transcript is not available: say briefly what the key and the question imply)")}
${PICTURE_RULES}
Return ONLY one JSON object: {"title":"short title of the topic","context":"the line the candidate reads before listening, e.g. You will hear a talk about ...","questions":[...exactly ${count} questions numbered ${first}-${first + count - 1}...],"figurePages":[],"notes":[]}`,
      messages: [
        {
          role: "user",
          content: `Listening Section ${section}, questions ${first}-${first + count - 1}.\n\nKEY:\n${key}\n\nOCR TEXT:\n${questionText}${transcript ? `\n\nTRANSCRIPT (for the explanations only):\n${transcript}` : ""}${repair ? `\n\nA CHECK FOUND THESE PROBLEMS IN YOUR PREVIOUS ANSWER, FIX THEM:\n${repair}` : ""}`,
        },
      ],
    },
    listeningDraft,
  );
}

async function draftReading(
  user: User,
  passage: number,
  text: string,
  key: string,
  first: number,
  count: number,
  repair?: string,
): Promise<z.infer<typeof readingDraft>> {
  return runAIJson(
    user,
    {
      feature: FEATURE,
      timeoutMs: 300_000,
      maxTokens: SCORING_MAX_TOKENS,
      system: `You turn one passage of a real IELTS Academic Reading test into JSON for a practice app. The input is the OCR text of the passage and its questions (page headers, watermarks and garbled tables can appear), plus the official key.
Do NOT write the passage out: the app cuts it from the page itself. You give only the passage title (as printed) and the questions.
${QUESTION_RULES.replace("${source}", "passage")}
${PICTURE_RULES}
Return ONLY one JSON object: {"title":"...","questions":[...exactly ${count} questions numbered ${first}-${first + count - 1}...],"figurePages":[],"notes":[]}`,
      messages: [
        {
          role: "user",
          content: `Reading Passage ${passage}, questions ${first}-${first + count - 1}.\n\nKEY:\n${key}\n\nOCR TEXT:\n${text}${repair ? `\n\nA CHECK FOUND THESE PROBLEMS IN YOUR PREVIOUS ANSWER, FIX THEM:\n${repair}` : ""}`,
        },
      ],
    },
    readingDraft,
  );
}

/* ---------- the transcript ---------- */

function parseScript(raw: Line[]): {
  speakers: Record<string, { name: string; gender: "female" | "male" }>;
  script: { speaker: "A" | "B" | "C"; text: string }[];
} {
  const tagged: { tag: string; text: string }[] = [];
  const letters = ["A", "B", "C"] as const;
  const names: string[] = [];
  for (const { text: original } of raw) {
    const text = original
      .replace(/\s{2,}Q\d{1,2}(\/\d{1,2})?\b/g, "")
      .replace(/\s{2,}Example\s*$/i, "")
      .replace(/^(Audioscripts|Test \d|TEST \d|SECTION \d|PART \d)\s*$/i, "")
      .trim();
    if (!text || /^\d{1,3}$/.test(text)) continue;
    const speaker = text.match(/^([A-Z][A-Z' ]{1,18}):\s*(.*)$/);
    if (speaker) {
      tagged.push({ tag: speaker[1].trim(), text: speaker[2].trim() });
      if (!names.includes(speaker[1].trim())) names.push(speaker[1].trim());
    } else if (tagged.length === 0) tagged.push({ tag: "", text });
    else {
      const last = tagged[tagged.length - 1];
      last.text = last.text.endsWith("-")
        ? last.text + text
        : `${last.text} ${text}`;
    }
  }
  const order = names.length > 0 ? names : [""];
  const speakerOf = (tag: string) =>
    letters[Math.min(Math.max(order.indexOf(tag), 0), 2)];
  const title = (n: string) =>
    n ? n[0] + n.slice(1).toLowerCase() : "Speaker";
  return {
    speakers: Object.fromEntries(
      order.slice(0, 3).map((n, i) => [
        letters[i],
        {
          name: title(n),
          gender: i % 2 === 0 ? ("female" as const) : ("male" as const),
        },
      ]),
    ),
    script: tagged
      .filter((t) => t.text)
      .map((t) => ({ speaker: speakerOf(t.tag), text: t.text })),
  };
}

/* ---------- assembling ---------- */

interface ManifestItem {
  id: string;
  kind: string;
  level: string;
  part: string;
  title: string;
  topic: string;
  payload: unknown;
}
interface Manifest {
  assets: Record<
    string,
    {
      file?: string;
      files?: string[];
      kind: "image" | "audio";
      crop?: number[];
    }
  >;
  items: ManifestItem[];
}

const report: string[] = [];
const say = (line: string) => {
  console.log(line);
  report.push(line);
};

const withDummyAssets = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_, v) =>
      v && typeof v === "object" && "$asset" in v
        ? { ...v, assetId: DUMMY_ASSET, $asset: undefined }
        : v,
    ),
  );

/** Rounds a group through the real schema; returns the problems */
function schemaProblems(
  kind: "ielts-listening" | "ielts-reading",
  payload: unknown,
): string[] {
  const parsed = (
    kind === "ielts-listening" ? ieltsListening : ieltsReading
  ).safeParse(withDummyAssets(payload));
  return parsed.success
    ? []
    : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

/** Share of the paragraphs' words that are in the OCR text: a rewritten or invented sentence lowers it */
function fidelity(source: string, paragraphs: string[]): { precision: number } {
  const have = new Map<string, number>();
  for (const w of norm(source).split(" ").filter(Boolean))
    have.set(w, (have.get(w) ?? 0) + 1);
  const mine = norm(paragraphs.join(" ")).split(" ").filter(Boolean);
  let hit = 0;
  for (const w of mine) {
    const n = have.get(w) ?? 0;
    if (n > 0) {
      hit++;
      have.set(w, n - 1);
    }
  }
  return { precision: mine.length ? hit / mine.length : 1 };
}

const INSTRUCTION =
  /^(You should spend|Choose|Write|Questions?\s+\d|Do the following|In boxes|Complete|Look at the following|Match|Which paragraph|Reading Passage \d|READING PASSAGE|Test \d|Reading$|TRUE|FALSE|NOT GIVEN|YES|NO\b|NB|List of|Passage \d)/i;

/** Long lines of the page that neither the paragraphs nor the questions contain (a missing glossary or caption shows up here) */
function uncoveredLines(
  seg: Line[],
  draft: { paragraphs: string[]; questions: DraftQuestion[] },
): string[] {
  const have = new Set(
    norm(
      `${draft.paragraphs.join(" ")} ${draft.questions.map((q) => `${q.prompt} ${(q.options ?? []).join(" ")}`).join(" ")}`,
    ).split(" "),
  );
  return seg
    .map((l) => l.text)
    .filter((text) => {
      const words = norm(text).split(" ").filter(Boolean);
      return (
        words.length >= 6 &&
        !INSTRUCTION.test(text.trim()) &&
        words.filter((w) => have.has(w)).length / words.length < 0.8
      );
    })
    .slice(0, 6);
}

async function main(): Promise<void> {
  const [name, testNo, ...slots] = process.argv.slice(2);
  if (!name || !testNo)
    throw new Error(
      "Usage: npm run book:draft -- <book> <test> [l1..l4 r1..r3 w1 w2 s]",
    );
  const config = JSON.parse(
    readFileSync(path.join(REF, "books", `${name}.json`), "utf8"),
  ) as BookConfig;
  NOISE = config.noise ? new RegExp(config.noise, "gi") : null;
  const test = config.tests[testNo];
  if (!test) throw new Error(`No test ${testNo} in ${name}`);
  const keyFile = JSON.parse(
    readFileSync(path.join(REF, config.keys), "utf8"),
  ) as { tests: Record<string, { listening: string; reading: string }> };
  const key = {
    listening: parseKey(keyFile.tests[testNo].listening),
    reading: parseKey(keyFile.tests[testNo].reading),
  };
  const keyText = keyFile.tests[testNo];
  const wanted = (slot: string) => slots.length === 0 || slots.includes(slot);

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (!admin) throw new Error("No admin account to draft with.");

  const manifest: Manifest = { assets: {}, items: [] };
  const part = `book:${name}-t${testNo}`;
  const prefix = `${config.idPrefix}-t${testNo}`;
  const pageImage = (page: number) =>
    path.join(REF, "pages", name, `p-${String(page).padStart(3, "0")}.png`);
  const keyRange = (text: string, from: number, to: number) =>
    text
      .split("\n")
      .filter((l) => {
        const n = Number(l.match(/^(\d+)/)?.[1]);
        return n >= from && n <= to;
      })
      .join("\n");

  /* listening */
  const listeningSegs = segments(
    rangeLines(name, test.pages.listening),
    new RegExp(
      config.headings?.listening ?? "^SECTION\\s*[1-4]\\s+Questions",
      "i",
    ),
  );
  const scriptSegs = segments(
    rangeLines(name, test.pages.script),
    new RegExp(config.headings?.script ?? "^SECTION\\s*[1-4]\\s*$", "i"),
  );
  const scriptIds = scriptSegs.map((seg) =>
    Number(seg[0].text.match(/\d/)![0]),
  );
  for (let s = 1; s <= 4; s++) {
    if (!wanted(`l${s}`)) continue;
    const seg = listeningSegs[s - 1];
    if (!seg) {
      say(`l${s}: section not found in the OCR`);
      continue;
    }
    const first = (s - 1) * 10 + 1;
    const keySlice = keyRange(keyText.listening, first, first + 9);
    const questionText = textWithPages(seg);
    const scriptSeg = scriptSegs[scriptIds.indexOf(s)];
    const noScript = test.missingScript?.includes(s) || !scriptSeg;
    const script = noScript ? null : parseScript(scriptSeg.slice(1));
    try {
      say(
        `\n## Listening section ${s} (questions ${first}-${first + 9})${noScript ? " - no transcript in the scan" : ` - transcript of ${script!.script.length} lines`}`,
      );

      let repair: string | undefined;
      let best: {
        draft: z.infer<typeof listeningDraft>;
        problems: string[];
      } | null = null;
      let warnings: string[] = [];
      for (let attempt = 1; attempt <= 2; attempt++) {
        const draft = await draftListening(
          admin,
          s,
          questionText,
          keySlice,
          first,
          10,
          script
            ? script.script
                .map((l) => l.text)
                .join("\n")
                .slice(0, 9000)
            : null,
          repair,
        );
        const checked = settle(draft.questions, first, key.listening);
        draft.questions = checked.questions;
        const problems = [...checked.problems];
        warnings = checked.warnings;
        const assetName = `${name}-t${testNo}-l${s}`;
        const payload = {
          section: s,
          title: draft.title,
          context: draft.context,
          speakers: script?.speakers ?? {
            A: { name: "Speaker", gender: "female" },
          },
          script: script?.script ?? [],
          ...(test.audio[s - 1]
            ? { audio: { $asset: `${assetName}.mp3` } }
            : {}),
          ...(draft.figurePages.length > 0
            ? {
                image: {
                  $asset: `${assetName}.webp`,
                  alt: `Question page${draft.figurePages.length > 1 ? "s" : ""} of Listening Section ${s}: ${draft.title}`,
                },
              }
            : {}),
          questions: draft.questions.map(cleanQuestion),
        };
        problems.push(...schemaProblems("ielts-listening", payload));
        best = { draft, problems };
        if (problems.length === 0) break;
        repair = problems.join("\n");
        say(`  attempt ${attempt}: ${problems.length} problem(s), retrying`);
      }
      const { draft, problems } = best!;
      const assetName = `${name}-t${testNo}-l${s}`;
      const recording = test.audio[s - 1];
      if (recording)
        manifest.assets[`${assetName}.mp3`] = {
          file: recording,
          kind: "audio",
        };
      else say("  no recording in the folder: the voice reads the transcript");
      if (draft.figurePages.length > 0)
        manifest.assets[`${assetName}.webp`] = {
          files: draft.figurePages.map(pageImage),
          kind: "image",
        };
      const item: ManifestItem = {
        id: `${prefix}-l${s}`,
        kind: "ielts-listening",
        level: config.level,
        part,
        title: `${config.title}, Test ${testNo}, Listening Section ${s}`,
        topic: draft.title,
        payload: {
          section: s,
          title: draft.title,
          context: draft.context,
          speakers: script?.speakers ?? {
            A: { name: "Speaker", gender: "female" },
          },
          script: script?.script ?? [],
          ...(test.audio[s - 1]
            ? { audio: { $asset: `${assetName}.mp3` } }
            : {}),
          ...(draft.figurePages.length > 0
            ? {
                image: {
                  $asset: `${assetName}.webp`,
                  alt: `Question page${draft.figurePages.length > 1 ? "s" : ""} of Listening Section ${s}: ${draft.title}`,
                },
              }
            : {}),
          questions: draft.questions.map(cleanQuestion),
        },
      };
      manifest.items.push(item);
      for (const p of problems) say(`  PROBLEM ${p}`);
      for (const w of warnings) say(`  warning ${w}`);
      for (const n of draft.notes) say(`  note: ${n}`);
      if (draft.figurePages.length > 0)
        say(
          `  figure pages: ${draft.figurePages.join(", ")} (look at the image)`,
        );
      if (problems.length === 0 && script && script.script.length > 0) {
        const solved = await verifyIelts(
          admin,
          `listening-${s}` as never,
          JSON.parse(JSON.stringify(item.payload, (_, v) => v)) as never,
          FEATURE,
        ).catch((e) => [`solver failed: ${String(e)}`] as never);
        say(`  solver disagrees on: ${JSON.stringify(solved)}`);
      }
    } catch (error) {
      say(
        `  FAILED listening section ${s}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /* reading */
  const readingSegs = segments(
    rangeLines(name, test.pages.reading),
    /^READING PASSAGE\s*[1-3]\b/,
  );
  const readingRanges = [
    [1, 13],
    [14, 26],
    [27, 40],
  ] as const;
  for (let p = 1; p <= 3; p++) {
    if (!wanted(`r${p}`)) continue;
    const seg = readingSegs[p - 1];
    if (!seg) {
      say(`r${p}: passage not found in the OCR`);
      continue;
    }
    try {
      const [from, to] = readingRanges[p - 1];
      const keySlice = keyRange(keyText.reading, from, to);
      const text = textWithPages(seg);
      say(`\n## Reading passage ${p} (questions ${from}-${to})`);
      let repair: string | undefined;
      let best: {
        draft: z.infer<typeof readingDraft>;
        problems: string[];
      } | null = null;
      let warnings: string[] = [];
      let uncovered: string[] = [];
      const assetName = `${name}-t${testNo}-r${p}`;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const draft = await draftReading(
          admin,
          p,
          text,
          keySlice,
          from,
          to - from + 1,
          repair,
        );
        draft.paragraphs = passageFromBoxes(
          name,
          [...new Set(seg.map((l) => l.page))],
          draft.title,
        );
        if (draft.paragraphs.length < 4)
          throw new Error(
            `only ${draft.paragraphs.length} paragraph(s) cut from the page`,
          );
        const checked = settle(draft.questions, from, key.reading);
        draft.questions = checked.questions;
        const problems = [...checked.problems];
        warnings = checked.warnings;
        const payload = {
          title: draft.title,
          paragraphs: draft.paragraphs,
          ...(draft.figurePages.length > 0
            ? {
                image: {
                  $asset: `${assetName}.webp`,
                  alt: `Figure of Reading passage ${p}: ${draft.title}`,
                },
              }
            : {}),
          questions: draft.questions.map(cleanQuestion),
        };
        problems.push(...schemaProblems("ielts-reading", payload));
        // Nothing in the paragraphs may be invented; lines of the page that neither the paragraphs nor the questions hold are listed for a look
        const kept = fidelity(
          seg.map((l) => l.text).join(" "),
          draft.paragraphs,
        );
        if (kept.precision < 0.97)
          problems.push(
            `the paragraphs differ from the OCR text: only ${(kept.precision * 100).toFixed(1)}% of their words are in it`,
          );
        uncovered = uncoveredLines(seg, draft);
        best = { draft, problems };
        if (problems.length === 0) break;
        repair = problems.join("\n");
        say(`  attempt ${attempt}: ${problems.length} problem(s), retrying`);
      }
      const { draft, problems } = best!;
      if (draft.figurePages.length > 0)
        manifest.assets[`${assetName}.webp`] = {
          files: draft.figurePages.map(pageImage),
          kind: "image",
        };
      const item: ManifestItem = {
        id: `${prefix}-r${p}`,
        kind: "ielts-reading",
        level: config.level,
        part,
        title: `${config.title}, Test ${testNo}, Reading Passage ${p}`,
        topic: draft.title,
        payload: {
          title: draft.title,
          paragraphs: draft.paragraphs,
          ...(draft.figurePages.length > 0
            ? {
                image: {
                  $asset: `${assetName}.webp`,
                  alt: `Figure of Reading passage ${p}: ${draft.title}`,
                },
              }
            : {}),
          questions: draft.questions.map(cleanQuestion),
        },
      };
      manifest.items.push(item);
      for (const x of problems) say(`  PROBLEM ${x}`);
      for (const w of warnings) say(`  warning ${w}`);
      for (const l of uncovered) say(`  not in the draft: ${l}`);
      for (const n of draft.notes) say(`  note: ${n}`);
      if (draft.figurePages.length > 0)
        say(
          `  figure pages: ${draft.figurePages.join(", ")} (look at the image)`,
        );
      if (problems.length === 0) {
        const solved = await verifyIelts(
          admin,
          "reading",
          item.payload as never,
          FEATURE,
        ).catch((e) => [`solver failed: ${String(e)}`] as never);
        say(`  solver disagrees on: ${JSON.stringify(solved)}`);
      }
    } catch (error) {
      say(
        `  FAILED reading passage ${p}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /* writing: the task text by rule, the figure as a picture cut below the instruction */
  const writingLines = rangeLines(name, test.pages.writing);
  if (wanted("w1"))
    await writingTask1(
      name,
      testNo,
      config,
      test,
      writingLines,
      manifest,
      part,
      prefix,
      admin,
    );
  if (wanted("w2"))
    writingTask2(testNo, config, writingLines, manifest, part, prefix);
  if (wanted("s"))
    await speaking(name, testNo, config, test, manifest, part, prefix, admin);

  // Corrections made by a person (docs/reference/overrides/<name>-t<test>.json: { "<item id>": { "payload": {...fields} } }) survive a rerun
  const overrideFile = path.join(REF, "overrides", `${name}-t${testNo}.json`);
  if (existsSync(overrideFile)) {
    const overrides = JSON.parse(readFileSync(overrideFile, "utf8")) as Record<
      string,
      { payload?: Record<string, unknown> }
    >;
    for (const item of manifest.items) {
      const fix = overrides[item.id]?.payload;
      if (fix) {
        item.payload = { ...(item.payload as object), ...fix };
        say(`override applied to ${item.id}: ${Object.keys(fix).join(", ")}`);
      }
    }
    // "_assets": { "<asset name>": { "crop": [x, y, width, height] } } sets a picture's crop by hand (a figure taller than the usual area)
    const assets = (
      overrides as unknown as Record<
        string,
        Record<string, { crop?: [number, number, number, number] }>
      >
    )._assets;
    for (const [asset, fix] of Object.entries(assets ?? {}))
      if (manifest.assets[asset] && fix.crop)
        manifest.assets[asset].crop = fix.crop;
  }

  mkdirSync(path.join(REF, "manifests"), { recursive: true });
  const out = path.join(
    REF,
    "manifests",
    `${name}-t${testNo}${slots.length ? "-" + slots.join("") : ""}.json`,
  );
  writeFileSync(out, JSON.stringify(manifest, null, 1));
  writeFileSync(out.replace(/\.json$/, ".report.md"), report.join("\n"));
  say(`\nWrote ${out}`);
  await closeDb();
}

/** The question as it will be stored: only the fields its type uses */
function cleanQuestion(q: DraftQuestion): unknown {
  if (q.type === "gap")
    return {
      type: "gap",
      prompt: q.prompt,
      answers: q.answers,
      wordLimit: q.wordLimit ?? 1,
      explanation: q.explanation,
    };
  if (q.type === "tfng")
    return {
      type: "tfng",
      prompt: q.prompt,
      answer: q.answer,
      explanation: q.explanation,
    };
  return {
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    answerIndex: q.answerIndex,
    ...(q.anyOf ? { anyOf: q.anyOf } : {}),
    explanation: q.explanation,
  };
}

/**
 * The passage text cut out of the page by code, straight from the OCR boxes (two columns, paragraph breaks from the gaps between lines).
 * The AI never has to write the passage out.
 */
function passageFromBoxes(
  name: string,
  pages: number[],
  title: string,
): string[] {
  type Box = {
    top: number;
    left: number;
    bottom: number;
    right: number;
    text: string;
  };
  const clean = (t: string) =>
    FIX_POUND((NOISE ? t.replace(NOISE, "") : t).replace(WATERMARK, "")).trim();
  const lines: {
    text: string;
    col: number;
    top: number;
    bottom: number;
    right: number;
    page: number;
  }[] = [];
  let started = false;
  let later = false;
  let stop = false;
  for (const page of pages) {
    if (stop) break;
    const out = spawnSync(
      path.join(REF, "visionocr"),
      [
        "--boxes",
        path.join(REF, "pages", name, `p-${String(page).padStart(3, "0")}.png`),
      ],
      { encoding: "utf8" },
    ).stdout;
    const boxes: Box[] = out
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((l) => l.split("\t"))
      .map((c) => ({
        top: Number(c[0]),
        left: Number(c[1]),
        bottom: Number(c[2]),
        right: Number(c[3]),
        text: clean(c[4] ?? ""),
      }))
      .filter(
        (b) =>
          b.text !== "" &&
          b.top > 0.06 &&
          b.bottom < 0.935 &&
          !/^\d{1,3}$/.test(b.text) &&
          !/IELTS House|^Test \d$/i.test(b.text),
      );
    const asks = boxes.some((b) =>
      /^(Questions?\s+\d|List of Headings)/.test(b.text),
    );
    // "Passage 2 on the following pages": the questions come first, the text starts on the first page without any of them
    const following = boxes.some((b) => /following pages\.?$/i.test(b.text));
    if (following) {
      later = true;
      continue;
    }
    if (later && !started) {
      if (asks) continue;
      started = true;
    }
    let cut = 1;
    for (const b of boxes)
      if (/^Questions?\s+\d/.test(b.text) && b.top < cut) cut = b.top;
    const kept = boxes.filter((b) => b.bottom <= cut + 0.002);
    if (cut < 1 && started) stop = true;
    // two columns when most lines sit in one half of the page; a line across the middle (title, standfirst) is no body text
    const half = kept.filter((b) => b.right < 0.52 || b.left > 0.48).length;
    const twoColumns = half >= kept.length * 0.7;
    const col = (b: Box) =>
      !twoColumns
        ? 1
        : b.left < 0.48 && b.right > 0.52
          ? 0
          : b.left < 0.5
            ? 1
            : 2;
    const below = kept.find((b) => /below\.?$/i.test(b.text));
    if (below) started = true;
    if (!started) continue;
    const ordered = [...kept]
      .filter((b) => col(b) !== 0 && (!below || b.top > below.bottom))
      .sort((a, b) => col(a) - col(b) || a.top - b.top);
    for (const b of ordered) {
      lines.push({
        text: b.text,
        col: col(b),
        top: b.top,
        bottom: b.bottom,
        right: b.right,
        page,
      });
    }
  }
  const pitch = (() => {
    const gaps: number[] = [];
    for (let i = 1; i < lines.length; i++)
      if (
        lines[i].col === lines[i - 1].col &&
        lines[i].page === lines[i - 1].page
      ) {
        const g = lines[i].top - lines[i - 1].top;
        if (g > 0.005 && g < 0.05) gaps.push(g);
      }
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)] ?? 0.019;
  })();
  const colRight = (c: number) =>
    Math.max(...lines.filter((l) => l.col === c).map((l) => l.right), 0.4);
  const paragraphs: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) paragraphs.push(current.trim());
    current = "";
  };
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    if (prev) {
      const same = prev.col === l.col && prev.page === l.page;
      const bigGap =
        same &&
        l.top - prev.top > pitch * 1.45 &&
        /[.!?"'\u2019\u201d:]$/.test(prev.text);
      const shortEnd =
        /[.!?"'\u2019\u201d]$/.test(prev.text) &&
        prev.right < colRight(prev.col) - (same ? 0.1 : 0.07);
      const lettered = /^[A-J]\s+[A-Z]/.test(l.text);
      const wasLetter = /^[A-J]$/.test(prev.text);
      if (
        bigGap ||
        shortEnd ||
        lettered ||
        /^[A-J]$/.test(l.text) ||
        wasLetter
      ) {
        if (!wasLetter) flush();
      }
    }
    if (/^[A-J]$/.test(l.text)) return;
    current = current.endsWith("-") ? current + l.text : `${current} ${l.text}`;
  });
  flush();
  // a lettered passage: drop what comes before paragraph A and the letters in front of the paragraphs
  const first = paragraphs.findIndex((p) => /^A\s+[A-Z]/.test(p));
  if (first > 0 && first <= 2) paragraphs.splice(0, first);
  paragraphs.forEach((p, i) => {
    if (/^[A-J]\s+[A-Z]/.test(p)) paragraphs[i] = p.slice(2);
  });
  // a paragraph that starts in lower case goes on from the one before (a picture or a box sat in between)
  for (let i = paragraphs.length - 1; i > 0; i--)
    if (/^[a-z]/.test(paragraphs[i])) {
      paragraphs[i - 1] = `${paragraphs[i - 1]} ${paragraphs[i]}`;
      paragraphs.splice(i, 1);
    }
  const norm = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  if (paragraphs.length > 0 && norm(paragraphs[0]) === norm(title))
    paragraphs.shift();
  return paragraphs.map((p) => p.replace(/\s+/g, " "));
}

async function boxes(
  name: string,
  page: number,
): Promise<{ top: number; bottom: number; text: string }[]> {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    path.join(REF, "visionocr"),
    [
      "--boxes",
      path.join(REF, "pages", name, `p-${String(page).padStart(3, "0")}.png`),
    ],
    { encoding: "utf8" },
  );
  return result.stdout
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split("\t"))
    .map((c) => ({
      top: Number(c[0]),
      bottom: Number(c[2]),
      text: c[4] ?? "",
    }));
}

async function writingTask1(
  name: string,
  testNo: string,
  config: BookConfig,
  test: TestConfig,
  lines: Line[],
  manifest: Manifest,
  part: string,
  prefix: string,
  user: User,
): Promise<void> {
  const seg = segments(lines, /WRITING TASK 1/)[0];
  if (!seg) return void say("\n## Writing task 1: not found");
  const page = seg[0].page;
  const body = seg.map((l) => l.text);
  const startAt = body.findIndex((l) => /spend about 20 minutes/i.test(l));
  const endAt = body.findIndex((l) => /Write at least \d+ words/i.test(l));
  const prompt = body
    .slice(startAt + 1, endAt)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const minWords = Number(body[endAt]?.match(/(\d+) words/)?.[1] ?? 150);
  // The figure starts below the last line of the instruction box, or below "Write at least N words" (the OCR can lose its first letter)
  const anchors = (await boxes(name, page)).filter((b) =>
    /at least \d+ words|where relevant/i.test(b.text),
  );
  const size = readFileSync(
    path.join(REF, "pages", name, `p-${String(page).padStart(3, "0")}.png`),
  ).subarray(16, 24);
  const width = size.readUInt32BE(0);
  const height = size.readUInt32BE(4);
  const top = Math.round(
    (Math.max(0.3, ...anchors.map((b) => b.bottom)) + 0.008) * height,
  );
  const bottom = Math.round(0.915 * height);
  // Without the dark shadow of the book's spine on the left edge
  const left = Math.round(0.07 * width);
  const assetName = `${name}-t${testNo}-w1.webp`;
  manifest.assets[assetName] = {
    file: path.join(
      REF,
      "pages",
      name,
      `p-${String(page).padStart(3, "0")}.png`,
    ),
    kind: "image",
    crop: [left, top, Math.round(0.9 * width), bottom - top],
  };
  // The grader cannot see the picture: the OCR text of the figure becomes a data description for a person to check
  const figureText = body
    .slice(endAt + 1)
    .filter((l) => !/^\d{1,3}$/.test(l.trim()))
    .join("\n");
  const described = await runAIJson(
    user,
    {
      feature: FEATURE,
      timeoutMs: 120_000,
      system:
        "You describe the content of an IELTS Writing Task 1 figure from the OCR of its text, for a grader who cannot see the picture. Report only what the text supports: the title, categories and the values or labels in their order; if the OCR is too scrambled to be sure of a value, say so. Plain text, under 1500 characters.",
      messages: [
        {
          role: "user",
          content: `Task: ${prompt}\n\nOCR of the figure:\n${figureText}\n\nJSON: {"figureData":"..."}`,
        },
      ],
    },
    z.record(z.string(), z.unknown()),
  );
  manifest.items.push({
    id: `${prefix}-w1`,
    kind: "writing-prompt",
    level: config.level,
    part,
    title: `${config.title}, Test ${testNo}, Writing Task 1`,
    topic: prompt.slice(0, 60),
    payload: {
      taskType: "ielts-task1",
      title: prompt.replace(/^The /, "").slice(0, 100),
      instructions: `You should spend about 20 minutes on this task. Write at least ${minWords} words.`,
      prompt,
      minWords,
      timeMinutes: 20,
      image: {
        $asset: assetName,
        alt: `Figure for Writing Task 1: ${prompt.slice(0, 120)}`,
      },
      figureData: (typeof described.figureData === "string"
        ? described.figureData
        : JSON.stringify(described)
      ).slice(0, 2900),
    },
  });
  say(
    `\n## Writing task 1\n  prompt: ${prompt}\n  figure: page ${page}, crop from y=${top}\n  CHECK figureData against the cropped image`,
  );
  void test;
}

function writingTask2(
  testNo: string,
  config: BookConfig,
  lines: Line[],
  manifest: Manifest,
  part: string,
  prefix: string,
): void {
  const seg = segments(lines, /WRITING TASK 2/)[0];
  if (!seg) return void say("\n## Writing task 2: not found");
  const body = seg
    .map((l) => l.text)
    .filter((l) => !/^\d{1,3}$/.test(l.trim()));
  const startAt = body.findIndex((l) => /spend about 40 minutes/i.test(l));
  const endAt = body.findIndex((l) => /Write at least \d+ words/i.test(l));
  const prompt = body
    .slice(startAt + 1, endAt)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const minWords = Number(body[endAt]?.match(/(\d+) words/)?.[1] ?? 250);
  manifest.items.push({
    id: `${prefix}-w2`,
    kind: "writing-prompt",
    level: config.level,
    part,
    title: `${config.title}, Test ${testNo}, Writing Task 2`,
    topic: prompt.slice(0, 60),
    payload: {
      taskType: "ielts-task2",
      title: prompt
        .replace(/^Write about the following topic:\s*/i, "")
        .slice(0, 100),
      instructions: `You should spend about 40 minutes on this task. Write at least ${minWords} words.`,
      prompt: prompt.slice(0, 1500),
      minWords,
      timeMinutes: 40,
    },
  });
  say(`\n## Writing task 2\n  prompt: ${prompt}`);
}

async function speaking(
  name: string,
  testNo: string,
  config: BookConfig,
  test: TestConfig,
  manifest: Manifest,
  part: string,
  prefix: string,
  user: User,
): Promise<void> {
  const text = textOf(rangeLines(name, test.pages.speaking));
  const draft = await runAIJson(
    user,
    {
      feature: FEATURE,
      timeoutMs: 120_000,
      system: `You turn the Speaking page of an IELTS test (OCR text, columns can interleave) into JSON. Part 1: the topic and its example questions without the bracketed follow-ups. Part 2: the cue card sentence, the "You should say" bullets, and the closing line ("and explain ..."). Part 3: all the example questions of both discussion topics in order. Copy the wording of the book.
JSON: {"topic":"short topic of the test","part1":["..."],"part2":{"cueCard":"Describe ...","bullets":["..."],"closing":"and explain ..."},"part3":["..."]}`,
      messages: [{ role: "user", content: text }],
    },
    z.object({
      topic: z.string(),
      part1: z.array(z.string()),
      part2: z.object({
        cueCard: z.string(),
        bullets: z.array(z.string()),
        closing: z.string(),
      }),
      part3: z.array(z.string()),
    }),
  );
  const parsed = speakingIeltsGate.safeParse({
    ...draft,
    topic: draft.topic.slice(0, 80),
  });
  manifest.items.push({
    id: `${prefix}-s`,
    kind: "speaking-ielts",
    level: config.level,
    part,
    title: `${config.title}, Test ${testNo}, Speaking`,
    topic: draft.topic.slice(0, 80),
    payload: { ...draft, topic: draft.topic.slice(0, 80) },
  });
  say(
    `\n## Speaking\n  topic: ${draft.topic}; part 1: ${draft.part1.length} questions; part 3: ${draft.part3.length} questions${parsed.success ? "" : `\n  PROBLEM ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
