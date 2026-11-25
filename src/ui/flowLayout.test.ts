import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { inside, type Rect } from './flowGeometry';
import { layoutFlow } from './flowLayout';
import { parseFlowchart, type FlowChart } from './flowParse';
import { sizeChart } from './flowSize';

/** Text a fixed 7px per character wide, so tests need no canvas. */
const measure = (text: string) => text.length * 7;

function laidOut(source: string) {
  const parsed = parseFlowchart(source);
  if (!parsed.ok) throw new Error(parsed.reason);
  const sized = sizeChart(parsed.chart, measure);
  return { chart: parsed.chart, layout: layoutFlow(sized.input) };
}

const overlap = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.width + gap &&
  b.x < a.x + a.width + gap &&
  a.y < b.y + b.height + gap &&
  b.y < a.y + a.height + gap;

const contains = (outer: Rect, inner: Rect, pad = 0) =>
  inner.x >= outer.x + pad - 0.01 &&
  inner.y >= outer.y + pad - 0.01 &&
  inner.x + inner.width <= outer.x + outer.width - pad + 0.01 &&
  inner.y + inner.height <= outer.y + outer.height - pad + 0.01;

/** Every subgraph a node or subgraph is in, outermost last. */
function holders(chart: FlowChart, id: string): string[] {
  const parent = new Map<string, string | null>();
  for (const sg of chart.subgraphs) {
    parent.set(sg.id, sg.parent);
    for (const n of sg.nodes) parent.set(n, sg.id);
  }
  const out: string[] = [];
  let current = parent.get(id) ?? null;
  while (current !== null) {
    out.push(current);
    current = parent.get(current) ?? null;
  }
  return out;
}

/** The geometric rules every layout must keep. */
function checkLayout(source: string) {
  const { chart, layout } = laidOut(source);
  const problems: string[] = [];
  const nodes = [...layout.nodes];
  expect(nodes).toHaveLength(chart.nodes.length);
  expect(layout.frames.size).toBe(chart.subgraphs.length);
  expect(layout.edges).toHaveLength(chart.edges.length);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const [a, ra] = nodes[i] as [string, Rect];
      const [b, rb] = nodes[j] as [string, Rect];
      if (overlap(ra, rb)) problems.push(`nodes ${a} and ${b} overlap`);
    }
  }
  for (const sg of chart.subgraphs) {
    const frame = layout.frames.get(sg.id) as Rect;
    for (const [id, rect] of nodes) {
      const isIn = holders(chart, id).includes(sg.id);
      if (isIn && !contains(frame, rect, 4)) {
        problems.push(`${id} sticks out of frame ${sg.id}`);
      }
      if (!isIn && overlap(frame, rect)) {
        problems.push(`${id} overlaps frame ${sg.id}`);
      }
    }
    for (const other of chart.subgraphs) {
      if (other.id === sg.id) continue;
      const otherFrame = layout.frames.get(other.id) as Rect;
      const nested =
        holders(chart, other.id).includes(sg.id) ||
        holders(chart, sg.id).includes(other.id);
      if (holders(chart, other.id).includes(sg.id)) {
        if (!contains(frame, otherFrame, 4)) {
          problems.push(`frame ${other.id} sticks out of ${sg.id}`);
        }
      } else if (!nested && overlap(frame, otherFrame)) {
        problems.push(`frames ${sg.id} and ${other.id} overlap`);
      }
    }
  }
  for (const route of layout.edges) {
    if (route.points.length < 2)
      problems.push(`edge ${route.index} has no route`);
    if (route.label === null) continue;
    for (const [id, rect] of nodes) {
      if (overlap(route.label, rect)) {
        problems.push(`label of edge ${route.index} overlaps ${id}`);
      }
    }
  }
  return { chart, layout, problems };
}

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/mermaid',
);
const flowcharts = readdirSync(fixtures)
  .filter((name) => name.endsWith('.mmd'))
  .map((name) => ({
    name,
    source: readFileSync(path.join(fixtures, name), 'utf8'),
  }))
  .filter(({ source }) => /^(flowchart|graph)\b/m.test(source));

describe('layoutFlow on the docs’ flowcharts', () => {
  it.each(flowcharts)(
    '$name keeps nodes, frames and labels apart',
    ({ source }) => {
      expect(checkLayout(source).problems).toEqual([]);
    },
  );
});

describe('layoutFlow', () => {
  it('lays TB flows top to bottom and LR flows left to right', () => {
    const tb = laidOut('flowchart TD\n a --> b --> c').layout.nodes;
    expect((tb.get('a') as Rect).y).toBeLessThan((tb.get('b') as Rect).y);
    expect((tb.get('b') as Rect).y).toBeLessThan((tb.get('c') as Rect).y);
    const lr = laidOut('flowchart LR\n a --> b --> c').layout.nodes;
    expect((lr.get('a') as Rect).x).toBeLessThan((lr.get('b') as Rect).x);
    const rl = laidOut('flowchart RL\n a --> b').layout.nodes;
    expect((rl.get('a') as Rect).x).toBeGreaterThan((rl.get('b') as Rect).x);
  });

  it('honours a subgraph direction when no edge crosses its frame', () => {
    const { layout } = laidOut(`flowchart TD
      subgraph s [S]
        direction LR
        a --> b --> c
      end
      s --> d`);
    const at = (id: string) => layout.nodes.get(id) as Rect;
    expect(at('a').x).toBeLessThan(at('b').x);
    expect(at('b').x).toBeLessThan(at('c').x);
    expect(Math.abs(at('a').y - at('c').y)).toBeLessThan(1);
    // The frame is above d, which the subgraph links to
    expect((layout.frames.get('s') as Rect).y).toBeLessThan(at('d').y);
  });

  it('wraps a subgraph of unlinked nodes into rows', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `node_number_${i}`);
    const { layout } = laidOut(
      `flowchart TD\n subgraph s [S]\n${ids.join('\n')}\n end\n s --> out`,
    );
    const ys = new Set(
      ids.map((id) => Math.round((layout.nodes.get(id) as Rect).y)),
    );
    expect(ys.size).toBeGreaterThan(1);
    expect((layout.frames.get('s') as Rect).width).toBeLessThan(900);
  });

  it('starts and ends edges to a subgraph at its frame', () => {
    const { layout } = laidOut(`flowchart LR
      subgraph s [S]
        a
        b
      end
      x --> a
      s --> c`);
    const frame = layout.frames.get('s') as Rect;
    const edge = layout.edges[1];
    const start = edge?.points[0];
    expect(start).toBeDefined();
    if (start === undefined) return;
    expect(inside(frame, start, 0.5)).toBe(true);
    expect(inside(frame, start, -0.5)).toBe(false);
  });

  it('ends edges on a diamond’s outline, not its box', () => {
    const { layout } = laidOut('flowchart TD\n a --> b{decide}');
    const b = layout.nodes.get('b') as Rect;
    const end = layout.edges[0]?.points.at(-1);
    expect(end?.y).toBeCloseTo(b.y, 0);
    expect(end?.x).toBeCloseTo(b.x + b.width / 2, 0);
  });

  it('nests frames inside frames with room for each title', () => {
    const { layout, problems } = checkLayout(`flowchart LR
      subgraph outer [Outer title that is fairly long]
        subgraph inner [Inner]
          a --> b
        end
        c
      end
      x --> a
      b --> c --> y`);
    expect(problems).toEqual([]);
    const outer = layout.frames.get('outer') as Rect;
    const inner = layout.frames.get('inner') as Rect;
    expect(inner.y - outer.y).toBeGreaterThan(20);
  });
});
