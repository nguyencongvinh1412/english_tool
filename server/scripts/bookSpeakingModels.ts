/**
 * Cuts the model speaking answers out of "60 IELTS Speaking Topics Part 2 - 3" (IELTS Fighter, a PDF with a text
 * layer) into a manifest of `speaking-model` items: per topic, the questions of Parts 1 to 3 with their model answer,
 * and the vocabulary list. The text is copied by rule, never rewritten. The book has no fixed layout, so a question is
 * recognised by its shape: "Part n: ...", a "Describe ..." line, or a numbered line that ends in a question mark.
 *
 *   npm run book:speaking-models -- "/path/to/60 IELTS Speaking Topics.pdf"
 *   npm run book:import -- docs/reference/manifests/fighter-speaking.json
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const REF = path.join(process.cwd(), "docs", "reference");

interface Item {
  part: 1 | 2 | 3;
  question: string;
  answer: string;
}
interface Topic {
  no: number;
  group: string;
  topic: string;
  items: Item[];
  vocab: string[];
}

const NOISE =
  /Tài Liệu Ôn Thi|IELTS Fighter -|Website:|Fanpage:|^\s*Group:|TaiLieu|^\s*60 IELTS Speaking Topics Part 2|\bTA\s+\d{1,3}\s*$/;
const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

function clean(raw: string[]): string[] {
  return raw
    .filter(
      (l) => !NOISE.test(l) && !/^\s*[A-Z.]{1,3}\s*$/.test(l) && !/^\f/.test(l),
    )
    .map((l) =>
      l
        .replace(/\f/g, "")
        .replace(/\s{4,}[A-Z.]{1,3}\s*$/, "")
        .trim(),
    );
}

/** A question loses its Vietnamese gloss, which sits in brackets and may wrap onto the next line */
const stripGloss = (text: string): string =>
  text
    .replace(/\s*\([^()]*$/u, (m) => (VIETNAMESE.test(m) ? "" : m))
    .replace(/\s*\([^()]*\)\s*/gu, (m) => (VIETNAMESE.test(m) ? " " : m))
    .replace(/\s+/g, " ")
    .trim();

const isGroup = (l: string) => /^\d{1,2}\.\s+[A-Z][A-Z &/,'’-]{2,}$/.test(l);
const isVocabHead = (l: string) =>
  /^(từ vựng|vocabulary|từ vựng hay)\s*:?\s*$/i.test(l);

function parse(lines: string[]): Topic[] {
  const topics: Topic[] = [];
  let topic: Topic | null = null;
  let part: 1 | 2 | 3 = 1;
  let current: Item | null = null;
  let mode: "answer" | "vocab" | "title" = "answer";
  let pending: {
    part: 1 | 2 | 3;
    text: string;
    expect: "?" | "." | ")";
  } | null = null;
  const finish = () => {
    if (topic && current) topic.items.push(current);
    current = null;
  };
  const startQuestion = (p: 1 | 2 | 3, text: string) => {
    finish();
    current = { part: p, question: text, answer: "" };
    mode = "answer";
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l === "") continue;
    if (isGroup(l)) {
      finish();
      const no = Number(l.match(/^\d+/)![0]);
      topic = {
        no,
        group: l.replace(/^\d+\.\s+/, ""),
        topic: "",
        items: [],
        vocab: [],
      };
      topics.push(topic);
      part = 1;
      mode = "title";
      pending = null;
      continue;
    }
    if (!topic) continue;
    // A question that wraps over lines: keep reading until it ends
    if (pending) {
      if (/part\s*[123]\s*:?\s*$/i.test(l) || isVocabHead(l) || isGroup(l)) {
        startQuestion(pending.part, stripGloss(pending.text));
        pending = null;
        i--;
        continue;
      }
      pending.text += ` ${l}`;
      const done =
        pending.expect === "?"
          ? /\?\s*(\(|$)/.test(l) || /\?$/.test(l)
          : /[.)]$/.test(l);
      if (done || pending.text.length > 400) {
        startQuestion(pending.part, stripGloss(pending.text));
        pending = null;
      }
      continue;
    }
    const topicLine = l.match(/^Topic:\s*(.+)$/i);
    if (topicLine) {
      topic.topic ||= topicLine[1].replace(/\.$/, "");
      continue;
    }
    if (isVocabHead(l)) {
      finish();
      mode = "vocab";
      continue;
    }
    const partOnly = l.match(
      /(?:^|\s)(?:IELTS Speaking )?part\s*([123])\s*:?\s*$/i,
    );
    if (partOnly && l.length < 80 && !/^\d+\./.test(l)) {
      part = Number(partOnly[1]) as 1 | 2 | 3;
      finish();
      mode = "answer";
      continue;
    }
    // "Part 1: Do you ...?" and "Part 2: Describe ..." on one line
    const inline = l.match(/^part\s*([123])\s*:\s*(.+)$/i);
    if (inline) {
      part = Number(inline[1]) as 1 | 2 | 3;
      const text = inline[2];
      if (/\?\s*(\(|$)/.test(text) || (part === 2 && /[.)]$/.test(text)))
        startQuestion(part, stripGloss(text));
      else pending = { part, text, expect: part === 2 ? "." : "?" };
      continue;
    }
    if (/^Describe\b/i.test(l)) {
      part = 2;
      if (/[.)]$/.test(l)) startQuestion(2, stripGloss(l));
      else pending = { part: 2, text: l, expect: "." };
      continue;
    }
    const numbered = l.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (numbered) {
      const text = numbered[2];
      const question = /\?\s*(\(|$)/.test(text);
      const opening =
        mode !== "vocab" &&
        text.length > 25 &&
        !/\):/.test(text) &&
        /^[A-Z]/.test(text) &&
        !/[.]$/.test(text);
      if (question) {
        startQuestion(part, stripGloss(text));
        continue;
      }
      if (opening) {
        pending = { part, text, expect: "?" };
        continue;
      }
    }
    if (mode === "vocab") {
      const entry = l.match(/^(?:\d{1,2}[.)]|[-•])\s+(.+)$/);
      if (entry) topic.vocab.push(entry[1]);
      else if (
        topic.vocab.length > 0 &&
        l.length < 110 &&
        !/SAMPLE|QUESTION/.test(l) &&
        topic.vocab[topic.vocab.length - 1].length < 260
      )
        topic.vocab[topic.vocab.length - 1] += ` ${l}`;
      continue;
    }
    if (mode === "title") continue;
    if (current)
      (current as Item).answer += `${(current as Item).answer ? " " : ""}${l}`;
  }
  finish();
  return topics;
}

