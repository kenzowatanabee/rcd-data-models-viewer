import { describe, expect, it } from 'vitest';

import type { Graph, GraphNode } from '../indexer/types';
import {
  NO_CHIPS,
  buildNav,
  familyBands,
  fitLabel,
  labelRoom,
  flattenRows,
  matchesChips,
  navOrder,
  prefixOf,
  sharedPrefixes,
  shownCount,
  sidebarDocs,
  trailOf,
  type NavOptions,
  type SidebarDoc,
} from './sidebarModel';

const node = (
  over: Partial<GraphNode> & Pick<GraphNode, 'id' | 'kind' | 'name'>,
): GraphNode => ({
  aliases: [],
  file: over.kind === 'external' ? null : over.id,
  title: null,
  layer: null,
  platform: null,
  status: 'draft',
  domoId: null,
  lastUpdated: null,
  ...over,
});

const D = (name: string, layer: string, status = 'draft') =>
  node({
    id: `docs/datasets/${name.toLowerCase()}.md`,
    kind: 'dataset',
    name,
    layer,
    status,
  });

const nodes = [
  D('RCD_TAB_MKT_CUSTOMER_COMPLETO', 'output'),
  D('RCD_TAB_MKT_CUSTOMER', 'output', 'reviewed'),
  D('RCD_TAB_SELLOUT', 'intermediate'),
  D('RCD_SORT_REC_NACIONAL', 'dimension'),
  D('RCD_DISTRIBUIÇÃO', 'source'),
  D('PRODUCT_DIMENSION', 'dimension'),
  D('ODD', 'weird'),
  node({ id: 'docs/pipelines/flow.md', kind: 'pipeline', name: 'RCD_FLOW' }),
  node({ id: 'external:RAW', kind: 'external', name: 'RAW' }),
];

const graph: Graph = {
  nodes,
  edges: [
    { from: 'external:RAW', to: 'docs/pipelines/flow.md', declaredBy: [] },
    {
      from: 'docs/pipelines/flow.md',
      to: 'docs/datasets/rcd_tab_sellout.md',
      declaredBy: [],
    },
  ],
  references: [],
  oneSided: [],
  problems: [],
};

const docs = sidebarDocs({
  docsPath: '/x',
  graph,
  otherDocs: ['README.md', 'docs/glossary.md', 'guides/how-to.md'],
});

const options = (over: Partial<NavOptions> = {}): NavOptions => ({
  groupBy: 'layer',
  query: '',
  chips: NO_CHIPS,
  issues: new Map(),
  bands: familyBands(graph),
  ...over,
});

const names = (rows: { doc: SidebarDoc }[]) => rows.map((r) => r.doc.name);

describe('sidebarDocs', () => {
  it('lists documented nodes and other docs, never undocumented names', () => {
    expect(docs.map((d) => d.kind).filter((k) => k === 'doc')).toHaveLength(3);
    expect(docs.some((d) => d.name === 'RAW')).toBe(false);
    expect(docs.find((d) => d.file === 'guides/how-to.md')?.folder).toBe(
      'guides',
    );
  });
});

describe('prefixes', () => {
  it('finds the underscore prefixes most names share, longest first', () => {
    const list = [
      'RCD_TAB_A',
      'RCD_TAB_B',
      'RCD_TAB_C',
      'RCD_X',
      'RCD_Y',
      'OTHER',
    ];
    expect(sharedPrefixes(list)).toEqual(['RCD_TAB_', 'RCD_']);
    expect(prefixOf('RCD_TAB_A', ['RCD_TAB_', 'RCD_'])).toBe('RCD_TAB_');
    expect(prefixOf('RCD_X', ['RCD_TAB_', 'RCD_'])).toBe('RCD_');
    // Never the whole name
    expect(prefixOf('RCD_', ['RCD_'])).toBe('');
    expect(sharedPrefixes(['A_B', 'A_C'])).toEqual([]);
  });
});

