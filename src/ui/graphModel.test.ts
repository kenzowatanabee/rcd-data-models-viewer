import { describe, expect, it } from 'vitest';

import type { Graph, GraphEdge, GraphNode } from '../indexer/types';
import {
  between,
  edgeKey,
  findNodes,
  isDirectLink,
  lineageOf,
  pathOrder,
  redundantLinks,
  trace,
  unlinked,
  visibleGraph,
} from './graphModel';

const node = (id: string, name = id, aliases: string[] = []): GraphNode => ({
  id,
  kind: id.startsWith('external:')
    ? 'external'
    : id.startsWith('p/')
      ? 'pipeline'
      : 'dataset',
  name,
  aliases,
  file: id.startsWith('external:') ? null : id,
  title: null,
  layer: null,
  platform: null,
  status: null,
  domoId: null,
  lastUpdated: null,
});

const edge = (from: string, to: string, field = 'x'): GraphEdge => ({
  from,
  to,
  declaredBy: [`${field === 'upstream' ? to : from}#${field}`],
});

const keys = (set: Set<string> | Map<string, number>) => [...set.keys()].sort();

// RAW -> FLOW -> OUT, plus RAW -> OUT from OUT's `upstream`
// SHEET (undocumented) -> OUT directly, with no pipeline between them
// LOOKUP -> OUT through FLOW2, plus a direct link
const graph: Graph = {
  nodes: [
    node('d/raw', 'RAW'),
    node('d/out', 'OUT'),
    node('d/lookup', 'LOOKUP'),
    node('d/lonely', 'LONELY'),
    node('p/flow', 'FLOW'),
    node('p/flow2', 'FLOW2'),
    node('external:SHEET', 'SHEET'),
  ],
  edges: [
    edge('d/raw', 'p/flow', 'outputs'),
    edge('p/flow', 'd/out', 'outputs'),
    edge('d/raw', 'd/out', 'upstream'),
    edge('external:SHEET', 'd/out', 'upstream'),
    edge('d/lookup', 'p/flow2', 'inputs'),
    edge('p/flow2', 'd/out', 'outputs'),
    edge('d/lookup', 'd/out', 'upstream'),
  ],
  references: [],
  oneSided: [],
  problems: [],
};

describe('isDirectLink', () => {
  const kindOf = new Map(graph.nodes.map((n) => [n.id, n.kind]));

  it('is true only for upstream-declared links between non-pipelines', () => {
    expect(isDirectLink(edge('d/raw', 'd/out', 'upstream'), kindOf)).toBe(true);
    expect(
      isDirectLink(edge('external:SHEET', 'd/out', 'upstream'), kindOf),
    ).toBe(true);
    expect(isDirectLink(edge('d/raw', 'p/flow', 'inputs'), kindOf)).toBe(false);
    // a wrong-kind upstream that names a pipeline
    expect(isDirectLink(edge('p/flow', 'd/out', 'upstream'), kindOf)).toBe(
      false,
    );
  });
});

describe('redundantLinks', () => {
  it('finds direct links that a pipeline also carries', () => {
    expect(keys(redundantLinks(graph))).toEqual(
      [
        edgeKey({ from: 'd/lookup', to: 'd/out' }),
        edgeKey({ from: 'd/raw', to: 'd/out' }),
      ].sort(),
    );
  });

  it('keeps a direct link when the pipeline only covers one half', () => {
    const half: Graph = {
      ...graph,
      edges: [
        edge('d/raw', 'p/flow', 'inputs'),
        edge('p/flow2', 'd/out', 'outputs'),
        edge('d/raw', 'd/out', 'upstream'),
      ],
    };
    expect(redundantLinks(half).size).toBe(0);
  });
});

describe('visibleGraph', () => {
  it('hides redundant links and, on request, undocumented nodes', () => {
    const defaults = visibleGraph(graph, {
      showExternal: true,
      showRedundant: false,
    });
    expect(defaults.nodes).toHaveLength(7);
    expect(defaults.edges).toHaveLength(5);
    expect(defaults.edges.some((e) => e.from === 'external:SHEET')).toBe(true);

    const all = visibleGraph(graph, {
      showExternal: true,
      showRedundant: true,
    });
    expect(all.edges).toHaveLength(7);
    expect(all.edges.filter((e) => e.redundant)).toHaveLength(2);

    const noExternal = visibleGraph(graph, {
      showExternal: false,
      showRedundant: false,
    });
    expect(noExternal.nodes.map((n) => n.id)).not.toContain('external:SHEET');
    expect(noExternal.edges).toHaveLength(4);
  });
});