function main(): void {
  const pdf = process.argv[2];
  if (!pdf) throw new Error('Usage: npm run book:speaking-models -- "<pdf>"');
  const text = spawnSync("pdftotext", ["-layout", pdf, "-"], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  }).stdout;
  const lines = clean(text.split("\n"));
  const topics = parse(lines).filter((t) => t.items.length > 0);
  const items = topics.flatMap((t) => {
    const kept = t.items
      .map((i) => ({ ...i, answer: i.answer.replace(/\s+/g, " ").trim() }))
      .filter((i) => i.question.length >= 8 && i.answer.split(" ").length >= 15)
      .map((i) => ({
        ...i,
        question: i.question.slice(0, 400),
        answer: i.answer.slice(0, 6000),
      }));
    if (kept.length === 0) return [];
    const pretty = t.group
      .toLowerCase()
      .replace(
        /(^|[ /&-])([a-z])/g,
        (_m, a: string, b: string) => a + b.toUpperCase(),
      );
    const name = (
      t.topic && t.topic.length < 60 && !/^Describe/i.test(t.topic)
        ? `${pretty}: ${t.topic}`
        : pretty
    ).slice(0, 120);
    return [
      {
        id: `book-fighter-speaking-${String(t.no).padStart(2, "0")}`,
        kind: "speaking-model",
        level: "B2",
        part: "book:fighter-speaking",
        title: `${t.group}: ${name}`.slice(0, 160),
        topic: name,
        payload: {
          group: t.group
            .toLowerCase()
            .replace(
              /(^|[ /&-])([a-z])/g,
              (_m, a: string, b: string) => a + b.toUpperCase(),
            ),
          topic: name,
          items: kept.slice(0, 40),
          vocab: t.vocab.map((v) => v.slice(0, 200)).slice(0, 80),
        },
      },
    ];
  });
  mkdirSync(path.join(REF, "manifests"), { recursive: true });
  writeFileSync(
    path.join(REF, "manifests", "fighter-speaking.json"),
    JSON.stringify({ assets: {}, items }, null, 1),
  );
  for (const item of items) {
    const p = item.payload;
    const count = (n: number) => p.items.filter((x) => x.part === n).length;
    console.log(
      `${item.id} ${p.group} / ${p.topic.slice(0, 40)}: P1 ${count(1)} P2 ${count(2)} P3 ${count(3)} vocab ${p.vocab.length}`,
    );
  }
  console.log(`${items.length} topics`);
}

main();
