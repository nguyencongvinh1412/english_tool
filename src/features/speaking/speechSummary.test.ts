import { describe, expect, it } from 'vitest';
import { issueLabel, mergeAssessments, toSpeechSummary } from './speechSummary';
import type { SpeechAssessment } from '@/shared/speechApi';

const take = (over: Partial<SpeechAssessment>): SpeechAssessment => ({
  transcript: '',
  issues: [],
  engineModel: 'gemini-3.8-flash-high',
  accuracy: 'full',
  ...over,
});

describe('mergeAssessments', () => {
  it('returns null or the only take unchanged', () => {
    expect(mergeAssessments([])).toBeNull();
    const one = take({ transcript: 'Hi' });
    expect(mergeAssessments([one])).toBe(one);
  });

  it('merges takes: issues once, weakest level, weighted rate, summed pauses', () => {
    const merged = mergeAssessments([
      take({
        transcript: 'I sink so.',
        issues: [{ word: 'think', heardAs: 'sink', sound: '/θ/', tip: 'a' }],
        overall: { pronunciation: 'good' },
        fluency: { durationSec: 10, wpm: 120, longPauses: 1, fillers: 2 },
      }),
      take({
        transcript: 'It is berry good.',
        issues: [
          { word: 'Think', heardAs: 'sink', tip: 'dup' },
          { word: 'very', heardAs: 'berry', sound: '/v/', tip: 'b' },
        ],
        overall: { pronunciation: 'needs_work' },
        fluency: { durationSec: 30, wpm: 80, longPauses: 3, fillers: 1 },
        accuracy: 'basic',
        engineModel: 'gemini-3-flash',
      }),
    ]);
    expect(merged).toEqual({
      transcript: 'I sink so. It is berry good.',
      issues: [
        { word: 'think', heardAs: 'sink', sound: '/θ/', tip: 'a' },
        { word: 'very', heardAs: 'berry', sound: '/v/', tip: 'b' },
      ],
      overall: { pronunciation: 'needs_work' },
      fluency: { durationSec: 40, wpm: 90, longPauses: 4, fillers: 3 },
      engineModel: 'gemini-3-flash',
      accuracy: 'basic',
    });
  });
});

describe('toSpeechSummary', () => {
  it('needs measured timing', () => {
    expect(toSpeechSummary(null)).toBeUndefined();
    expect(toSpeechSummary(take({ overall: { pronunciation: 'good' } }))).toBeUndefined();
  });

  it('labels issues the way the scorer reads them', () => {
    const summary = toSpeechSummary(
      take({
        issues: [{ word: 'think', heardAs: 'sink', sound: '/θ/', tip: '' }, { word: 'world', tip: '' }],
        overall: { pronunciation: 'fair' },
        fluency: { durationSec: 15.6, wpm: 132, longPauses: 2, fillers: 5 },
      })
    );
    expect(summary).toEqual({ pronunciation: 'fair', durationSec: 15.6, wpm: 132, longPauses: 2, fillers: 5, issues: ['think → sink /θ/', 'world'] });
    expect(issueLabel({ word: 'ship', sound: '/ɪ/', tip: '' })).toBe('ship /ɪ/');
  });
});
