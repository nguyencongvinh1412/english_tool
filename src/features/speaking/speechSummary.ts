/**
 * Combining speech-check results
 * A learner may record one answer in several takes; each take is checked on its own and merged here.
 */
import type { PronunciationLevel, SpeechAssessment, SpeechIssue, SpeechSummary } from '@/shared/speechApi';

const MAX_ISSUES = 8;
const LEVEL_RANK: Record<PronunciationLevel, number> = { good: 0, fair: 1, needs_work: 2 };

/** Lower-case words without punctuation (same rule as the server's evidence check) */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((token) => token.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

/** "think → sink /θ/" */
export const issueLabel = (issue: SpeechIssue): string =>
  [issue.word, issue.heardAs && `→ ${issue.heardAs}`, issue.sound].filter(Boolean).join(' ');

/**
 * Merges the takes of one answer: issues once per word, the weakest pronunciation level,
 * total time and pauses, speaking rate weighted by duration
 * @returns null when there is nothing to merge
 */
export function mergeAssessments(list: SpeechAssessment[]): SpeechAssessment | null {
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  const seen = new Set<string>();
  const issues: SpeechIssue[] = [];
  for (const issue of list.flatMap((a) => a.issues)) {
    const key = issue.word.toLowerCase();
    if (seen.has(key) || issues.length === MAX_ISSUES) continue;
    seen.add(key);
    issues.push(issue);
  }

  const levels = list.map((a) => a.overall?.pronunciation).filter((l): l is PronunciationLevel => !!l);
  const worst = levels.sort((a, b) => LEVEL_RANK[b] - LEVEL_RANK[a])[0];
  const timed = list.map((a) => a.fluency).filter((f): f is NonNullable<SpeechAssessment['fluency']> => !!f);
  const totalSec = timed.reduce((sum, f) => sum + f.durationSec, 0);

  return {
    transcript: list.map((a) => a.transcript).join(' '),
    issues,
    ...(worst && { overall: { pronunciation: worst } }),
    ...(timed.length && {
      fluency: {
        durationSec: Math.round(totalSec * 10) / 10,
        wpm: totalSec > 0 ? Math.round(timed.reduce((sum, f) => sum + f.wpm * f.durationSec, 0) / totalSec) : 0,
        longPauses: timed.reduce((sum, f) => sum + f.longPauses, 0),
        fillers: timed.reduce((sum, f) => sum + f.fillers, 0),
      },
    }),
    engineModel: list[list.length - 1].engineModel,
    accuracy: list.some((a) => a.accuracy === 'basic') ? 'basic' : 'full',
  };
}

/** What the band scorer gets for one answer; only answers with measured timing have one */
export function toSpeechSummary(assessment: SpeechAssessment | null): SpeechSummary | undefined {
  if (!assessment?.fluency) return undefined;
  const { durationSec, wpm, longPauses, fillers } = assessment.fluency;
  return {
    ...(assessment.overall && { pronunciation: assessment.overall.pronunciation }),
    durationSec,
    wpm: Math.min(400, wpm),
    longPauses: Math.min(200, longPauses),
    fillers: Math.min(200, fillers),
    issues: assessment.issues.slice(0, MAX_ISSUES).map((i) => issueLabel(i).slice(0, 80)),
  };
}
