import { describe, expect, it } from 'vitest';

import { arrowPath, layoutGraph, routePath, wrapLabel } from './graphLayout';

const box = (id: string) => ({ id, width: 100, height: 30 });
const link = (from: string, to: string) => ({ key: `${from}>${to}`, from, to });

describe('layoutGraph', () => {
  it('puts data sources left of what they feed', () => {
    const layout = layoutGraph({
      nodes: ['a', 'p', 'b', 'c'].map(box),
      edges: [link('a', 'p'), link('p', 'b'), link('b', 'c')],
    });
    const x = (id: string) => layout.positions.get(id)?.x ?? NaN;
    expect(x('a')).toBeLessThan(x('p'));
    expect(x('p')).toBeLessThan(x('b'));
    expect(x('b')).toBeLessThan(x('c'));
    expect(layout.routes.get('a>p')?.length).toBeGreaterThanOrEqual(2);
    expect(layout.unlinkedRow).toBeNull();
  });

  it('places nodes without edges in a row below the graph', () => {
    const layout = layoutGraph({
      nodes: ['a', 'b', 'lonely1', 'lonely2'].map(box),
      edges: [link('a', 'b'), link('a', 'missing')],
    });
    const graphBottom = Math.max(
      ...['a', 'b'].map((id) => (layout.positions.get(id)?.y ?? 0) + 30),
    );
    expect(layout.unlinkedRow?.y).toBeGreaterThan(graphBottom);
    for (const id of ['lonely1', 'lonely2']) {
      expect(layout.positions.get(id)?.y).toBeGreaterThan(
        layout.unlinkedRow?.y ?? Infinity,
      );
    }
    expect(layout.positions.get('lonely1')?.y).toBe(
      layout.positions.get('lonely2')?.y,
    );
    expect(layout.routes.has('a>missing')).toBe(false);
  });

  it('lays out cycles and self-loops without failing', () => {
    const layout = layoutGraph({
      nodes: ['a', 'b', 'c'].map(box),
      edges: [link('a', 'b'), link('b', 'c'), link('c', 'a'), link('b', 'b')],
    });
    expect(layout.positions.size).toBe(3);
    for (const { x, y } of layout.positions.values()) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    }
  });

  it('handles an empty graph and a graph of loose nodes', () => {
    expect(layoutGraph({ nodes: [], edges: [] }).positions.size).toBe(0);
    const loose = layoutGraph({ nodes: [box('x')], edges: [] });
    expect(loose.unlinkedRow).toEqual({ x: 0, y: 0 });
    expect(loose.positions.get('x')?.y).toBeGreaterThan(0);
  });
});

describe('routePath', () => {
  it('draws a straight line for two points and rounds corners otherwise', () => {
    expect(
      routePath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBe('M0,0 L10,0');
    expect(
      routePath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe('M0,0 Q10,0 10,5 L10,10');
    expect(routePath([])).toBe('');
  });
});

describe('arrowPath', () => {
  it('points along the last segment', () => {
    const d = arrowPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(d.startsWith('M10,0 L')).toBe(true);
    expect(arrowPath([{ x: 0, y: 0 }])).toBe('');
  });
});

describe('wrapLabel', () => {
  // one unit per character
  const measure = (text: string) => text.length;

  it('breaks after separators', () => {
    expect(wrapLabel('RCD_TAB_MKT_CUSTOMER_COMPLETO', 12, measure)).toEqual([
      'RCD_TAB_MKT_',
      'CUSTOMER_',
      'COMPLETO',
    ]);
    expect(wrapLabel('Retailer raw POS files', 12, measure)).toEqual([
      'Retailer raw',
      'POS files',
    ]);
    expect(wrapLabel('SHORT', 12, measure)).toEqual(['SHORT']);
  });

  it('cuts a piece that has no separator and is too wide', () => {
    expect(wrapLabel('ABCDEFGHIJ', 4, measure)).toEqual(['ABCD', 'EFGH', 'IJ']);
  });
});
