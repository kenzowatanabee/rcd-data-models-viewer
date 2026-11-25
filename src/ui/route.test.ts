import { describe, expect, it } from 'vitest';

import { DEFAULT_GRAPH, docHash, graphHash, parseHash } from './route';

describe('parseHash', () => {
  it('reads a doc and an optional anchor', () => {
    expect(parseHash('#/doc/docs/datasets/x.md')).toEqual({
      view: 'doc',
      file: 'docs/datasets/x.md',
      anchor: null,
    });
    expect(parseHash('#/doc/docs/open-questions.md#q22-a_b')).toEqual({
      view: 'doc',
      file: 'docs/open-questions.md',
      anchor: 'q22-a_b',
    });
  });

  it('falls back to the landing view', () => {
    expect(parseHash('')).toEqual({ view: 'home' });
    expect(parseHash('#/')).toEqual({ view: 'home' });
    expect(parseHash('#/doc/')).toEqual({ view: 'home' });
    expect(parseHash('#something')).toEqual({ view: 'home' });
  });

  it('round-trips through docHash', () => {
    for (const [file, anchor] of [
      ['docs/a b.md', null],
      ['docs/ção.md', 'seção-1'],
      ['guides/x%y.md', 'a#b'],
    ] as const) {
      expect(parseHash(docHash(file, anchor))).toEqual({
        view: 'doc',
        file,
        anchor,
      });
    }
    expect(docHash('docs/lineage.md')).toBe('#/doc/docs/lineage.md');
  });
});

describe('graph routes', () => {
  it('reads the whole graph with default options', () => {
    expect(parseHash('#/graph')).toEqual({ view: 'graph', ...DEFAULT_GRAPH });
    expect(parseHash('#/graph?')).toEqual({ view: 'graph', ...DEFAULT_GRAPH });
    expect(parseHash('#/graph/')).toEqual({ view: 'graph', ...DEFAULT_GRAPH });
    expect(parseHash('#/graphs')).toEqual({ view: 'home' });
  });

  it('reads a focused node and options', () => {
    expect(
      parseHash(
        '#/graph/docs/datasets/x.md?node=a&to=b&depth=2&external=hide&links=all',
      ),
    ).toEqual({
      view: 'graph',
      focus: 'docs/datasets/x.md',
      node: 'a',
      to: 'b',
      depth: 2,
      showExternal: false,
      showRedundant: true,
    });
    expect(parseHash('#/graph?depth=7')).toMatchObject({ depth: null });
  });

  it('round-trips awkward node ids through graphHash', () => {
    for (const id of [
      'docs/datasets/rcd-pos-base.md',
      'external:RCD_MASTER_PRODUCT (second copy)',
      'external:Retailer raw POS files',
      'external:A/B?c=d&e#f %20 +',
      'docs/pipelines/rcd-distribuição.md',
    ]) {
      const route = { ...DEFAULT_GRAPH, focus: id, node: id, to: id };
      expect(parseHash(graphHash(route))).toEqual({ view: 'graph', ...route });
      const selected = { ...DEFAULT_GRAPH, node: id, depth: 1 as const };
      expect(parseHash(graphHash(selected))).toEqual({
        view: 'graph',
        ...selected,
      });
    }
  });

  it('leaves defaults out of the address', () => {
    expect(graphHash()).toBe('#/graph');
    expect(
      graphHash({ focus: 'docs/datasets/x.md', node: 'docs/datasets/x.md' }),
    ).toBe('#/graph/docs/datasets/x.md');
    expect(graphHash({ focus: 'external:A B' })).toBe(
      '#/graph/external%3AA%20B',
    );
  });
});
