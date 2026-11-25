import { describe, expect, it } from 'vitest';

import type { Graph, GraphNode } from '../indexer/types';
import { gapsFor, neighbours } from './lineage';

const node = (id: string, name: string): GraphNode => ({
  id,
  kind: id.startsWith('external:')
    ? 'external'
    : id.includes('/pipelines/')
      ? 'pipeline'
      : 'dataset',
  name,
  aliases: [],
  file: id.startsWith('external:') ? null : id,
  title: null,
  layer: null,
  platform: null,
  status: null,
  domoId: null,
  lastUpdated: null,
});

const raw = 'docs/datasets/raw.md';
const other = 'docs/datasets/other.md';
const flow = 'docs/pipelines/flow.md';
const out = 'docs/datasets/out.md';

const graph: Graph = {
  nodes: [
    node(raw, 'RAW'),
    node(other, 'OTHER'),
    node(flow, 'FLOW'),
    node(out, 'OUT'),
    node('external:SHEET', 'SHEET'),
  ],
  edges: [
    { from: raw, to: flow, declaredBy: [`${flow}#inputs`] },
    { from: 'external:SHEET', to: flow, declaredBy: [`${flow}#inputs`] },
    { from: flow, to: out, declaredBy: [`${flow}#outputs`, `${out}#pipeline`] },
    { from: raw, to: out, declaredBy: [`${out}#upstream`] },
    { from: other, to: raw, declaredBy: [`${raw}#upstream`] },
  ],
  references: [
    {
      file: flow,
      field: 'inputs',
      ref: 'SHEET',
      status: 'unresolved',
      target: 'external:SHEET',
      candidates: [],
    },
    {
      file: out,
      field: 'upstream',
      ref: 'DUP',
      status: 'ambiguous',
      target: null,
      candidates: [raw, other],
    },
    {
      file: out,
      field: 'upstream',
      ref: 'RAW',
      status: 'exact',
      target: raw,
      candidates: [],
    },
  ],
  oneSided: [
    {
      from: raw,
      to: flow,
      declaredBy: `${flow}#inputs`,
      missing: `${raw}#downstream`,
      uncertain: false,
    },
  ],
  problems: [],
};

describe('neighbours', () => {
  it('lists direct upstream and downstream nodes, sorted by name', () => {
    const result = neighbours(graph, flow);
    expect(result.upstream.map((n) => n.node.name)).toEqual(['RAW', 'SHEET']);
    expect(result.downstream).toEqual([
      {
        node: graph.nodes[3],
        declaredBy: [`${flow}#outputs`, `${out}#pipeline`],
      },
    ]);
  });

  it('does not follow edges further than one step', () => {
    const result = neighbours(graph, out);
    expect(result.upstream.map((n) => n.node.name)).toEqual(['FLOW', 'RAW']);
    expect(result.downstream).toEqual([]);
  });

  it('returns nothing for an unknown node', () => {
    expect(neighbours(graph, 'docs/x.md')).toEqual({
      upstream: [],
      downstream: [],
    });
  });
});

describe('gapsFor', () => {
  it('finds one-sided links on either side', () => {
    expect(gapsFor(graph, raw).oneSided).toHaveLength(1);
    expect(gapsFor(graph, flow).oneSided).toHaveLength(1);
    expect(gapsFor(graph, out).oneSided).toHaveLength(0);
  });

  it('finds problem references made by or pointing at a doc', () => {
    expect(gapsFor(graph, flow).references.map((r) => r.ref)).toEqual([
      'SHEET',
    ]);
    expect(gapsFor(graph, out).references.map((r) => r.ref)).toEqual(['DUP']);
    // a candidate of an ambiguous name
    expect(gapsFor(graph, other).references.map((r) => r.ref)).toEqual(['DUP']);
  });
});
