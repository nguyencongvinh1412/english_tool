/**
 * Import Draft
 * Merges the AI's raw extraction into reviewable groups, lists problems for the admin,
 * and turns finished groups into payloads that pass the exam schemas
 */
import { ALL_PARTS, PART_CONFIG, importPartSchema, type ToeicPart } from '../exams/toeic.js';
import type { ParsedTest, RawGroup, RawTranscript } from './parse.js';

export interface DraftIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface DraftGroup {
  /** Stable id within the draft (first question number) */
  key: string;
  part: ToeicPart;
  numbers: [number, number];
  /** Payload in exam shape; may be incomplete until the admin fixes the issues */
  payload: Record<string, unknown>;
  /** Part 1: page with each question's photo, for cropping */
  photoPages?: Record<string, number>;
  issues: DraftIssue[];
}

/** Uploaded listening audio the admin can attach to groups */
export interface DraftRecording {
  assetId: string;
  name: string;
}

export interface Draft {
  groups: DraftGroup[];
  recordings?: DraftRecording[];
}

/** Official question numbers per part */
const PART_RANGES: Record<ToeicPart, [number, number]> = {
  1: [1, 6],
  2: [7, 31],
  3: [32, 70],
  4: [71, 100],
  5: [101, 130],
  6: [131, 146],
  7: [147, 200],
};

const LETTER_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
const LETTERS = ['A', 'B', 'C', 'D'];
/** Part 5 groups hold this many sentences, like AI-generated ones */
const P5_GROUP_SIZE = 10;

/**
 * Normalizes printed blanks ("-------", "_____", "(.....)") to "____"
 */
function normalizeBlank(prompt: string): string {
  return prompt.replace(/[-_.…]{3,}|\(\s*\.{3,}\s*\)/g, '____');
}

function explanationFor(answer: number | undefined): string {
  return answer === undefined ? 'Answer missing from the key.' : `Answer key: (${LETTERS[answer]}).`;
}

/**
 * Raw questions de-duplicated by number (later chunks only fill gaps)
 */
function questionsByNumber(groups: RawGroup[]): Map<number, RawGroup['questions'][number]> {
  const byNumber = new Map<number, RawGroup['questions'][number]>();
  for (const group of groups) {
    for (const q of group.questions) {
      const existing = byNumber.get(q.number);
      if (!existing || (existing.options.length < q.options.length && q.options.length <= 4)) byNumber.set(q.number, q);
    }
  }
  return byNumber;
}

/**
 * Groups of one part, de-duplicated by their first question number
 */
function uniqueGroups(groups: RawGroup[], part: number): RawGroup[] {
  const byStart = new Map<number, RawGroup>();
  for (const group of groups.filter((g) => g.part === part)) {
    const existing = byStart.get(group.numbers[0]);
    if (!existing || group.questions.length > existing.questions.length) byStart.set(group.numbers[0], group);
  }
  return [...byStart.values()].sort((a, b) => a.numbers[0] - b.numbers[0]);
}

/**
 * Speakers and script for a Part 3/4 transcript entry
 */
function scriptFrom(entry: RawTranscript | undefined) {
  if (!entry?.lines?.length) return null;
  const keys = new Map<string, 'A' | 'B' | 'C'>();
  const speakers: Record<string, { name: string; gender: 'female' | 'male' }> = {};
  for (const line of entry.lines) {
    if (keys.has(line.speaker) || keys.size >= 3) continue;
    const key = (['A', 'B', 'C'] as const)[keys.size];
    keys.set(line.speaker, key);
    const label = line.speaker.trim();
    // Books mark speakers as "M"/"W" (man/woman) or "M-Au", "W-Br"
    const gender = /^w/i.test(label) ? 'female' : /^m/i.test(label) ? 'male' : keys.size % 2 ? 'female' : 'male';
    speakers[key] = { name: label.length <= 3 ? (gender === 'female' ? 'Woman' : 'Man') : label, gender };
  }
  return {
    speakers,
    script: entry.lines.map((line) => ({ speaker: keys.get(line.speaker) ?? 'A', text: line.text })),
  };
}

/**
 * Builds the reviewable draft from the AI's extraction
 */
