import dagre, {
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel,
} from '@dagrejs/dagre';

import {
  inside,
  leaveRect,
  shapeBorder,
  type Point,
  type Rect,
  type Size,
} from './flowGeometry';
import type { Direction, FlowChart, FlowSubgraph, Shape } from './flowParse';

export interface LayoutInput {
  chart: FlowChart;
  /** Outer size of each node's shape. */
  nodeSize: Map<string, Size>;
  /** Size of each edge label's box, by edge index. */
  edgeLabelSize: Map<number, Size>;
  /** Size of each subgraph's title text. */
  titleSize: Map<string, Size>;
}

export interface EdgeRoute {
  index: number;
  points: Point[];
  /** The axis the flow runs along where the edge is: x for LR/RL. */
  axis: Axis;
  /** The label's box, centred on the edge. */
  label: Rect | null;
}

export interface FlowLayout {
  nodes: Map<string, Rect>;
  /** Subgraph frames, title included. */
  frames: Map<string, Rect>;
  edges: EdgeRoute[];
  width: number;
  height: number;
}

export type Axis = 'x' | 'y';

interface Route {
  points: Point[];
  label: Rect | null;
  axis: Axis;
}

const NODE_SEP = 28;
// dagre doubles ranks (for edge labels), so ranks end up twice this apart
const RANK_SEP = 32;
const EDGE_SEP = 12;
/** Space between a frame and what it holds. */
export const FRAME_PAD = 12;
/** Space above a frame's title text, and below it before the content. */
export const TITLE_TOP = 6;
const TITLE_BELOW = 4;
const GRID_GAP = 14;
/** Edge-less subgraphs wrap into rows (or columns) about this long. */
const GRID_MAX_WIDTH = 760;
const GRID_MAX_HEIGHT = 420;

interface Local {
  nodes: Map<string, Rect>;
  frames: Map<string, Rect>;
  edges: Map<number, Route>;
  width: number;
  height: number;
}

interface Block extends Size {
  inner: Local;
  /** Where the inner layout's origin sits in the block. */
  offset: Point;
}

interface Cut {
  pos: number;
  amount: number;
  /** `start` moves what is at `pos` too; `end` only what is beyond it. */
  side: 'start' | 'end';
}

/** Space `cuts` insert before `v`; same-side cuts at one place merge. */
function shiftAt(cuts: Cut[], v: number): number {
  let total = 0;
  for (const cut of cuts) {
    if (cut.side === 'start' ? v >= cut.pos - 0.01 : v > cut.pos + 0.01) {
      total += cut.amount;
    }
  }
  return total;
}

function mergeCuts(cuts: Cut[]): Cut[] {
  const merged: Cut[] = [];
  for (const cut of cuts) {
    const same = merged.find(
      (c) => c.side === cut.side && Math.abs(c.pos - cut.pos) < 0.5,
    );
    if (same === undefined) merged.push({ ...cut });
    else same.amount = Math.max(same.amount, cut.amount);
  }
  return merged;
}

