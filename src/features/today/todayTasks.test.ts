import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/routes';
import type { TodayTask } from '@/shared/todayApi';
import { fromToday, taskAlternative, taskKind, taskLink } from './todayTasks';

const skill = (name: 'listening' | 'writing' | 'speaking' | 'reading'): TodayTask => ({ id: `skill-${name}`, type: 'practice-skill', skill: name, minutes: 15, done: false });

describe('fromToday', () => {
  it('adds where the exercise came from and the planned minutes', () => {
    expect(fromToday('/listening/dictation', 15)).toBe('/listening/dictation?from=today&min=15');
    expect(fromToday('/x?a=1', 8)).toBe('/x?a=1&from=today&min=8');
  });
});

describe('taskLink and taskAlternative', () => {
  it('sends skills to their activity, per language', () => {
    expect(taskLink(skill('listening'), 'en')).toBe(ROUTES.DICTATION);
    expect(taskLink(skill('listening'), 'ja')).toBe(ROUTES.JA_DICTATION);
    expect(taskLink({ id: 'g', type: 'learn-grammar', pointId: 'present-simple', level: 'A1', minutes: 12, done: false }, 'en')).toBe('/grammar/present-simple');
  });

  it('offers an activity without AI instead of one that needs credits', () => {
    expect(taskAlternative(skill('writing'), 'en')).toBe(ROUTES.READING_GAPFILL);
    expect(taskAlternative(skill('speaking'), 'en')).toBe(ROUTES.DICTATION);
    expect(taskAlternative(skill('reading'), 'en')).toBeNull();
  });
});

describe('taskKind', () => {
  it('uses the skill colour for skills and neutral for vocabulary and grammar', () => {
    expect(taskKind(skill('reading'))).toEqual({ tone: 'reading', kind: 'reading' });
    expect(taskKind({ id: 'w', type: 'review-words', count: 1, minutes: 3, done: false })).toEqual({ tone: 'neutral', kind: 'vocab' });
  });
});
