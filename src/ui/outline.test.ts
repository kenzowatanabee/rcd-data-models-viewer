import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';

import { markdownPlugins } from './markdownPipeline';
import {
  activeHeading,
  inlineParts,
  plainTitle,
  sameOutline,
  splitTitle,
  type OutlineItem,
} from './outline';

/** The outline the page would build for `markdown`, and its rendered HTML. */
function outlineOf(markdown: string, reserved: string[] = []) {
  let items: OutlineItem[] = [];
  const plugins = markdownPlugins({
    reserved,
    collect: (collected) => {
      items = collected;
    },
  });
  const html = renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: plugins.remark,
      rehypePlugins: plugins.rehype,
      children: markdown,
    }),
  );
  return { items, html };
}

describe('the outline', () => {
  it('lists h2 and h3 with the ids the headings get', () => {
    const { items, html } = outlineOf(
      [
        '## Overview',
        '### `RCD_X` inputs',
        '#### Too deep',
        '## Notes & caveats',
        '## Notes & caveats',
        '<details>\n<summary>more</summary>\n\n### Inside details\n\n</details>',
      ].join('\n\n'),
    );
    expect(items).toEqual([
      { id: 'overview', text: 'Overview', depth: 2 },
      { id: 'rcd_x-inputs', text: 'RCD_X inputs', depth: 3 },
      { id: 'notes--caveats', text: 'Notes & caveats', depth: 2 },
      { id: 'notes--caveats-1', text: 'Notes & caveats', depth: 2 },
      { id: 'inside-details', text: 'Inside details', depth: 3 },
    ]);
    for (const item of items) expect(html).toContain(`id="${item.id}"`);
  });

  it('counts the title the header shows when numbering duplicates', () => {
    const { items } = outlineOf('## Lineage\n', ['Lineage']);
    expect(items[0]?.id).toBe('lineage-1');
  });

  it('compares outlines by value', () => {
    const a: OutlineItem[] = [{ id: 'a', text: 'A', depth: 2 }];
    expect(sameOutline(a, [{ id: 'a', text: 'A', depth: 2 }])).toBe(true);
    expect(sameOutline(a, [{ id: 'a', text: 'A', depth: 3 }])).toBe(false);
    expect(sameOutline(a, [])).toBe(false);
  });
});

describe('activeHeading', () => {
  it('picks the last heading scrolled past the offset', () => {
    expect(activeHeading([0, 300, 900], 40, 800, false)).toBe(0);
    expect(activeHeading([-500, 20, 900], 40, 800, false)).toBe(1);
    expect(activeHeading([-900, -500, -100], 40, 800, false)).toBe(2);
  });

  it('falls back to the first laid-out heading before any is reached', () => {
    expect(activeHeading([null, 200, 400], 40, 800, false)).toBe(1);
    expect(activeHeading([], 40, 800, false)).toBe(-1);
  });

  it('skips headings that are not laid out', () => {
    expect(activeHeading([-300, null, 500], 40, 800, false)).toBe(0);
  });

  it('at the bottom, the last heading on screen wins', () => {
    expect(activeHeading([-900, 300, 600], 40, 800, true)).toBe(2);
    expect(activeHeading([-900, 300, 1200], 40, 800, true)).toBe(1);
  });
});

describe('splitTitle', () => {
  it('takes the leading level-1 heading out', () => {
    expect(splitTitle('\n# `RCD_X` (flow output)\n\n## Overview\n')).toEqual({
      title: '`RCD_X` (flow output)',
      body: '\n## Overview\n',
    });
    expect(splitTitle('# Title #\r\nText').title).toBe('Title');
  });

  it('leaves docs that do not start with one alone', () => {
    expect(splitTitle('Intro\n\n# Later\n').title).toBeNull();
    expect(splitTitle('## Section\n').title).toBeNull();
    expect(splitTitle('').title).toBeNull();
  });
});

describe('inlineParts and plainTitle', () => {
  it('splits code spans from text and keeps underscores', () => {
    expect(inlineParts('`RCD_SORT_REC` (**flow** output)')).toEqual([
      { code: true, text: 'RCD_SORT_REC' },
      { code: false, text: ' (flow output)' },
    ]);
    expect(inlineParts('RCD_MASTER_FLOW_2: x')).toEqual([
      { code: false, text: 'RCD_MASTER_FLOW_2: x' },
    ]);
    expect(plainTitle('`RCD | X`: pilot')).toBe('RCD | X: pilot');
    expect(inlineParts('``a ` b``')).toEqual([{ code: true, text: 'a ` b' }]);
  });
});
