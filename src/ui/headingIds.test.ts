import { describe, expect, it } from 'vitest';

import { rehypeHeadingIds, type HastNode } from './headingIds';

describe('rehypeHeadingIds', () => {
  it('sets GitHub-style ids on headings, including inline code text', () => {
    const heading = (children: HastNode[]): HastNode => ({
      type: 'element',
      tagName: 'h2',
      properties: {},
      children,
    });
    const tree: HastNode = {
      type: 'root',
      children: [
        heading([
          {
            type: 'element',
            tagName: 'code',
            children: [{ type: 'text', value: 'RCD_X' }],
          },
          { type: 'text', value: ' inputs' },
        ]),
        heading([{ type: 'text', value: 'Notes' }]),
        heading([{ type: 'text', value: 'Notes' }]),
        { type: 'element', tagName: 'p', properties: {}, children: [] },
      ],
    };
    rehypeHeadingIds()(tree);
    expect(tree.children?.map((node) => node.properties)).toEqual([
      { id: 'rcd_x-inputs' },
      { id: 'notes' },
      { id: 'notes-1' },
      {},
    ]);
  });
});

describe('rehypeHeadingIds with a reserved title', () => {
  it('numbers duplicates of the title as GitHub does', () => {
    const tree: HastNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'h2',
          properties: {},
          children: [{ type: 'text', value: 'Lineage' }],
        },
      ],
    };
    rehypeHeadingIds({ reserved: ['Lineage'] })(tree);
    expect(tree.children?.[0]?.properties).toEqual({ id: 'lineage-1' });
  });
});
