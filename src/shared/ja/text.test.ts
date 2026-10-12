import { describe, expect, it } from 'vitest';
import { isJapanese, matchJapanese, parseRuby, plainText, readingText, splitJapaneseRuns, toHiragana, wordsOf } from './text';

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

describe('checking typed Japanese', () => {
  const sentence = '私{わたし}は毎朝{まいあさ}コーヒーを飲{の}みます。';

  it('accepts kanji, kana and mixed answers, ignoring punctuation', () => {
    expect(matchJapanese(sentence, '私は毎朝コーヒーを飲みます。').correct).toBe(true);
    expect(matchJapanese(sentence, 'わたしはまいあさこーひーをのみます').correct).toBe(true);
    expect(matchJapanese(sentence, '私はまいあさコーヒーを飲みます').correct).toBe(true);
    expect(matchJapanese(sentence, 'わたしは毎朝ｺｰﾋｰをのみます。').correct).toBe(true);
  });

  it('marks what is missing or wrong', () => {
    const result = matchJapanese(sentence, 'わたしはまいにちコーヒーをのみます');
    expect(result.correct).toBe(false);
    const wrong = result.units.filter((u) => !u.ok).map((u) => u.text);
    expect(wrong).toEqual(['毎朝']);
  });

  it('does not let a long vowel mark disappear', () => {
    expect(matchJapanese('コーヒー', 'こひ').correct).toBe(false);
  });
});

describe('Japanese words for tap-to-define', () => {
  it('keeps readings inside words and drops nothing', () => {
    const words = wordsOf('日本語{にほんご}を勉強{べんきょう}します。');
    expect(words.map((w) => w.text).join('')).toBe('日本語を勉強します。');
    const study = words.find((w) => w.text.startsWith('勉強'));
    expect(study?.pieces[0]).toEqual({ text: '勉強', reading: 'べんきょう' });
    expect(words.at(-1)?.isWord).toBe(false);
  });

  it('splits Japanese runs out of mixed text', () => {
    expect(splitJapaneseRuns('Bạn nên nói 食{た}べます nhé.')).toEqual([
      { text: 'Bạn nên nói ', japanese: false },
      { text: '食{た}べます', japanese: true },
      { text: ' nhé.', japanese: false },
    ]);
  });
});