function union(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

const titleHeight = (size: Size | undefined) =>
  TITLE_TOP + (size?.height ?? 0) + TITLE_BELOW;

class Layouter {
  private readonly subgraph = new Map<string, FlowSubgraph>();
  /** The subgraph directly holding each node or subgraph. */
  private readonly parent = new Map<string, string | null>();
  private readonly isolatedCache = new Map<string, boolean>();

  constructor(private readonly input: LayoutInput) {
    const { chart } = input;
    for (const node of chart.nodes) this.parent.set(node.id, null);
    for (const sg of chart.subgraphs) {
      this.subgraph.set(sg.id, sg);
      this.parent.set(sg.id, sg.parent);
      for (const id of sg.nodes) this.parent.set(id, sg.id);
    }
  }

  /** Subgraphs around `id`, innermost first (not `id` itself). */
  private ancestors(id: string): string[] {
    const chain: string[] = [];
    let current = this.parent.get(id) ?? null;
    while (current !== null) {
      chain.push(current);
      current = this.parent.get(current) ?? null;
    }
    return chain;
  }

  private within(id: string, sg: string): boolean {
    return id !== sg && this.ancestors(id).includes(sg);
  }

  /**
   * No edge crosses its frame (edges to the subgraph itself attach to the
   * frame from outside), so it can be laid out on its own as one block.
   */
  private isolated(sg: string): boolean {
    let known = this.isolatedCache.get(sg);
    if (known === undefined) {
      known = !this.input.chart.edges.some(
        (e) => this.within(e.from, sg) !== this.within(e.to, sg),
      );
      this.isolatedCache.set(sg, known);
    }
    return known;
  }

  private directNodes(scope: string | null): string[] {
    if (scope === null) {
      return this.input.chart.nodes
        .filter((n) => this.parent.get(n.id) === null)
        .map((n) => n.id);
    }
    return this.subgraph.get(scope)?.nodes ?? [];
  }

  private childSubgraphs(scope: string | null): string[] {
    if (scope === null) {
      return this.input.chart.subgraphs
        .filter((sg) => sg.parent === null)
        .map((sg) => sg.id);
    }
    return this.subgraph.get(scope)?.subgraphs ?? [];
  }

  /** What stands for `id` in the layout of `scope`, or null if outside it. */
  private layoutId(id: string, scope: string | null): string | null {
    if (id === scope) return null;
    const isSubgraph = this.subgraph.has(id);
    const chain = isSubgraph ? [id, ...this.ancestors(id)] : this.ancestors(id);
    const end = scope === null ? chain.length : chain.indexOf(scope);
    if (end < 0) return null;
    for (let k = end - 1; k >= 0; k--) {
      const sg = chain[k] as string;
      if (this.isolated(sg)) return `block:${sg}`;
    }
    return isSubgraph ? `anchor:${id}` : id;
  }

  layout(): FlowLayout {
    const local = this.scope(null, this.input.chart.direction);
    return {
      nodes: local.nodes,
      frames: local.frames,
      edges: [...local.edges]
        .map(([index, route]) => ({ index, ...route }))
        .sort((a, b) => a.index - b.index),
      width: local.width,
      height: local.height,
    };
  }

  private block(sg: string, direction: Direction): Block {
    const own = this.subgraph.get(sg)?.direction ?? direction;
    const hasEdges = this.input.chart.edges.some(
      (e) => this.within(e.from, sg) && this.within(e.to, sg),
    );
    const inner = hasEdges ? this.scope(sg, own) : this.grid(sg, own);
    const title = this.input.titleSize.get(sg);
    const width = Math.max(
      inner.width + 2 * FRAME_PAD,
      (title?.width ?? 0) + 2 * FRAME_PAD,
    );
    const top = titleHeight(title) + FRAME_PAD;
    return {
      width,
      height: inner.height + top + FRAME_PAD,
      inner,
      offset: { x: (width - inner.width) / 2, y: top },
    };
  }

  /** Items of an edge-less subgraph in rows (TB/BT) or columns (LR/RL). */
  private grid(sg: string, direction: Direction): Local {
    const items: { key: string; size: Size; block: Block | null }[] = [
      ...this.directNodes(sg).map((id) => ({
        key: id,
        size: this.input.nodeSize.get(id) ?? { width: 0, height: 0 },
        block: null,
      })),
      ...this.childSubgraphs(sg).map((child) => {
        const block = this.block(child, direction);
        return { key: `block:${child}`, size: block, block };
      }),
    ];
    const rows = direction === 'TB' || direction === 'BT';
    const n = items.length;
    const longest = Math.max(
      1,
      ...items.map((i) => (rows ? i.size.width : i.size.height)),
    );
    const limit = rows ? GRID_MAX_WIDTH : GRID_MAX_HEIGHT;
    const perLine = Math.max(
      1,
      Math.min(n, Math.floor((limit + GRID_GAP) / (longest + GRID_GAP))),
    );
    const cell = (index: number) =>
      rows
        ? { col: index % perLine, row: Math.floor(index / perLine) }
        : { col: Math.floor(index / perLine), row: index % perLine };
    const colWidth: number[] = [];
    const rowHeight: number[] = [];
    items.forEach((item, index) => {
      const { col, row } = cell(index);
      colWidth[col] = Math.max(colWidth[col] ?? 0, item.size.width);
      rowHeight[row] = Math.max(rowHeight[row] ?? 0, item.size.height);
    });
    const colX = colWidth.map((_, c) =>
      colWidth.slice(0, c).reduce((sum, w) => sum + w + GRID_GAP, 0),
    );
    const rowY = rowHeight.map((_, r) =>
      rowHeight.slice(0, r).reduce((sum, h) => sum + h + GRID_GAP, 0),
    );
    const local: Local = {
      nodes: new Map(),
      frames: new Map(),
      edges: new Map(),
      width:
        colWidth.reduce((s, w) => s + w, 0) + GRID_GAP * (colWidth.length - 1),
      height:
        rowHeight.reduce((s, h) => s + h, 0) +
        GRID_GAP * (rowHeight.length - 1),
    };
    items.forEach((item, index) => {
      const { col, row } = cell(index);
      const rect = {
        x: (colX[col] ?? 0) + ((colWidth[col] ?? 0) - item.size.width) / 2,
        y: (rowY[row] ?? 0) + ((rowHeight[row] ?? 0) - item.size.height) / 2,
        ...item.size,
      };
      if (item.block === null) local.nodes.set(item.key, rect);
      else placeBlock(local, item.key.slice('block:'.length), rect, item.block);
    });
    return local;
  }

  private scope(scope: string | null, direction: Direction): Local {
    const { chart, nodeSize, edgeLabelSize, titleSize } = this.input;
    const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({
      compound: true,
      multigraph: true,
    });
    g.setGraph({
      rankdir: direction,
      nodesep: NODE_SEP,
      ranksep: RANK_SEP,
      edgesep: EDGE_SEP,
      marginx: 0,
      marginy: 0,
    });
    g.setDefaultEdgeLabel(() => ({}));

    const edges = chart.edges.flatMap((edge) => {
      const from = this.layoutId(edge.from, scope);
      const to = this.layoutId(edge.to, scope);
      if (from === null || to === null) return [];
      if (from === to && from.startsWith('block:')) return [];
      return [{ edge, from, to }];
    });
    const anchors = new Set(
      edges
        .flatMap(({ from, to }) => [from, to])
        .filter((id) => id.startsWith('anchor:')),
    );

    const blocks = new Map<string, Block>();
    const clusters: { id: string; depth: number }[] = [];
    /** Layout ids directly inside each cluster. */
    const contents = new Map<string, string[]>();
    const add = (
      container: string | null,
      holder: string | null,
      depth: number,
    ) => {
      const keys: string[] = [];
      const put = (key: string, label: NodeLabel) => {
        g.setNode(key, label);
        if (holder !== null) g.setParent(key, holder);
        keys.push(key);
      };
      for (const id of this.directNodes(container)) {
        const size = nodeSize.get(id) ?? { width: 40, height: 30 };
        put(id, { width: size.width, height: size.height });
      }
      for (const child of this.childSubgraphs(container)) {
        if (this.isolated(child)) {
          const block = this.block(child, direction);
          blocks.set(child, block);
          put(`block:${child}`, { width: block.width, height: block.height });
        } else {
          put(`cluster:${child}`, { width: 0, height: 0 });
          clusters.push({ id: child, depth });
          contents.set(child, add(child, `cluster:${child}`, depth + 1));
          if (anchors.has(`anchor:${child}`)) {
            g.setNode(`anchor:${child}`, { width: 1, height: 1 });
            g.setParent(`anchor:${child}`, `cluster:${child}`);
            contents.get(child)?.push(`anchor:${child}`);
          }
        }
      }
      return keys;
    };
    add(scope, null, 0);

    for (const { edge, from, to } of edges) {
      const label = edgeLabelSize.get(edge.index);
      g.setEdge(
        from,
        to,
        {
          minlen: edge.length,
          width: label?.width ?? 0,
          height: label?.height ?? 0,
          labelpos: 'c',
        },
        `e${edge.index}`,
      );
    }
    dagre.layout(g);

    const rects = new Map<string, Rect>();
    for (const key of g.nodes()) {
      if (key.startsWith('cluster:')) continue;
      const placed = g.node(key);
      const width = Number(placed.width);
      const height = Number(placed.height);
      rects.set(key, {
        x: (placed.x ?? 0) - width / 2,
        y: (placed.y ?? 0) - height / 2,
        width,
        height,
      });
    }
    const routes = new Map<number, Route>();
    const axis: Axis = direction === 'LR' || direction === 'RL' ? 'x' : 'y';
    for (const { edge, from, to } of edges) {
      const placed = g.edge({ v: from, w: to, name: `e${edge.index}` });
      const size = edgeLabelSize.get(edge.index);
      let points = (placed.points ?? []).map(({ x, y }) => ({ x, y }));
      // dagre puts a bend half way along every edge, even one between
      // neighbouring ranks; without a label to hold, one curve reads better
      if (points.length === 3 && size === undefined && from !== to) {
        points = [points[0] as Point, points[2] as Point];
      }
      routes.set(edge.index, {
        axis,
        points,
        label:
          size === undefined || placed.x === undefined || placed.y === undefined
            ? null
            : {
                x: placed.x - size.width / 2,
                y: placed.y - size.height / 2,
                ...size,
              },
      });
    }

    // Room for each frame's padding and title: cut the drawing open along
    // the frame's sides and push everything beyond outwards, innermost
    // frames first, so nothing that was apart can come to overlap
    const frames = new Map<string, Rect>();
    const inCluster = (id: string): string[] =>
      (contents.get(id) ?? []).flatMap((key) =>
        key.startsWith('cluster:')
          ? [key, ...inCluster(key.slice('cluster:'.length))]
          : [key],
      );
    const contentBox = (id: string): Rect | null => {
      const keys = new Set(inCluster(id));
      const boxes: Rect[] = [];
      for (const key of keys) {
        if (key.startsWith('cluster:')) {
          const frame = frames.get(key.slice('cluster:'.length));
          if (frame) boxes.push(frame);
        } else {
          const rect = rects.get(key);
          if (rect) boxes.push(rect);
        }
      }
      for (const { edge, from, to } of edges) {
        const label = routes.get(edge.index)?.label;
        if (label && keys.has(from) && keys.has(to)) boxes.push(label);
      }
      return union(boxes);
    };
    const moveRect = (rect: Rect, xs: Cut[], ys: Cut[]) => {
      const dx = shiftAt(xs, rect.x + rect.width / 2);
      const dy = shiftAt(ys, rect.y + rect.height / 2);
      rect.x += dx;
      rect.y += dy;
    };
    const maxDepth = Math.max(-1, ...clusters.map((c) => c.depth));
    for (let depth = maxDepth; depth >= 0; depth--) {
      const level = clusters.filter((c) => c.depth === depth);
      const xs: Cut[] = [];
      const ys: Cut[] = [];
      for (const { id } of level) {
        const box = contentBox(id);
        if (box === null) continue;
        const title = titleSize.get(id);
        const extra = Math.max(0, (title?.width ?? 0) - box.width);
        ys.push({
          pos: box.y,
          amount: FRAME_PAD + titleHeight(title),
          side: 'start',
        });
        ys.push({ pos: box.y + box.height, amount: FRAME_PAD, side: 'end' });
        xs.push({ pos: box.x, amount: FRAME_PAD, side: 'start' });
        xs.push({
          pos: box.x + box.width,
          amount: FRAME_PAD + extra,
          side: 'end',
        });
      }
      const mx = mergeCuts(xs);
      const my = mergeCuts(ys);
      for (const rect of rects.values()) moveRect(rect, mx, my);
      for (const rect of frames.values()) moveRect(rect, mx, my);
      for (const route of routes.values()) {
        route.points = route.points.map((p) => ({
          x: p.x + shiftAt(mx, p.x),
          y: p.y + shiftAt(my, p.y),
        }));
        if (route.label) moveRect(route.label, mx, my);
      }
      for (const { id } of level) {
        const box = contentBox(id);
        if (box === null) continue;
        const title = titleSize.get(id);
        const top = FRAME_PAD + titleHeight(title);
        frames.set(id, {
          x: box.x - FRAME_PAD,
          y: box.y - top,
          width: Math.max(box.width, title?.width ?? 0) + 2 * FRAME_PAD,
          height: box.height + top + FRAME_PAD,
        });
      }
    }

    // Edges end on the node's outline, and at a subgraph's frame
    const shapes = new Map(chart.nodes.map((n) => [n.id, n.shape]));
    for (const { edge, from, to } of edges) {
      const route = routes.get(edge.index);
      if (route === undefined || route.points.length < 2) continue;
      const fix = (points: Point[], key: string, toward: Point): Point[] => {
        if (key.startsWith('anchor:')) {
          const frame = frames.get(key.slice('anchor:'.length));
          if (frame === undefined) return points;
          const out = points.findIndex((p) => !inside(frame, p, -0.5));
          if (out <= 0) return points;
          return [
            leaveRect(frame, points[out - 1] as Point, points[out] as Point),
            ...points.slice(out),
          ];
        }
        const shape = key.startsWith('block:') ? 'rect' : shapes.get(key);
        const rect = rects.get(key);
        if (shape === undefined || rect === undefined) return points;
        return [attach(shape, rect, toward, axis), ...points.slice(1)];
      };
      // A loop keeps dagre's own route
      if (from === to) continue;
      let points = fix(route.points, from, route.points[1] as Point);
      points = fix(
        [...points].reverse(),
        to,
        points[points.length - 2] as Point,
      ).reverse();
      route.points = points;
    }

    const local: Local = {
      nodes: new Map(),
      frames,
      edges: routes,
      width: 0,
      height: 0,
    };
    for (const [key, rect] of rects) {
      if (key.startsWith('anchor:')) continue;
      if (key.startsWith('block:')) {
        const id = key.slice('block:'.length);
        placeBlock(local, id, rect, blocks.get(id) as Block);
      } else {
        local.nodes.set(key, rect);
      }
    }
    normalise(local);
    return local;
  }
}

/**
 * Where an edge meets a node: on the side facing the way the flow runs
 * (so edges leave and arrive along the flow, not at corners), moved a
 * little towards where the edge goes.
 */
function attach(shape: Shape, rect: Rect, toward: Point, axis: Axis): Point {
  const across: Axis = axis === 'x' ? 'y' : 'x';
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const along = axis === 'x' ? rect.width / 2 : rect.height / 2;
  const half = axis === 'x' ? rect.height / 2 : rect.width / 2;
  const sign = toward[axis] - centre[axis] >= 0 ? 1 : -1;
  const shift = Math.max(
    -half / 2,
    Math.min(half / 2, toward[across] - centre[across]),
  );
  const side = { ...centre };
  side[axis] += sign * along;
  side[across] += shift;
  const round = ['circle', 'doublecircle', 'diamond', 'hexagon'].includes(
    shape,
  );
  return round ? shapeBorder(shape, rect, side) : side;
}

/** Puts a block's frame and its laid-out content at `rect`. */
function placeBlock(local: Local, id: string, rect: Rect, block: Block): void {
  local.frames.set(id, { ...rect });
  const dx = rect.x + block.offset.x;
  const dy = rect.y + block.offset.y;
  const move = (r: Rect): Rect => ({ ...r, x: r.x + dx, y: r.y + dy });
  for (const [key, r] of block.inner.nodes) local.nodes.set(key, move(r));
  for (const [key, r] of block.inner.frames) local.frames.set(key, move(r));
  for (const [index, route] of block.inner.edges) {
    local.edges.set(index, {
      axis: route.axis,
      points: route.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      label: route.label && move(route.label),
    });
  }
}

/** Moves everything so the top-left is at 0,0 and sets the size. */
function normalise(local: Local): void {
  const boxes: Rect[] = [...local.nodes.values(), ...local.frames.values()];
  for (const route of local.edges.values()) {
    if (route.label) boxes.push(route.label);
    for (const p of route.points) boxes.push({ ...p, width: 0, height: 0 });
  }
  const all = union(boxes) ?? { x: 0, y: 0, width: 0, height: 0 };
  const move = (r: Rect) => {
    r.x -= all.x;
    r.y -= all.y;
  };
  local.nodes.forEach(move);
  local.frames.forEach(move);
  for (const route of local.edges.values()) {
    if (route.label) move(route.label);
    route.points = route.points.map((p) => ({
      x: p.x - all.x,
      y: p.y - all.y,
    }));
  }
  local.width = all.width;
  local.height = all.height;
}

/**
 * Lays a parsed flowchart out with dagre. Subgraphs no edge crosses are laid
 * out on their own, in their own `direction` (as Mermaid does), and placed
 * as one block; ones without edges inside wrap into a grid. Other subgraphs
 * are dagre clusters, whose frames get their title room afterwards. Edges to
 * a subgraph start or end at its frame.
 */
export function layoutFlow(input: LayoutInput): FlowLayout {
  return new Layouter(input).layout();
}
