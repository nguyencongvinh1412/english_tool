import { describe, expect, it } from 'vitest';
import type { GrammarMap, GrammarMapPoint } from '@/shared/grammarApi';
import { mentionAt, searchPoints } from './grammarMentions';

const point = (id: string, en: string, vi: string, cluster = 'tenses'): GrammarMapPoint => ({
  id,
  cluster,
  title: { en, vi },
  cefr: 'A2',
  hasTimeline: false,
  ready: true,
  status: 'draft',
  summary: null,
  signals: [],
});

const map: GrammarMap = {
  clusters: [
    { id: 'tenses', title: { en: 'Tenses', vi: 'Thì' } },
    { id: 'modals', title: { en: 'Modal verbs', vi: 'Động từ khuyết thiếu' } },
  ],
  points: [
    point('present-simple', 'Present simple', 'Hiện tại đơn'),
    point('present-perfect', 'Present perfect', 'Hiện tại hoàn thành'),
    point('past-simple', 'Past simple', 'Quá khứ đơn'),
    point('must-have-to', 'Must and have to', 'Must và have to', 'modals'),
  ],
  edges: [],
};

describe('mentionAt', () => {
  it('finds the query after an @ at the start or after a space', () => {
    expect(mentionAt('@pre', 4)).toEqual({ start: 0, query: 'pre' });
    expect(mentionAt('compare with @past s', 20)).toEqual({ start: 13, query: 'past s' });
    expect(mentionAt('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('ignores e-mail addresses, a caret before the @, and runs of text that are too long', () => {
    expect(mentionAt('me@site', 7)).toBeNull();
    expect(mentionAt('hi @pre', 2)).toBeNull();
    expect(mentionAt(`@${'a'.repeat(40)}`, 41)).toBeNull();
    expect(mentionAt('@a\nb', 4)).toBeNull();
  });
});

describe('searchPoints', () => {
  it('lists every point for an empty query, skipping the open one', () => {
    expect(searchPoints(map, '', 'past-simple').map((p) => p.id)).toEqual(['present-simple', 'present-perfect', 'must-have-to']);
  });

  it('ranks titles that start with the query first and ignores accents', () => {
    expect(searchPoints(map, 'simple').map((p) => p.id)).toEqual(['present-simple', 'past-simple']);
    expect(searchPoints(map, 'hien tai').map((p) => p.id)).toEqual(['present-simple', 'present-perfect']);
    expect(searchPoints(map, 'qua khu don').map((p) => p.id)).toEqual(['past-simple']);
  });

  it('also matches the cluster name', () => {
    expect(searchPoints(map, 'modal').map((p) => p.id)).toEqual(['must-have-to']);
    expect(searchPoints(map, 'zzz')).toEqual([]);
  });
});