export function buildDraft(parsed: ParsedTest): Draft {
  const answerOf = (n: number): number | undefined => LETTER_INDEX[parsed.answers[String(n)] ?? ''];
  const questions = questionsByNumber(parsed.groups);
  const transcriptFor = (part: number, n: number) => parsed.transcripts.find((t) => t.part === part && t.numbers[0] <= n && n <= t.numbers[1]);
  const groups: DraftGroup[] = [];

  const mcq = (n: number) => {
    const q = questions.get(n);
    const answer = answerOf(n);
    return {
      type: 'mcq',
      prompt: normalizeBlank(q?.prompt ?? ''),
      options: q?.options ?? [],
      answerIndex: answer ?? -1,
      explanation: explanationFor(answer),
    };
  };

  // Part 1: one group with every photo question
  const p1Raw = parsed.groups.filter((g) => g.part === 1);
  const p1Numbers = rangeOf(p1Raw, parsed.transcripts, 1);
  if (p1Numbers) {
    const photoPages = Object.fromEntries(p1Raw.flatMap((g) => g.photoPages ?? []).map((p) => [String(p.number), p.page]));
    groups.push({
      key: `${p1Numbers[0]}`,
      part: 1,
      numbers: p1Numbers,
      photoPages,
      payload: {
        items: numbersIn(p1Numbers).map((n) => ({
          number: n,
          imageAssetId: null,
          statements: transcriptFor(1, n)?.statements ?? [],
          answerIndex: answerOf(n) ?? -1,
          explanation: explanationFor(answerOf(n)),
        })),
      },
      issues: [],
    });
  }

  // Part 2: one group with all question-response items
  const p2Numbers = rangeOf(parsed.groups.filter((g) => g.part === 2), parsed.transcripts, 2);
  if (p2Numbers) {
    groups.push({
      key: `${p2Numbers[0]}`,
      part: 2,
      numbers: p2Numbers,
      payload: {
        items: numbersIn(p2Numbers).map((n) => {
          const transcript = transcriptFor(2, n);
          return {
            number: n,
            question: transcript?.question ?? '',
            options: transcript?.options ?? [],
            answerIndex: answerOf(n) ?? -1,
            explanation: explanationFor(answerOf(n)),
          };
        }),
      },
      issues: [],
    });
  }

  // Parts 3 and 4: one group per conversation or talk
  for (const part of [3, 4] as const) {
    for (const raw of uniqueGroups(parsed.groups, part)) {
      const script = scriptFrom(transcriptFor(part, raw.numbers[0]));
      groups.push({
        key: `${raw.numbers[0]}`,
        part,
        numbers: raw.numbers,
        payload: {
          ...(part === 4 && { talkType: 'talk' }),
          speakers: script?.speakers ?? (part === 4 ? { A: { name: 'Speaker', gender: 'female' } } : { A: { name: 'Woman', gender: 'female' }, B: { name: 'Man', gender: 'male' } }),
          script: part === 4 ? (script?.script.map((l) => ({ ...l, speaker: 'A' })) ?? []) : (script?.script ?? []),
          ...(raw.passage && { graphic: raw.passage }),
          questions: numbersIn(raw.numbers).map(mcq),
        },
        issues: [],
      });
    }
  }

  // Part 5: sentences in groups of ten
  const p5Numbers = [...questions.keys()].filter((n) => n >= PART_RANGES[5][0] && n <= PART_RANGES[5][1]).sort((a, b) => a - b);
  for (let i = 0; i < p5Numbers.length; i += P5_GROUP_SIZE) {
    const chunk = p5Numbers.slice(i, i + P5_GROUP_SIZE);
    groups.push({
      key: `${chunk[0]}`,
      part: 5,
      numbers: [chunk[0], chunk[chunk.length - 1]],
      payload: { questions: chunk.map(mcq) },
      issues: [],
    });
  }

  // Part 6: one group per text
  for (const raw of uniqueGroups(parsed.groups, 6)) {
    groups.push({
      key: `${raw.numbers[0]}`,
      part: 6,
      numbers: raw.numbers,
      payload: {
        title: raw.title ?? 'Text completion',
        passage: raw.passage ?? '',
        questions: numbersIn(raw.numbers).map((n, i) => ({ ...mcq(n), prompt: `Blank [${i + 1}]` })),
      },
      issues: [],
    });
  }

  // Part 7: one group per reading set
  for (const raw of uniqueGroups(parsed.groups, 7)) {
    groups.push({
      key: `${raw.numbers[0]}`,
      part: 7,
      numbers: raw.numbers,
      payload: { passages: raw.passages ?? [], questions: numbersIn(raw.numbers).map(mcq) },
      issues: [],
    });
  }

  groups.sort((a, b) => a.part - b.part || a.numbers[0] - b.numbers[0]);
  return withIssues({ groups });
}

/**
 * Inclusive list of numbers
 */
function numbersIn([from, to]: [number, number]): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

/**
 * Number range of a single-group part from extraction and transcripts
 */
function rangeOf(groups: RawGroup[], transcripts: RawTranscript[], part: number): [number, number] | null {
  const numbers = [
    ...groups.flatMap((g) => numbersIn(g.numbers)),
    ...transcripts.filter((t) => t.part === part).flatMap((t) => numbersIn(t.numbers)),
  ].filter((n) => n >= PART_RANGES[part as ToeicPart][0] && n <= PART_RANGES[part as ToeicPart][1]);
  if (numbers.length === 0) return null;
  return [Math.min(...numbers), Math.max(...numbers)];
}

type Item = Record<string, unknown>;

/**
 * Problems in one group; errors block publishing, warnings do not
 */
