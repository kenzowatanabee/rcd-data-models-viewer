import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';

import { isAllowedHtml } from './htmlAllowlist';
import { markdownPlugins } from './markdownPipeline';

/** Renders Markdown through exactly the plugins the doc page uses. */
function render(markdown: string): string {
  const plugins = markdownPlugins();
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: plugins.remark,
      rehypePlugins: plugins.rehype,
      children: markdown,
    }),
  );
}

describe('isAllowedHtml', () => {
  it('accepts the allowlisted tags', () => {
    expect(isAllowedHtml('<details>\n<summary>21 columns</summary>')).toBe(
      true,
    );
    expect(isAllowedHtml('</details>')).toBe(true);
    expect(isAllowedHtml('<details open>')).toBe(true);
    expect(isAllowedHtml('<br/>')).toBe(true);
    expect(isAllowedHtml('<br>')).toBe(true);
    expect(isAllowedHtml('<i>')).toBe(true);
    expect(isAllowedHtml('<kbd>')).toBe(true);
    expect(isAllowedHtml('<a id="dn"></a>')).toBe(true);
    expect(isAllowedHtml('<!-- a note -->')).toBe(true);
  });

  it('rejects other tags, attributes and literal placeholders', () => {
    for (const html of [
      '<script>alert(1)</script>',
      '<style>body{}</style>',
      '<iframe src="x">',
      '<img src=x onerror=alert(1)>',
      '<details ontoggle="alert(1)">',
      '<summary onclick=alert(1)>',
      '<details open="javascript:alert(1)">',
      '<a href="javascript:alert(1)">',
      '<a id="x" onmouseover="alert(1)">',
      '<a id="javascript:alert(1)">',
      '<b style="color:red">',
      '<details><summary>x</summary><script>',
      '<export date>',
      '<ID or name>',
      '<RE>',
      '<svg onload=alert(1)>',
      '</details foo>',
    ]) {
      expect(isAllowedHtml(html), html).toBe(false);
    }
  });
});

describe('the Markdown pipeline', () => {
  it('renders <details> with its summary and Markdown inside', () => {
    const html = render(
      '<details>\n<summary>21 columns</summary>\n\n| A | B |\n| - | - |\n| `x` | 1 |\n\n</details>\n',
    );
    expect(html).toMatch(/<details>\s*<summary>21 columns<\/summary>/);
    expect(html).toContain('<table>');
    expect(html).toContain('<code>x</code>');
  });

  it('keeps the allowlisted inline tags', () => {
    const html = render(
      'A<br>B <i>it</i> <b>bo</b> H<sub>2</sub>O <kbd>K</kbd>',
    );
    expect(html).toContain('<br/>');
    expect(html).toContain('<i>it</i>');
    expect(html).toContain('<b>bo</b>');
    expect(html).toContain('<sub>2</sub>');
    expect(html).toContain('<kbd>K</kbd>');
  });

  it('prefixes raw ids so they cannot clash with the app', () => {
    expect(render('| <a id="dn"></a>**DN** | x |\n| - | - |\n')).toContain(
      '<a id="user-content-dn"></a>',
    );
  });

  it('never lets script, styles, frames or handlers through', () => {
    const hostile = [
      '<script>alert(1)</script>',
      '<style>*{display:none}</style>',
      '<iframe src="https://example.com"></iframe>',
      '<img src=x onerror=alert(1)>',
      '<details ontoggle=alert(1) open><summary onclick="alert(1)">s</summary>x</details>',
      '<a href="javascript:alert(1)">x</a>',
      '[link](javascript:alert(1))',
      '<svg><script>alert(1)</script></svg>',
      '<object data="x"></object><embed src="x">',
      '<form action="x"><input onfocus=alert(1) autofocus></form>',
      '<div style="background:url(javascript:alert(1))">x</div>',
      '<details>\n<summary>ok</summary>\n<script>alert(1)</script>\n</details>',
    ].join('\n\n');
    const html = render(hostile);
    // Tags only ever appear escaped, as text
    expect(html).not.toMatch(
      /<(script|style|iframe|img|svg|object|embed|form|input|div)\b/i,
    );
    expect(html).not.toMatch(/<[^>]*\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/<[^>]*\sstyle=/i);
  });

  it('shows placeholder text in angle brackets instead of dropping it', () => {
    const html = render('Run it with <export date> and <ID or name>.');
    expect(html).toContain('&lt;export date&gt;');
    expect(html).toContain('&lt;ID or name&gt;');
  });

  it('keeps GitHub heading ids, after the title the header shows', () => {
    const plugins = markdownPlugins({ reserved: ['Notes'] });
    const html = renderToStaticMarkup(
      createElement(ReactMarkdown, {
        remarkPlugins: plugins.remark,
        rehypePlugins: plugins.rehype,
        children: '## Notes\n\n## Notes\n',
      }),
    );
    expect(html).toContain('<h2 id="notes-1">');
    expect(html).toContain('<h2 id="notes-2">');
  });
});
