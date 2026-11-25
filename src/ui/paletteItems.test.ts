import { describe, expect, it } from 'vitest';

import type { GraphNode } from '../indexer/types';
import type { GraphResponse } from '../server/api';
import {
  RECENT_LIMIT,
  adjacentDoc,
  commandItems,
  contentItems,
  parseRecent,
  pushRecent,
  recentRows,
  searchPalette,
  sidebarOrder,
} from './paletteItems';

const node = (
  over: Partial<GraphNode> & Pick<GraphNode, 'id' | 'kind' | 'name'>,
): GraphNode => ({
  aliases: [],
  file: over.kind === 'external' ? null : over.id,
  title: null,
  layer: null,
  platform: null,
  status: null,
  domoId: null,
  lastUpdated: null,
  ...over,
});

const data: GraphResponse = {
  docsPath: '/docs',
  graph: {
    nodes: [
      node({
        id: 'docs/datasets/sort.md',
        kind: 'dataset',
        name: 'RCD_SORT_REC',
        layer: 'output',
      }),
      node({
        id: 'docs/datasets/base.md',
        kind: 'dataset',
        name: 'RCD_POS_BASE',
        aliases: ['POS BASE'],
      }),
      node({
        id: 'docs/pipelines/sort.md',
        kind: 'pipeline',
        name: 'RCD_SORT_REC (dataflow)',
      }),
      node({ id: 'external:RAW', kind: 'external', name: 'RAW' }),
    ],
    edges: [],
    references: [],
    oneSided: [],
    problems: [],
  },
  otherDocs: ['README.md', 'docs/open-questions.md'],
};

const headings = {
  docs: [
    {
      file: 'docs/open-questions.md',
      headings: [
        { id: 'q22-rcd_sort_rec', text: 'Q22. RCD_SORT_REC', depth: 3 },
      ],
    },
  ],
};

describe('searchPalette', () => {
  const items = contentItems(data, headings);

  it('groups results, best group first', () => {
    const groups = searchPalette('sort rec', items);
    expect(groups.map((g) => g.id)).toEqual(['dataset', 'pipeline', 'heading']);
    expect(groups[0]?.rows[0]?.item.id).toBe('docs/datasets/sort.md');
  });

  it('finds headings and undocumented names', () => {
    const [first] = searchPalette('q22', items);
    expect(first?.rows[0]?.item).toMatchObject({
      kind: 'heading',
      file: 'docs/open-questions.md',
      anchor: 'q22-rcd_sort_rec',
      meta: 'docs/open-questions.md',
    });
    expect(searchPalette('raw', items)[0]?.rows[0]?.item.kind).toBe('external');
  });

  it('gives layer markers as the sidebar does', () => {
    expect(items[0]?.marker).toBe('layer-output');
    expect(items[2]?.marker).toBe('kind-pipeline');
    expect(items[3]?.marker).toBe('kind-external');
  });
});

describe('commandItems', () => {
  it('offers commands for where the reader is', () => {
    const ids = (section: 'docs' | 'graph', node: string | null) =>
      commandItems({
        section,
        file: section === 'docs' ? 'docs/datasets/sort.md' : null,
        node,
        nodeFile: section === 'graph' ? node : null,
        sidebarCollapsed: false,
      }).map((item) => item.command);
    expect(ids('docs', 'docs/datasets/sort.md')).toContain('show-in-graph');
    expect(ids('docs', 'docs/datasets/sort.md')).toContain('copy-path');
    expect(ids('graph', 'docs/datasets/sort.md')).toContain('open-doc');
    expect(ids('graph', null)).not.toContain('toggle-sidebar');
  });
});

describe('recent items', () => {
  it('keeps the latest few without repeats', () => {
    let recent: string[] = [];
    for (let i = 0; i < 12; i += 1) recent = pushRecent(recent, `id${i % 10}`);
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent.slice(0, 3)).toEqual(['id1', 'id0', 'id9']);
  });

  it('reads stored ids defensively', () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent('not json')).toEqual([]);
    expect(parseRecent('["a", 3, "b"]')).toEqual(['a', 'b']);
  });

  it('drops items that no longer exist', () => {
    const items = contentItems(data, null);
    expect(
      recentRows(['gone', 'README.md'], items).map((row) => row.item.id),
    ).toEqual(['README.md']);
  });
});

describe('sidebarOrder', () => {
  it('lists datasets, pipelines, then other docs', () => {
    const order = sidebarOrder(data);
    expect(order).toEqual([
      'docs/datasets/base.md',
      'docs/datasets/sort.md',
      'docs/pipelines/sort.md',
      'README.md',
      'docs/open-questions.md',
    ]);
    expect(adjacentDoc(order, 'docs/datasets/sort.md', 1)).toBe(
      'docs/pipelines/sort.md',
    );
    expect(adjacentDoc(order, 'docs/datasets/base.md', -1)).toBeNull();
    expect(adjacentDoc(order, null, 1)).toBe('docs/datasets/base.md');
  });
});
