/**
 * Cuts the sample Writing answers (a candidate's answer with its band and the examiner's comment) out of a scanned
 * Cambridge book and adds them to the manifests of its tests, so that the app can show them after a Writing task is
 * graded. The text is copied from the page by position (indented lines are the examiner's comment, the rest is the
 * answer), never rewritten. Books whose samples are handwritten scans are not supported.
 *
 *   npm run book:samples -- c13        # writes docs/reference/samples/c13.json and updates manifests c13-t1..t4
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REF = path.join(process.cwd(), "docs", "reference");
const WATERMARK =
  /FB\.com\/\S*|Fb\.com\/\S*|IELTS Quận 6\s*:|LouisQuangVo|TheIELTSFOCUS/gi;

interface Line {
  text: string;
  left: number;
  top: number;
  right: number;
  page: number;
}

export interface Sample {
  by: "candidate";
  band: number;
  text: string;
  comment: string;
}

const pageFile = (name: string, page: number) =>
  path.join(REF, "pages", name, `p-${String(page).padStart(3, "0")}.png`);

function pageLines(name: string, page: number): Line[] {
  const out = spawnSync(
    path.join(REF, "visionocr"),
    ["--boxes", pageFile(name, page)],
    { encoding: "utf8" },
  ).stdout;
  return out
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split("\t"))
    .map((c) => ({
      top: Number(c[0]),
      left: Number(c[1]),
      right: Number(c[3]),
      text: (c[4] ?? "").replace(WATERMARK, "").replace(/\s+/g, " ").trim(),
      page,
    }))
    .filter((l) => l.text !== "")
    .sort((a, b) => a.top - b.top);
}

/** Pages of the OCR text where "TEST n, WRITING TASK m" starts a sample, in book order */
function starts(name: string): { test: number; task: 1 | 2; page: number }[] {
  const found: { test: number; task: 1 | 2; page: number }[] = [];
  const dir = path.join(REF, "ocr", name);
  for (
    let page = 90;
    existsSync(path.join(dir, `p-${String(page).padStart(3, "0")}.txt`));
    page++
  ) {
    const text = readFileSync(
      path.join(dir, `p-${String(page).padStart(3, "0")}.txt`),
      "utf8",
    );
    const m = text.match(/^TEST (\d), WRITING TASK ([12])\s*$/m);
    if (
      m &&
      !found.some((f) => f.test === Number(m[1]) && f.task === Number(m[2]))
    )
      found.push({ test: Number(m[1]), task: Number(m[2]) as 1 | 2, page });
  }
  return found;
}

const DROP =
  /^(Sample (Writing )?answers|Additional sample|in Resource bank|TEST \w, WRITING|SAMPLE ANSWER|MODEL ANSWER|AFARINESH|\d{1,3}$)|IELTS House|achieved a Band|examiner'?s comment:?\s*$|^Here is the$/i;

function paragraphs(lines: Line[]): string {
  if (lines.length === 0) return "";
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++)
    if (lines[i].page === lines[i - 1].page)
      gaps.push(lines[i].top - lines[i - 1].top);
  gaps.sort((a, b) => a - b);
  const pitch = gaps[Math.floor(gaps.length / 2)] ?? 0.02;
  const right = Math.max(...lines.map((l) => l.right));
  const out: string[] = [];
  let current = "";
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    if (prev) {
      const sentenceEnd = /[.!?"')\]]$/.test(prev.text);
      const sameBlock = prev.page === l.page;
      const bigGap = sameBlock && l.top - prev.top > pitch * 1.45;
      const shortEnd =
        sentenceEnd &&
        prev.right < right - 0.075 &&
        (!sameBlock || l.top - prev.top > pitch * 1.1 || prev.right < right - 0.25);
      if ((bigGap && sentenceEnd) || shortEnd) {
        out.push(current.trim());
        current = "";
      }
    }
    current = current.endsWith("-") ? current + l.text : `${current} ${l.text}`;
  });
  out.push(current.trim());
  return out.join("\n\n");
}

function main(): void {
  const name = process.argv[2];
  if (!name) throw new Error("Usage: npm run book:samples -- <book>");
  const book = starts(name);
  if (book.length === 0) throw new Error(`No sample answers found in ${name}`);
  const result: Record<string, Sample> = {};
  book.forEach((entry, i) => {
    // The answer fills this page and goes on to the next ones until the next sample starts (at most two more pages)
    const end = Math.min(
      (book[i + 1]?.page ?? entry.page + 2) - 1,
      entry.page + 2,
    );
    const all: Line[] = [];
    let band: number | null = null;
    let marker = -1;
    for (let page = entry.page; page <= Math.max(end, entry.page); page++) {
      const lines = pageLines(name, page);
      band ??=
        Number(
          lines
            .map((l) => l.text)
            .join(" ")
            .match(/achieved a Band (\d(?:\.\d)?)/)?.[1],
        ) || null;
      for (const l of lines) {
        if (/examiner'?s comment:?\s*$/i.test(l.text) && marker < 0)
          marker = all.length;
        if (!DROP.test(l.text)) all.push(l);
      }
    }
    let answer: Line[];
    let comment: Line[];
    if (marker > 0) {
      // The answer first, then "Here is the examiner's comment:" and the comment (Cambridge 15 and 17)
      answer = all.slice(0, marker);
      comment = all.slice(marker);
    } else {
      // The comment first, indented on the first page; the answer starts at the first line that is not (Cambridge 10 and 13)
      const base = Math.min(
        ...all.filter((l) => l.page === all[0].page).map((l) => l.left),
      );
      const start = all.findIndex(
        (l) => l.page !== all[0].page || l.left <= base + 0.03,
      );
      comment = all.slice(0, start);
      answer = all.slice(start);
    }
    if (band === null)
      throw new Error(
        `${name} test ${entry.test} task ${entry.task}: no band found`,
      );
    result[`t${entry.test}-w${entry.task}`] = {
      by: "candidate",
      band,
      text: paragraphs(answer),
      comment: paragraphs(comment).replace(/\n\n/g, " "),
    };
  });
  mkdirSync(path.join(REF, "samples"), { recursive: true });
  writeFileSync(
    path.join(REF, "samples", `${name}.json`),
    JSON.stringify(result, null, 1),
  );
  for (const [key, sample] of Object.entries(result)) {
    const [, test, task] = key.match(/t(\d)-w(\d)/)!;
    const file = path.join(REF, "manifests", `${name}-t${test}.json`);
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8")) as {
      items: { id: string; payload: Record<string, unknown> }[];
    };
    const item = manifest.items.find((x) =>
      x.id.endsWith(`-t${test}-w${task}`),
    );
    if (item) item.payload.samples = [sample];
    writeFileSync(file, JSON.stringify(manifest, null, 1));
  }
  for (const [key, s] of Object.entries(result))
    console.log(
      `${key}: band ${s.band}, answer ${s.text.split(/\s+/).length} words, ${s.text.split("\n\n").length} paragraphs, comment ${s.comment.split(/\s+/).length} words`,
    );
}

main();
