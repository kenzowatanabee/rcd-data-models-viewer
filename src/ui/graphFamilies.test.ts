import { describe, expect, it } from 'vitest';

import type { GraphNode } from '../indexer/types';
import {
  arrange,
  familyEdges,
  familyName,
  families,
  lookupsRead,
  sharedFeeds,
  sharedLookups,
} from './graphFamilies';

type N = Pick<GraphNode, 'id' | 'kind' | 'name' | 'layer'>;

const dataset = (id: string, layer: string | null = null, name = id): N => ({
  id,
  kind: 'dataset',
  name,
  layer,
});
const pipeline = (id: string, name = id): N => ({
  id,
  kind: 'pipeline',
  name,
  layer: null,
});
const link = (from: string, to: string) => ({ from, to });

// DIM (dimension) is read by p1, p2 and p3; RAW (source) by p1..p4;
// SMALL (dimension) by p1 only.
const hubs = {
  nodes: [
    dataset('DIM', 'dimension'),
    dataset('SMALL', 'dimension'),
    dataset('RAW', 'source'),
    pipeline('p1'),
    pipeline('p2'),
    pipeline('p3'),
    pipeline('p4'),
  ],
  edges: [
    link('DIM', 'p1'),
    link('DIM', 'p2'),
    link('DIM', 'p3'),
    link('DIM', 'p3'),
    link('SMALL', 'p1'),
    link('RAW', 'p1'),
    link('RAW', 'p2'),
    link('RAW', 'p3'),
    link('RAW', 'p4'),
  ],
};

describe('sharedLookups', () => {
  it('takes dimension datasets read by enough distinct pipelines', () => {
    expect([...sharedLookups(hubs, 3)]).toEqual(['DIM']);
    expect([...sharedLookups(hubs, 4)]).toEqual([]);
    expect([...sharedLookups(hubs, 1)].sort()).toEqual(['DIM', 'SMALL']);
  });

  it('never takes a source dataset, however widely read', () => {
    expect(sharedLookups(hubs, 1).has('RAW')).toBe(false);
  });
});

describe('sharedFeeds', () => {
  it('takes other widely read nodes, leaving out the lookups', () => {
    const lookups = sharedLookups(hubs, 3);
    expect([...sharedFeeds(hubs, lookups, 4)]).toEqual(['RAW']);
    expect([...sharedFeeds(hubs, lookups, 3)]).toEqual(['RAW']);
    expect([...sharedFeeds(hubs, new Set(), 3)].sort()).toEqual(['DIM', 'RAW']);
  });
});

