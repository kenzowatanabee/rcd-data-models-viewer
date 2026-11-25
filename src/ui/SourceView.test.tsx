import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SourceView } from './SourceView';

const render = (text: string) =>
  renderToStaticMarkup(
    createElement(SourceView, {
      file: 'docs/x.md',
      text,
      line: 2,
      wrap: false,
      onWrap: () => undefined,
    }),
  );

describe('SourceView', () => {
  it('shows hostile HTML as inert text', () => {
    const hostile = [
      '---',
      'name: "<script>alert(1)</script>"',
      '---',
      '<img src=x onerror="alert(2)">',
      '[x](javascript:alert(3))',
      '<iframe src="https://example.com"></iframe>',
      '<style>body{display:none}</style>',
    ].join('\n');
    const html = render(hostile);
    expect(html).not.toMatch(/<(script|img|iframe|style)\b/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(2)&quot;&gt;');
    // The javascript: text is never made into a link
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it('numbers lines, links them and marks the target line', () => {
    const html = render('# Title\n\nbody\n');
    expect(html.match(/class="src-line/g)).toHaveLength(3);
    expect(html).toContain('href="#/doc/docs/x.md?view=md&amp;line=3"');
    expect(html).toContain('id="L2" class="src-line is-target"');
    expect(html).toContain('<span id="title" class="src-anchor">');
  });
});