describe('buildNav', () => {
  it('groups datasets by layer in flow order, with counts', () => {
    const groups = buildNav(docs, options());
    expect(groups.map((g) => g.id)).toEqual(['datasets', 'pipelines', 'other']);
    const layers = groups[0]?.children ?? [];
    expect(layers.map((g) => [g.id, g.total])).toEqual([
      ['layer:source', 1],
      ['layer:dimension', 2],
      ['layer:intermediate', 1],
      ['layer:output', 2],
      ['layer:other', 1],
    ]);
    expect(groups[0]?.total).toBe(7);
    expect(groups[2]?.children.map((g) => g.title)).toEqual([
      'Repository root',
      'docs/',
      'guides/',
    ]);
  });

  it('lists datasets flat A–Z, or by the graph families', () => {
    const az = buildNav(docs, options({ groupBy: 'az' }));
    expect(az[0]?.children).toEqual([]);
    expect(names(az[0]?.rows ?? [])[0]).toBe('ODD');
    const family = buildNav(docs, options({ groupBy: 'family' }));
    expect(family[0]?.id).toBe('families');
    const bands = familyBands(graph);
    // Each band lists exactly its documented members
    for (const group of family[0]?.children ?? []) {
      const band = bands.find((b) => `family:${b.id}` === group.id);
      const documented = (band?.nodes ?? []).filter(
        (id) => !id.startsWith('external:'),
      );
      expect(group.rows.map((r) => r.doc.file).sort()).toEqual(
        documented.sort(),
      );
    }
  });

  it('mutes the shared prefix of each row', () => {
    const rows = flattenRows(buildNav(docs, options()));
    const row = rows.find((r) => r.doc.name === 'RCD_TAB_MKT_CUSTOMER');
    expect(row?.prefix).toBe('RCD_TAB_');
  });

  it('filters with any-order tokens and puts the best match first', () => {
    const first = (query: string) =>
      names(flattenRows(buildNav(docs, options({ query }))))[0];
    expect(first('mkt cust compl')).toBe('RCD_TAB_MKT_CUSTOMER_COMPLETO');
    expect(first('sort rec')).toBe('RCD_SORT_REC_NACIONAL');
    expect(first('distribuicao')).toBe('RCD_DISTRIBUIÇÃO');
    const groups = buildNav(docs, options({ query: 'customer' }));
    // Only groups with matches are left, with their totals kept
    expect(groups).toHaveLength(1);
    expect(shownCount(groups[0]!)).toBe(2);
    expect(groups[0]?.children[0]?.total).toBe(2);
    const hits = flattenRows(groups)[0]?.hits ?? [];
    expect(hits.length).toBeGreaterThan(0);
  });

  it('combines chips with each other and with the text', () => {
    const issues = new Map([
      ['docs/datasets/rcd_tab_mkt_customer.md', 2],
      ['docs/datasets/rcd_tab_sellout.md', 1],
    ]);
    const shown = (over: Partial<NavOptions>) =>
      names(flattenRows(buildNav(docs, options({ issues, ...over })))).sort();
    expect(
      shown({ chips: { layers: ['output'], draft: false, issues: true } }),
    ).toEqual(['RCD_TAB_MKT_CUSTOMER']);
    expect(
      shown({ chips: { layers: ['output'], draft: true, issues: false } }),
    ).toEqual(['RCD_TAB_MKT_CUSTOMER_COMPLETO']);
    expect(
      shown({
        chips: {
          layers: ['output', 'intermediate'],
          draft: false,
          issues: true,
        },
      }),
    ).toEqual(['RCD_TAB_MKT_CUSTOMER', 'RCD_TAB_SELLOUT']);
    expect(
      shown({
        query: 'sellout',
        chips: { layers: ['output'], draft: false, issues: false },
      }),
    ).toEqual([]);
    const doc = docs.find((d) => d.kind === 'doc');
    expect(
      doc && matchesChips(doc, { layers: [], draft: true, issues: false }, 0),
    ).toBe(false);
  });
});

describe('navOrder and trailOf', () => {
  it('follows the grouping', () => {
    const order = navOrder(docs, 'layer', familyBands(graph));
    expect(order[0]).toBe('docs/datasets/rcd_distribuição.md');
    expect(order.at(-1)).toBe('guides/how-to.md');
    const doc = docs.find((d) => d.name === 'RCD_SORT_REC_NACIONAL');
    expect(doc && trailOf(doc, 'layer', [])).toEqual(['Datasets', 'Dimension']);
    expect(doc && trailOf(doc, 'az', [])).toEqual(['Datasets']);
  });
});

describe('fitLabel and labelRoom', () => {
  it('keeps the muted prefix when the name fits, else elides it', () => {
    expect(fitLabel('RCD_TAB_X', 'RCD_TAB_', 20)).toEqual({
      lead: 'RCD_TAB_',
      stem: 'X',
      elided: false,
    });
    expect(fitLabel('RCD_TAB_MKT_CUSTOMER_COMPLETO', 'RCD_TAB_', 20)).toEqual({
      lead: '…',
      stem: 'MKT_CUSTOMER_COMPLETO',
      elided: true,
    });
    // No prefix: nothing to elide, the end is cut by the row instead
    expect(fitLabel('PRODUCT_DIMENSION_LONG', '', 5).elided).toBe(false);
  });

  it('gives less room to deeper rows with more on them', () => {
    const plain = labelRoom(280, { depth: 0, issues: false, meta: false });
    const busy = labelRoom(280, { depth: 1, issues: true, meta: true });
    expect(plain).toBeGreaterThan(busy);
    expect(labelRoom(100, { depth: 1, issues: true, meta: true })).toBe(8);
  });
});
