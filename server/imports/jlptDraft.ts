/**
 * JLPT Import Draft
 * Merges the AI's extraction into one reviewable group per 問題 (per text for reading),
 * lists problems for the admin, and turns finished groups into payloads the JLPT engine accepts
 */
import { MONDAI, MONDAI_JA, MONDAI_SECTION, jlptImportSchema, type Mondai } from '../exams/jlpt.js';
import type { DraftIssue, DraftRecording } from './draft.js';
import type { ParsedJlptTest, RawJlptGroup, RawJlptTranscript } from './jlptParse.js';

export interface JlptDraftGroup {
  /** Stable id within the draft: "<mondai>:<first number>" */
  key: string;
  mondai: Mondai;
  numbers: [number, number];
  payload: Record<string, unknown>;
  /** Page with each question's picture, for cropping */
  photoPages?: Record<string, number>;
  issues: DraftIssue[];
}

export interface JlptDraft {
  groups: JlptDraftGroup[];
  recordings?: DraftRecording[];
}

type Item = Record<string, unknown>;

const isListening = (mondai: Mondai) => MONDAI_SECTION[mondai] === 'listening';
const optionCount = (mondai: Mondai) => (mondai === 'listen-expression' || mondai === 'listen-response' ? 3 : 4);

/** Default explanation from the answer key; replaced when the admin changes the answer */
export const keyExplanation = (answer: number | undefined) =>
  answer === undefined
    ? { vi: 'Sách không có đáp án cho câu này.', en: 'Answer missing from the key.' }
    : { vi: `Đáp án theo sách: ${answer + 1}`, en: `Answer key: ${answer + 1}` };

/**
 * Speakers of a listening group: women read as A, men as B, as in most JLPT scripts
 */
function speakerKey(label: string): 'A' | 'B' {
  return /男|^m/i.test(label.trim()) ? 'B' : 'A';
}

/**
 * Builds the reviewable draft from the AI's extraction
 */
export function buildJlptDraft(parsed: ParsedJlptTest): JlptDraft {
  const answerOf = (mondai: Mondai, n: number) => {
    const entry = parsed.answers.find((a) => a.mondai === mondai && a.number === n);
    return entry ? entry.answer - 1 : undefined;
  };
  const transcriptOf = (mondai: Mondai, n: number): RawJlptTranscript | undefined => parsed.transcripts.find((t) => t.mondai === mondai && t.number === n);

  // Questions by type and number; later chunks only fill gaps
  const questions = new Map<string, RawJlptGroup['questions'][number]>();
  const pictures = new Map<string, number>();
  for (const group of parsed.groups) {
    for (const q of group.questions) {
      const key = `${group.mondai}:${q.number}`;
      const existing = questions.get(key);
      if (!existing || existing.options.length < q.options.length || (!existing.prompt && q.prompt)) questions.set(key, q);
    }
    for (const p of group.picturePages ?? []) pictures.set(`${group.mondai}:${p.number}`, p.page);
  }

  const mcq = (mondai: Mondai, n: number) => {
    const q = questions.get(`${mondai}:${n}`);
    const answer = answerOf(mondai, n);
    return { number: n, prompt: q?.prompt ?? '', options: q?.options ?? [], answerIndex: answer ?? -1, explanation: keyExplanation(answer) };
  };
  const photoPagesFor = (mondai: Mondai, numbers: number[]) => {
    const entries = numbers.flatMap((n) => (pictures.has(`${mondai}:${n}`) ? [[String(n), pictures.get(`${mondai}:${n}`)!] as const] : []));
    return entries.length ? Object.fromEntries(entries) : undefined;
  };

  const groups: JlptDraftGroup[] = [];
  for (const mondai of MONDAI) {
    const raw = parsed.groups.filter((g) => g.mondai === mondai);
    const numbersOfType = [
      ...new Set([
        ...[...questions.keys()].filter((k) => k.startsWith(`${mondai}:`)).map((k) => Number(k.split(':')[1])),
        ...parsed.transcripts.filter((t) => t.mondai === mondai).map((t) => t.number),
      ]),
    ].sort((a, b) => a - b);
    if (numbersOfType.length === 0) continue;

    if (isListening(mondai)) {
      groups.push({
        key: `${mondai}:${numbersOfType[0]}`,
        mondai,
        numbers: [numbersOfType[0], numbersOfType.at(-1)!],
        photoPages: photoPagesFor(mondai, numbersOfType),
        payload: {
          speakers: { A: { name: '女の人', gender: 'female' }, B: { name: '男の人', gender: 'male' } },
          items: numbersOfType.map((n) => {
            const transcript = transcriptOf(mondai, n);
            const printed = questions.get(`${mondai}:${n}`)?.options ?? [];
            const answer = answerOf(mondai, n);
            return {
              number: n,
              script: (transcript?.lines ?? []).map((line) => ({ speaker: speakerKey(line.speaker), text: line.text })),
              ...(transcript?.question && { question: transcript.question }),
              options: printed.length ? printed : (transcript?.options ?? []),
              answerIndex: answer ?? -1,
              explanation: keyExplanation(answer),
              imageAssetId: null,
            };
          }),
        },
        issues: [],
      });
      continue;
    }

    const perText = MONDAI_SECTION[mondai] === 'reading' || mondai === 'text-grammar';
    if (perText) {
      // One group per text, de-duplicated by its first question
      const byStart = new Map<number, RawJlptGroup>();
      for (const group of raw) {
        const existing = byStart.get(group.numbers[0]);
        const length = (g: RawJlptGroup) => (g.passages ?? []).reduce((sum, p) => sum + p.text.length, 0);
        if (!existing || length(group) > length(existing)) byStart.set(group.numbers[0], group);
      }
      for (const group of [...byStart.values()].sort((a, b) => a.numbers[0] - b.numbers[0])) {
        const numbers = numbersIn(group.numbers);
        groups.push({
          key: `${mondai}:${group.numbers[0]}`,
          mondai,
          numbers: group.numbers,
          photoPages: photoPagesFor(mondai, numbers),
          payload: { passages: group.passages ?? [], questions: numbers.map((n) => mcq(mondai, n)) },
          issues: [],
        });
      }
    } else {
      groups.push({
        key: `${mondai}:${numbersOfType[0]}`,
        mondai,
        numbers: [numbersOfType[0], numbersOfType.at(-1)!],
        photoPages: photoPagesFor(mondai, numbersOfType),
        payload: { questions: numbersOfType.map((n) => mcq(mondai, n)) },
        issues: [],
      });
    }
  }
  return withJlptIssues({ groups });
}

