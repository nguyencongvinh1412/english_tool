import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InlineMarkdown } from './InlineMarkdown';

const render = (text: string): string => renderToStaticMarkup(createElement(InlineMarkdown, { text }));

describe('InlineMarkdown', () => {
  it('renders bold and italic markers', () => {
    expect(render('it\'s "I **go** to work"')).toBe('it&#x27;s &quot;I <strong>go</strong> to work&quot;');
    expect(render('use *have* with I')).toBe('use <em>have</em> with I');
  });

  it('escapes HTML from the model instead of rendering it', () => {
    expect(render('<b>x</b> **bold**')).toBe('&lt;b&gt;x&lt;/b&gt; <strong>bold</strong>');
  });

  it('leaves arithmetic and snake_case alone', () => {
    expect(render('2 * 3 * 4')).toBe('2 * 3 * 4');
    expect(render('snake_case_word stays')).toBe('snake_case_word stays');
  });
});
