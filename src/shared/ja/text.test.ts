import { describe, expect, it } from 'vitest';
import { isJapanese, parseRuby, plainText, readingText, toHiragana } from './text';

describe('Japanese text helpers', () => {
  const marked = '今日{きょう}は日本語{にほんご}を勉強{べんきょう}します。';

  it('splits readings from kanji', () => {
    expect(parseRuby(marked)).toEqual([
      { text: '今日', reading: 'きょう' },
      { text: 'は' },
      { text: '日本語', reading: 'にほんご' },
      { text: 'を' },
      { text: '勉強', reading: 'べんきょう' },
      { text: 'します。' },
    ]);
  });

  it('gives the written and the spoken form', () => {
    expect(plainText(marked)).toBe('今日は日本語を勉強します。');
    expect(readingText(marked)).toBe('きょうはにほんごをべんきょうします。');
  });

  it('only treats a kanji run as a base', () => {
    expect(parseRuby('お茶{ちゃ}')).toEqual([{ text: 'お' }, { text: '茶', reading: 'ちゃ' }]);
    expect(plainText('no {braces} here')).toBe('no {braces} here');
  });

  it('detects Japanese and folds katakana', () => {
    expect(isJapanese('Hello')).toBe(false);
    expect(isJapanese('カタカナ')).toBe(true);
    expect(toHiragana('カタカナとひらがな')).toBe('かたかなとひらがな');
  });
});