/**
 * Inclusive list of numbers
 */
function numbersIn([from, to]: [number, number]): number[] {
  return Array.from({ length: Math.max(0, Math.min(to, from + 40) - from + 1) }, (_, i) => from + i);
}

/**
 * Problems in one group; errors block publishing, warnings do not
 */
export function jlptGroupIssues(group: JlptDraftGroup): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const error = (code: string, message: string) => issues.push({ level: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message });
  const payload = group.payload;
  const listening = isListening(group.mondai);
  const entries = ((listening ? payload.items : payload.questions) ?? []) as Item[];
  const options = optionCount(group.mondai);

  const noAnswer = entries.filter((q) => typeof q.answerIndex !== 'number' || (q.answerIndex as number) < 0);
  if (noAnswer.length) error('missing_answer', `${noAnswer.length} question(s) have no answer.`);
  const badOptions = entries.filter((q) => (q.options as string[] | undefined)?.filter((o) => o.trim()).length !== options);
  if (badOptions.length) error('bad_options', `${badOptions.length} question(s) need ${options} options.`);

  // Options printed as pictures ("1"-"4") need the picture
  const needsPicture = entries.filter((q) => (q.options as string[] | undefined)?.every((o) => /^\s*[1-4１-４]?\s*$/.test(o)) && !q.imageAssetId);
  if (needsPicture.length && !badOptions.length) error('needs_photo', `${needsPicture.length} picture(s) to crop.`);
  else if (group.photoPages && entries.some((q) => !q.imageAssetId && group.photoPages![String(q.number)])) warn('picture', 'Some questions have a picture in the book that is not cropped yet.');

  if (listening) {
    const hasAudio = Boolean(payload.audio);
    const noScript = entries.filter((i) => !(i.script as unknown[] | undefined)?.length && !i.situation);
    if (!hasAudio && noScript.length) error('needs_audio_or_transcript', 'Attach the audio, or add the scripts.');
    else if (!hasAudio) warn('no_audio', 'No recording attached; the voice service will read the scripts.');
  }
  return issues;
}

/**
 * Recomputes every group's issues, including what the JLPT schema rejects
 */
export function withJlptIssues(draft: JlptDraft): JlptDraft {
  return {
    ...draft,
    groups: draft.groups.map((group) => {
      const issues = jlptGroupIssues(group);
      if (!issues.some((i) => i.level === 'error')) {
        const result = finalizeJlptPayload(group);
        if (!result.ok) issues.push({ level: 'error', code: 'invalid', message: result.problem });
      }
      return { ...group, issues };
    }),
  };
}

/**
 * Exam payload for a finished group, or the schema problem
 */
export function finalizeJlptPayload(group: JlptDraftGroup): { ok: true; payload: unknown } | { ok: false; problem: string } {
  const payload = structuredClone(group.payload);
  for (const entry of ((payload.items ?? payload.questions ?? []) as Item[])) {
    delete entry.number;
    if (!entry.imageAssetId) delete entry.imageAssetId;
    if (!entry.question) delete entry.question;
    if (!entry.situation) delete entry.situation;
  }
  for (const passage of (payload.passages ?? []) as Item[]) {
    if (!passage.imageAssetId) delete passage.imageAssetId;
    if (!passage.label) delete passage.label;
    if (!passage.title) delete passage.title;
  }
  const result = jlptImportSchema(group.mondai).safeParse(payload);
  if (result.success) return { ok: true, payload: result.data };
  const issue = result.error.issues[0];
  return { ok: false, problem: `${MONDAI_JA[group.mondai]} (${group.numbers[0]}-${group.numbers[1]}): ${issue.path.join('.')} ${issue.message}` };
}
