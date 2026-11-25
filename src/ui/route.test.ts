import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRAPH,
  docHash,
  graphHash,
  healthHash,
  parseHash,
} from './route';

const plain = { source: false, line: null };

describe('parseHash', () => {
  it('reads a doc and an optional anchor', () => {
    expect(parseHash('#/doc/docs/datasets/x.md')).toEqual({
      view: 'doc',
      file: 'docs/datasets/x.md',
      anchor: null,
      ...plain,
    });
    expect(parseHash('#/doc/docs/open-questions.md#q22-a_b')).toEqual({
      view: 'doc',
      file: 'docs/open-questions.md',
      anchor: 'q22-a_b',
      ...plain,
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
        ...plain,
      });
    }
    expect(docHash('docs/lineage.md')).toBe('#/doc/docs/lineage.md');
  });

  it('reads the Markdown view and a source line', () => {
    expect(docHash('docs/a.md', null, { source: true, line: 42 })).toBe(
      '#/doc/docs/a.md?view=md&line=42',
    );
    expect(parseHash('#/doc/docs/a.md?view=md&line=42#cols')).toEqual({
      view: 'doc',
      file: 'docs/a.md',
      anchor: 'cols',
      source: true,
      line: 42,
    });
    // A line only means something in the Markdown view; junk is ignored
    expect(parseHash('#/doc/docs/a.md?line=4')).toMatchObject(plain);
    expect(parseHash('#/doc/docs/a.md?view=md&line=-3')).toMatchObject({
      source: true,
      line: null,
    });
    // An encoded `?` stays part of the file name
    expect(parseHash(docHash('docs/why?.md', null, { source: true }))).toEqual({
      view: 'doc',
      file: 'docs/why?.md',
      anchor: null,
      source: true,
      line: null,
    });
  });
});

describe('health routes', () => {
  it('reads a section and a filter', () => {
    expect(parseHash('#/health')).toEqual({
      view: 'health',
      section: null,
      query: null,
    });
    expect(parseHash(healthHash('one-sided', 'docs/a b.md'))).toEqual({
      view: 'health',
      section: 'one-sided',
      query: 'docs/a b.md',
    });
    expect(healthHash()).toBe('#/health');
    expect(healthHash('status')).toBe('#/health#status');
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
        '#/graph/docs/datasets/x.md?node=a&to=b&depth=2&external=hide&links=all&lookups=wires',
      ),
    ).toEqual({
      view: 'graph',
      focus: 'docs/datasets/x.md',
      node: 'a',
      to: 'b',
      depth: 2,
      showExternal: false,
      showRedundant: true,
      lookupWires: true,
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
    expect(graphHash({ lookupWires: true })).toBe('#/graph?lookups=wires');
    expect(graphHash({ focus: 'external:A B' })).toBe(
      '#/graph/external%3AA%20B',
    );
  });
});