describe('families', () => {
  // A: a -> pa -> A_OUT ; B: b -> pb -> B_OUT ; both read LOOKUP
  const two = {
    nodes: [
      dataset('a', 'source'),
      pipeline('pa'),
      dataset('A_OUT', 'output'),
      dataset('b', 'source'),
      pipeline('pb'),
      dataset('B_OUT', 'output'),
      dataset('LOOKUP', 'dimension'),
      dataset('lonely'),
    ],
    edges: [
      link('a', 'pa'),
      link('pa', 'A_OUT'),
      link('b', 'pb'),
      link('pb', 'B_OUT'),
      link('LOOKUP', 'pa'),
      link('LOOKUP', 'pb'),
    ],
  };

  it('splits the graph once the lookups are taken out', () => {
    const none = { lookups: new Set<string>(), feeds: new Set<string>() };
    expect(families(two, none)).toHaveLength(1);
    const result = families(two, { ...none, lookups: new Set(['LOOKUP']) });
    expect(result.map((f) => f.nodes)).toEqual([
      ['A_OUT', 'a', 'pa'],
      ['B_OUT', 'b', 'pb'],
    ]);
    expect(result.map((f) => f.name)).toEqual(['A_OUT', 'B_OUT']);
    // lonely has no edges and the lookup is shown on its own
    expect(result.flatMap((f) => f.nodes)).not.toContain('lonely');
    expect(result.flatMap((f) => f.nodes)).not.toContain('LOOKUP');
  });

  it('orders the same whatever order the input comes in', () => {
    const options = { lookups: new Set(['LOOKUP']), feeds: new Set<string>() };
    const forward = families(two, options);
    const backward = families(
      { nodes: [...two.nodes].reverse(), edges: [...two.edges].reverse() },
      options,
    );
    expect(backward).toEqual(forward);
  });

  it('puts larger families first', () => {
    const bigger = {
      nodes: [...two.nodes, dataset('B_MORE', 'output')],
      edges: [...two.edges, link('pb', 'B_MORE')],
    };
    const result = families(bigger, {
      lookups: new Set(['LOOKUP']),
      feeds: new Set<string>(),
    });
    expect(result.map((f) => f.nodes.length)).toEqual([4, 3]);
    expect(result[0]?.more).toBe(1);
  });

  it('is safe on cycles', () => {
    const cyclic = {
      nodes: [dataset('x'), pipeline('p'), dataset('y')],
      edges: [link('x', 'p'), link('p', 'y'), link('y', 'x'), link('y', 'y')],
    };
    const result = families(cyclic, {
      lookups: new Set(),
      feeds: new Set(),
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.nodes).toEqual(['p', 'x', 'y']);
    expect(result[0]?.name).not.toBe('');
  });

  it('keeps a feed with its producer, apart from the families it feeds', () => {
    // raw -> pf -> FEED, and FEED feeds both pa (family A) and pb (B)
    const fed = {
      nodes: [
        dataset('raw', 'source'),
        pipeline('pf'),
        dataset('FEED', 'intermediate'),
        pipeline('pa'),
        dataset('A_OUT', 'output'),
        pipeline('pb'),
        dataset('B_OUT', 'output'),
      ],
      edges: [
        link('raw', 'pf'),
        link('pf', 'FEED'),
        link('FEED', 'pa'),
        link('pa', 'A_OUT'),
        link('FEED', 'pb'),
        link('pb', 'B_OUT'),
      ],
    };
    const asFeed = { lookups: new Set<string>(), feeds: new Set(['FEED']) };
    const result = families(fed, asFeed);
    expect(result.map((f) => [f.name, f.feed, f.nodes])).toEqual([
      ['FEED', true, ['FEED', 'pf', 'raw']],
      ['A_OUT', false, ['A_OUT', 'pa']],
      ['B_OUT', false, ['B_OUT', 'pb']],
    ]);
    expect(familyEdges(fed.edges, asFeed)).toHaveLength(4);
    // A node that is not a feed joins the families it feeds into one
    const plain = families(fed, { lookups: new Set(), feeds: new Set() });
    expect(plain).toHaveLength(1);
    expect(plain[0]?.nodes).toHaveLength(7);
  });
});

describe('familyName', () => {
  const none = new Set<string>();

  it('prefers the final dataset built from the most of the family', () => {
    const nodes = [
      dataset('s', 'source'),
      pipeline('p1'),
      dataset('mid', 'intermediate'),
      pipeline('p2'),
      dataset('BIG', 'output'),
      dataset('SIDE', 'output'),
    ];
    const edges = [
      link('s', 'p1'),
      link('p1', 'mid'),
      link('p1', 'SIDE'),
      link('mid', 'p2'),
      link('p2', 'BIG'),
    ];
    expect(familyName(nodes, edges, none)).toEqual({ name: 'BIG', more: 1 });
  });

  it('breaks ties with the dataset a pipeline is named after', () => {
    const nodes = [
      dataset('in'),
      pipeline('pf', 'RCD_SOA_NIQ_FLOW'),
      dataset('a', 'output', 'RCD_#SKU_NIQ'),
      dataset('b', 'output', 'RCD_SOA_NIQ'),
    ];
    const edges = [link('in', 'pf'), link('pf', 'a'), link('pf', 'b')];
    expect(familyName(nodes, edges, none).name).toBe('RCD_SOA_NIQ');
  });

  it('falls back to the widest-reaching dataset when pipelines end it', () => {
    const nodes = [dataset('legacy'), pipeline('p1'), pipeline('p2')];
    const edges = [link('legacy', 'p1'), link('legacy', 'p2')];
    expect(familyName(nodes, edges, none)).toEqual({
      name: 'legacy',
      more: 0,
    });
    expect(familyName([pipeline('only')], [], none).name).toBe('only');
  });

  it('names a family after the feed it holds', () => {
    const nodes = [dataset('raw'), pipeline('pf'), dataset('FEED')];
    const edges = [link('raw', 'pf'), link('pf', 'FEED')];
    expect(familyName(nodes, edges, new Set(['FEED'])).name).toBe('FEED');
  });
});

describe('arrange', () => {
  it('orders lookups and feeds on the side, then families, then loose nodes', () => {
    const graph = {
      nodes: [
        dataset('z-alone'),
        dataset('LOOK', 'dimension'),
        dataset('raw', 'source'),
        pipeline('pf'),
        dataset('FEED'),
        pipeline('pa'),
        dataset('A_OUT', 'output'),
      ],
      edges: [
        link('raw', 'pf'),
        link('pf', 'FEED'),
        link('FEED', 'pa'),
        link('LOOK', 'pa'),
        link('pa', 'A_OUT'),
      ],
    };
    const { bands, groups } = arrange(graph, {
      lookups: new Set(['LOOK']),
      feeds: new Set(['FEED']),
    });
    expect(bands.map((b) => [b.kind, b.title, b.nodes.length])).toEqual([
      ['lookups', 'Shared lookups', 1],
      ['feed', 'Shared feed: FEED', 3],
      ['family', 'A_OUT', 2],
      ['unlinked', 'Not linked to anything', 1],
    ]);
    expect(groups.map((g) => `${g.column}/${g.arrange}`)).toEqual([
      'side/wrap',
      'side/flow',
      'main/flow',
      'main/wrap',
    ]);
    const noFeeds = arrange(graph, {
      lookups: new Set(['LOOK']),
      feeds: new Set(),
    });
    expect(noFeeds.groups.map((g) => g.column)).toEqual([
      'main',
      'main',
      'main',
    ]);
    // every node in exactly one band
    expect(bands.flatMap((b) => b.nodes).sort()).toEqual(
      graph.nodes.map((n) => n.id).sort(),
    );
  });
});

describe('lookupsRead', () => {
  it('lists the lookups each node reads, once each', () => {
    const read = lookupsRead(
      [link('L1', 'p'), link('L2', 'p'), link('L1', 'p'), link('x', 'p')],
      new Set(['L1', 'L2']),
    );
    expect(Object.fromEntries(read)).toEqual({ p: ['L1', 'L2'] });
  });
});
