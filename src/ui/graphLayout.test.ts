import { describe, expect, it } from 'vitest';

import {
  arrowPath,
  curvePath,
  layoutBands,
  layoutGraph,
  routePath,
  wrapLabel,
  wrapNodes,
  type Rect,
} from './graphLayout';

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

describe('wrapNodes', () => {
  it('fills rows up to the width, then starts a new one', () => {
    const wrapped = wrapNodes(['a', 'b', 'c'].map(box), 230);
    expect(wrapped.positions.get('a')).toEqual({ x: 0, y: 0 });
    expect(wrapped.positions.get('b')?.y).toBe(0);
    expect(wrapped.positions.get('c')?.x).toBe(0);
    expect(wrapped.positions.get('c')?.y).toBeGreaterThan(30);
    expect(wrapped.width).toBe(214);
    expect(wrapNodes([], 100).height).toBe(0);
  });
});

describe('layoutBands', () => {
  const inside = (rect: Rect | undefined, x: number, y: number) =>
    rect !== undefined &&
    x >= rect.x &&
    y >= rect.y &&
    x <= rect.x + rect.width &&
    y <= rect.y + rect.height;
  const overlap = (a: Rect, b: Rect) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

  // F1: a -> p -> b -> q -> c ; F2: d -> r ; LOOK feeds p and r ; z alone
  const input = {
    nodes: ['a', 'p', 'b', 'q', 'c', 'd', 'r', 'LOOK', 'z'].map(box),
    edges: [
      link('a', 'p'),
      link('p', 'b'),
      link('b', 'q'),
      link('q', 'c'),
      link('d', 'r'),
      link('LOOK', 'p'),
      link('LOOK', 'r'),
      link('c', 'd'),
    ],
    groups: [
      {
        id: 'lookups',
        nodes: ['LOOK'],
        column: 'side' as const,
        arrange: 'wrap' as const,
      },
      {
        id: 'F1',
        nodes: ['a', 'p', 'b', 'q', 'c'],
        column: 'main' as const,
        arrange: 'flow' as const,
      },
      {
        id: 'F2',
        nodes: ['d', 'r'],
        column: 'main' as const,
        arrange: 'flow' as const,
      },
      {
        id: 'loose',
        nodes: ['z'],
        column: 'main' as const,
        arrange: 'wrap' as const,
      },
    ],
  };
  const layout = layoutBands(input);

  it('frames every group and keeps each node inside its own frame', () => {
    expect([...layout.bands.keys()]).toEqual(['lookups', 'F1', 'F2', 'loose']);
    for (const group of input.groups) {
      for (const id of group.nodes) {
        const at = layout.positions.get(id);
        expect(at).toBeDefined();
        const band = layout.bands.get(group.id);
        expect(inside(band, at?.x ?? NaN, at?.y ?? NaN)).toBe(true);
        expect(inside(band, (at?.x ?? 0) + 100, (at?.y ?? 0) + 30)).toBe(true);
      }
    }
    const frames = [...layout.bands.values()];
    for (const [i, a] of frames.entries()) {
      for (const b of frames.slice(i + 1)) expect(overlap(a, b)).toBe(false);
    }
  });

  it('puts the side column left of everything else', () => {
    const side = layout.bands.get('lookups') as Rect;
    for (const id of ['F1', 'F2', 'loose']) {
      expect(layout.bands.get(id)?.x).toBeGreaterThan(side.x + side.width);
    }
  });

  it('packs small groups side by side', () => {
    expect(layout.bands.get('F2')?.y).toBe(layout.bands.get('F1')?.y);
    expect(layout.bands.get('F2')?.x).toBeGreaterThan(
      layout.bands.get('F1')?.x ?? Infinity,
    );
  });

  it('routes edges inside a family and curves the ones between groups', () => {
    const x = (id: string) => layout.positions.get(id)?.x ?? NaN;
    expect(x('a')).toBeLessThan(x('p'));
    expect(x('q')).toBeLessThan(x('c'));
    expect(layout.curved.has('a>p')).toBe(false);
    expect([...layout.curved].sort()).toEqual(['LOOK>p', 'LOOK>r', 'c>d']);
    for (const key of layout.curved) {
      expect(layout.routes.get(key)).toHaveLength(4);
    }
  });

  it('gives bounds that hold every frame', () => {
    for (const band of layout.bands.values()) {
      expect(band.x + band.width).toBeLessThanOrEqual(layout.bounds.width);
      expect(band.y + band.height).toBeLessThanOrEqual(layout.bounds.height);
    }
  });

  it('is the same for the same input and handles an empty one', () => {
    expect(layoutBands(input)).toEqual(layout);
    const empty = layoutBands({ nodes: [], edges: [], groups: [] });
    expect(empty.bands.size).toBe(0);
    expect(empty.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('curvePath', () => {
  it('draws a cubic through four points', () => {
    expect(
      curvePath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 5 },
        { x: 30, y: 5 },
      ]),
    ).toBe('M0,0 C10,0 20,5 30,5');
    expect(curvePath([])).toBe('');
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