describe('trace', () => {
  const chain = {
    nodes: ['a', 'b', 'c', 'd', 'e']
      .map((id) => node(`d/${id}`))
      .concat([node('p/1'), node('p/2'), node('p/3')]),
    // a -> p1 -> b -> p2 -> c -> p3 -> d, and e -> c directly
    edges: [
      edge('d/a', 'p/1'),
      edge('p/1', 'd/b'),
      edge('d/b', 'p/2'),
      edge('p/2', 'd/c'),
      edge('d/c', 'p/3'),
      edge('p/3', 'd/d'),
      edge('d/e', 'd/c', 'upstream'),
    ],
  };

  it('follows edges all the way in both directions', () => {
    const result = trace(chain, 'd/c');
    expect(keys(result.upstream)).toEqual(['d/a', 'd/b', 'd/e', 'p/1', 'p/2']);
    expect(keys(result.downstream)).toEqual(['d/d', 'p/3']);
    expect(result.upstreamEdges.size).toBe(5);
    expect(result.downstreamEdges.size).toBe(2);
    expect(result.upstreamEdges.has(edgeKey({ from: 'd/c', to: 'p/3' }))).toBe(
      false,
    );
  });

  it('counts depth in datasets, with the pipelines between them', () => {
    const one = trace(chain, 'd/c', 1);
    expect(keys(one.upstream)).toEqual(['d/b', 'd/e', 'p/2']);
    expect(keys(one.downstream)).toEqual(['d/d', 'p/3']);
    const two = trace(chain, 'd/c', 2);
    expect(keys(two.upstream)).toEqual(['d/a', 'd/b', 'd/e', 'p/1', 'p/2']);
  });

  it('does not leave a dangling pipeline at the edge of a depth from a pipeline', () => {
    const one = trace(chain, 'p/2', 1);
    expect(keys(one.upstream)).toEqual(['d/b']);
    expect(keys(one.downstream)).toEqual(['d/c']);
  });

  it('is safe on cycles', () => {
    const cyclic = {
      nodes: [node('d/x'), node('d/y'), node('p/loop'), node('d/z')],
      edges: [
        edge('d/x', 'p/loop'),
        edge('p/loop', 'd/y'),
        edge('d/y', 'd/x'),
        edge('d/y', 'd/y'),
        edge('d/y', 'd/z'),
      ],
    };
    const result = trace(cyclic, 'd/x');
    expect(keys(result.upstream)).toEqual(['d/y', 'p/loop']);
    expect(keys(result.downstream)).toEqual(['d/y', 'd/z', 'p/loop']);
  });

  it('returns nothing for an unknown or unlinked node', () => {
    const result = trace(chain, 'd/nope');
    expect(result.upstream.size + result.downstream.size).toBe(0);
  });
});

describe('lineageOf', () => {
  it('keeps the root, its lineage and the traced edges only', () => {
    const visible = visibleGraph(graph, {
      showExternal: true,
      showRedundant: false,
    });
    const sub = lineageOf(visible, trace(visible, 'p/flow'));
    expect(sub.nodes.map((n) => n.id).sort()).toEqual([
      'd/out',
      'd/raw',
      'p/flow',
    ]);
    expect(sub.edges).toHaveLength(2);
  });
});

describe('between', () => {
  it('finds what lies on the paths between two nodes, either way round', () => {
    const visible = visibleGraph(graph, {
      showExternal: true,
      showRedundant: true,
    });
    const forward = between(visible, 'd/raw', 'd/out');
    expect(keys(forward.nodes)).toEqual(['d/out', 'd/raw', 'p/flow']);
    expect(forward.edges.size).toBe(3);
    expect(keys(between(visible, 'd/out', 'd/raw').nodes)).toEqual(
      keys(forward.nodes),
    );
    expect(between(visible, 'd/raw', 'd/lookup').nodes.size).toBe(0);
  });
});

describe('pathOrder', () => {
  it('lists a path in the order the data flows, whichever end was picked', () => {
    const visible = visibleGraph(graph, {
      showExternal: true,
      showRedundant: true,
    });
    const ids = visible.nodes.map((n) => n.id);
    const path = between(visible, 'd/out', 'd/raw');
    expect(pathOrder(path, visible.edges, ids)).toEqual([
      'd/raw',
      'p/flow',
      'd/out',
    ]);
    expect(pathOrder(between(visible, 'd/raw', 'd/lookup'), [], ids)).toEqual(
      [],
    );
  });

  it('still lists every node of a cycle', () => {
    const path = {
      nodes: new Set(['a', 'b']),
      edges: new Set(['a\nb', 'b\na']),
    };
    const links = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ];
    expect(pathOrder(path, links, ['b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('unlinked', () => {
  it('lists nodes without edges', () => {
    expect([...unlinked(graph)]).toEqual(['d/lonely']);
  });
});

describe('findNodes', () => {
  const nodes = [
    node('d/1', 'RCD_DISTRIBUIÇÃO_NIQ_MASTER'),
    node('d/2', 'RCD_MASTER_DISTRIBUTION_NIQ'),
    node('d/3', 'RCD_POS_BASE', ['legacy distribuição']),
    node('d/4', 'DISTRIBUICAO_RAW'),
  ];

  it('matches names and aliases, ignoring accents, best matches first', () => {
    expect(findNodes(nodes, 'distribuição').map((n) => n.id)).toEqual([
      'd/4',
      'd/1',
      'd/3',
    ]);
    expect(findNodes(nodes, 'master', 1).map((n) => n.id)).toEqual(['d/1']);
    expect(findNodes(nodes, '  ')).toEqual([]);
  });

  it('treats spaces, hyphens and underscores as the same', () => {
    const named = [node('d/soa', 'RCD_HIERARQUIA_SOA'), node('d/x', 'OTHER')];
    expect(findNodes(named, 'hierarquia soa').map((n) => n.id)).toEqual([
      'd/soa',
    ]);
    expect(findNodes(named, 'rcd-hierarquia').map((n) => n.id)).toEqual([
      'd/soa',
    ]);
  });
});