export function groupIssues(group: DraftGroup): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const payload = group.payload;
  const hasAudio = Boolean(payload.audio);
  const error = (code: string, message: string) => issues.push({ level: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message });

  const items = (payload.items ?? payload.questions ?? []) as Item[];
  const missingAnswers = items.filter((q) => typeof q.answerIndex !== 'number' || (q.answerIndex as number) < 0);
  if (missingAnswers.length) error('missing_answer', `${missingAnswers.length} question(s) have no answer.`);

  if (group.part === 1) {
    const noPhoto = items.filter((i) => !i.imageAssetId).length;
    if (noPhoto) error('needs_photo', `${noPhoto} photo(s) to crop.`);
    if (!hasAudio && items.some((i) => (i.statements as string[] | undefined)?.length !== 4)) {
      error('needs_audio_or_transcript', 'Attach the audio, or add the four statements from the transcript.');
    }
  } else if (group.part === 2) {
    if (!hasAudio && items.some((i) => !i.question || (i.options as string[] | undefined)?.length !== 3)) {
      error('needs_audio_or_transcript', 'Attach the audio, or add questions and responses from the transcript.');
    }
  } else if (group.part === 3 || group.part === 4) {
    if (!hasAudio && !(payload.script as unknown[] | undefined)?.length) error('needs_audio_or_transcript', 'Attach the audio or the transcript.');
    else if (!hasAudio) warn('no_audio', 'No recording attached; the voice service will read the transcript.');
  }

  if (group.part >= 3) {
    const badOptions = items.filter((q) => (q.options as string[] | undefined)?.length !== 4 || (q.options as string[]).some((o) => !o.trim()));
    if (badOptions.length) error('bad_options', `${badOptions.length} question(s) do not have four options.`);
    const noPrompt = items.filter((q) => !String(q.prompt ?? '').trim());
    if (noPrompt.length && group.part !== 6) error('missing_prompt', `${noPrompt.length} question(s) have no question text.`);
  }
  if (group.part === 5 && items.some((q) => !String(q.prompt).includes('____'))) error('missing_blank', 'Some sentences have no "____" blank.');
  if (group.part === 6 && ![1, 2, 3, 4].every((n) => String(payload.passage ?? '').includes(`[${n}]`))) {
    error('missing_blank', 'The text needs blanks [1] to [4].');
  }
  if (group.part === 7 && !(payload.passages as unknown[] | undefined)?.length) error('missing_passage', 'The reading text is missing.');

  return issues;
}

/**
 * Recomputes every group's issues and adds coverage warnings
 */
export function withIssues(draft: Draft): Draft {
  return {
    ...draft,
    groups: draft.groups.map((group) => {
      const issues = groupIssues(group);
      // Anything else the exam schema rejects (lengths, empty fields) shows up before publishing
      if (!issues.some((i) => i.level === 'error')) {
        const result = finalizePayload(group);
        if (!result.ok) issues.push({ level: 'error', code: 'invalid', message: result.problem });
      }
      const [from, to] = PART_RANGES[group.part];
      if (group.numbers[0] < from || group.numbers[1] > to) {
        issues.push({ level: 'warning', code: 'unusual_numbers', message: `Numbers ${group.numbers[0]}-${group.numbers[1]} are outside Part ${group.part} (${from}-${to}).` });
      }
      return { ...group, issues };
    }),
  };
}

/**
 * Parts whose official question numbers are not all present
 */
export function coverage(draft: Draft): { part: ToeicPart; missing: number[] }[] {
  return ALL_PARTS.map((part) => {
    const found = new Set(draft.groups.filter((g) => g.part === part).flatMap((g) => numbersIn(g.numbers)));
    const missing = numbersIn(PART_RANGES[part]).filter((n) => !found.has(n));
    return { part, missing };
  }).filter((entry) => entry.missing.length > 0 && entry.missing.length < PART_CONFIG[entry.part].officialQuestions);
}

/**
 * Exam payload for a finished group, or the schema problem
 */
export function finalizePayload(group: DraftGroup): { ok: true; payload: unknown } | { ok: false; problem: string } {
  const payload = structuredClone(group.payload);
  const hasAudio = Boolean(payload.audio);
  const items = (payload.items ?? []) as Item[];

  // Spoken text hidden behind a real recording may be missing from the book; fill neutral labels for the review
  if (group.part === 1 && hasAudio) {
    for (const item of items) {
      if ((item.statements as string[] | undefined)?.length !== 4) item.statements = LETTERS.map((l) => `Statement (${l})`);
    }
  }
  if (group.part === 2 && hasAudio) {
    for (const item of items) {
      if (!item.question) item.question = `Question ${item.number}`;
      if ((item.options as string[] | undefined)?.length !== 3) item.options = ['Response (A)', 'Response (B)', 'Response (C)'];
    }
  }
  for (const item of items) delete item.number;

  // Books often print a passage without a heading
  if (group.part === 7) {
    for (const passage of (payload.passages ?? []) as { kind?: string; title?: string }[]) {
      if (!passage.title?.trim()) passage.title = passage.kind ? passage.kind[0].toUpperCase() + passage.kind.slice(1) : 'Text';
    }
  }

  const result = importPartSchema(group.part).safeParse(payload);
  if (result.success) return { ok: true, payload: result.data };
  const issue = result.error.issues[0];
  return { ok: false, problem: `Part ${group.part} (${group.numbers[0]}-${group.numbers[1]}): ${issue.path.join('.')} ${issue.message}` };
}
