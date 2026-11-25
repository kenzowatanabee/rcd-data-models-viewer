import dagre, {
  type EdgeLabel,
  type GraphLabel,
  type NodeLabel,
} from '@dagrejs/dagre';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface LayoutInput {
  nodes: ({ id: string } & Size)[];
  edges: { key: string; from: string; to: string }[];
}

export interface Layout {
  /** Top-left corner of each node. */
  positions: Map<string, Point>;
  /** Route of each edge, from the source's border to the target's. */
  routes: Map<string, Point[]>;
  /** Where the row of nodes without edges starts, if there are any. */
  unlinkedRow: Point | null;
}

const NODE_GAP = 14;
const RANK_GAP = 70;
const ROW_GAP = 60;
/** Room above the unlinked row for its caption. */
const CAPTION = 24;

/**
 * Lays the linked nodes out left to right with dagre (data flows towards
 * the right; dagre reverses cycle edges internally, so cycles do not
 * break it) and puts nodes without edges in a wrapped row underneath, so
 * they stay visible instead of piling up in the first column.
 */
export function layoutGraph(input: LayoutInput): Layout {
  const ids = new Set(input.nodes.map((node) => node.id));
  const edges = input.edges.filter(
    (edge) => ids.has(edge.from) && ids.has(edge.to),
  );
  const linked = new Set(edges.flatMap((edge) => [edge.from, edge.to]));

  const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({
    multigraph: true,
  });
  g.setGraph({
    rankdir: 'LR',
    nodesep: NODE_GAP,
    ranksep: RANK_GAP,
    edgesep: 8,
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of input.nodes) {
    if (linked.has(node.id)) {
      g.setNode(node.id, { width: node.width, height: node.height });
    }
  }
  for (const edge of edges) {
    g.setEdge(edge.from, edge.to, {}, edge.key);
  }
  dagre.layout(g);

  const positions = new Map<string, Point>();
  let right = 0;
  let bottom = 0;
  for (const node of input.nodes) {
    if (!linked.has(node.id)) continue;
    const placed = g.node(node.id);
    const x = (placed.x ?? 0) - node.width / 2;
    const y = (placed.y ?? 0) - node.height / 2;
    positions.set(node.id, { x, y });
    right = Math.max(right, x + node.width);
    bottom = Math.max(bottom, y + node.height);
  }

  const routes = new Map<string, Point[]>();
  for (const edge of edges) {
    const points = g.edge(edge.from, edge.to, edge.key)?.points ?? [];
    routes.set(
      edge.key,
      points.map(({ x, y }) => ({ x, y })),
    );
  }

  const loose = input.nodes.filter((node) => !linked.has(node.id));
  let unlinkedRow: Point | null = null;
  if (loose.length > 0) {
    const top = linked.size > 0 ? bottom + ROW_GAP : 0;
    unlinkedRow = { x: 0, y: top };
    // Wrap at the graph's width, but never narrower than a few nodes
    const wrapped = wrapNodes(loose, Math.max(right, 900));
    for (const [id, { x, y }] of wrapped.positions) {
      positions.set(id, { x, y: y + top + CAPTION });
    }
  }

  return { positions, routes, unlinkedRow };
}

/** Places nodes left to right in rows no wider than `wrapAt`. */
export function wrapNodes(
  nodes: ({ id: string } & Size)[],
  wrapAt: number,
): { positions: Map<string, Point> } & Size {
  const positions = new Map<string, Point>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const node of nodes) {
    if (x > 0 && x + node.width > wrapAt) {
      x = 0;
      y += rowHeight + NODE_GAP;
      rowHeight = 0;
    }
    positions.set(node.id, { x, y });
    width = Math.max(width, x + node.width);
    x += node.width + NODE_GAP;
    rowHeight = Math.max(rowHeight, node.height);
  }
  return { positions, width, height: nodes.length > 0 ? y + rowHeight : 0 };
}

export interface Rect extends Point, Size {}

export interface BandGroup {
  id: string;
  nodes: string[];
  /** `side` groups stack in a column on the left, `main` ones pack in rows. */
  column: 'side' | 'main';
  /** Lay the group out with dagre, or just wrap its nodes in rows. */
  arrange: 'flow' | 'wrap';
}

export interface BandsInput extends LayoutInput {
  /** In display order; each node belongs to one group at most. */
  groups: BandGroup[];
}

export interface BandsLayout {
  positions: Map<string, Point>;
  routes: Map<string, Point[]>;
  /** Edges between groups: drawn as a curve through their four points. */
  curved: Set<string>;
  /** The frame of each group, title included. */
  bands: Map<string, Rect>;
  bounds: Rect;
}

export const BAND_PAD = 14;
/** Room at the top of a frame for its title. */
export const BAND_TITLE = 28;
const BAND_GAP = 26;
/** Room between the side column and the rest, for the wires that cross it. */
const SIDE_GAP = 140;
/** Small families pack side by side up to this width, or the widest band's. */
const MIN_ROW = 1400;
const MIN_SIDE = 360;

/**
 * Lays each group out on its own, frames it, and arranges the frames:
 * `side` groups in a column on the left, `main` groups in rows to its
 * right, a large group taking a row and small ones sharing one. Edges
 * inside a `flow` group follow dagre's route; any other edge becomes a
 * curve from its source's right side to its target's left, so it never
 * moves a node.
 */
export function layoutBands(input: BandsInput): BandsLayout {
  const sized = new Map(input.nodes.map((node) => [node.id, node]));
  const groupOf = new Map<string, string>();
  for (const group of input.groups) {
    for (const id of group.nodes) if (sized.has(id)) groupOf.set(id, group.id);
  }
  const edges = input.edges.filter(
    (edge) => sized.has(edge.from) && sized.has(edge.to),
  );
  const inside = (group: BandGroup) =>
    group.arrange === 'flow'
      ? edges.filter(
          (edge) =>
            groupOf.get(edge.from) === group.id &&
            groupOf.get(edge.to) === group.id,
        )
      : [];

  interface Local extends Size {
    positions: Map<string, Point>;
    routes: Map<string, Point[]>;
  }
  const local = new Map<string, Local>();
  const members = (group: BandGroup) =>
    group.nodes
      .map((id) => sized.get(id))
      .filter((node): node is { id: string } & Size => node !== undefined);
  const flow = (group: BandGroup): Local | null => {
    const own = inside(group);
    if (own.length === 0) return null;
    const placed = layoutGraph({ nodes: members(group), edges: own });
    let width = 0;
    let height = 0;
    for (const node of members(group)) {
      const at = placed.positions.get(node.id) ?? { x: 0, y: 0 };
      width = Math.max(width, at.x + node.width);
      height = Math.max(height, at.y + node.height);
    }
    return {
      positions: placed.positions,
      routes: placed.routes,
      width,
      height,
    };
  };
  const wrap = (group: BandGroup, wrapAt: number): Local => ({
    ...wrapNodes(members(group), wrapAt),
    routes: new Map(),
  });
  // Flowing groups first: their widths set how wide the wrapped ones get
  for (const group of input.groups) {
    const placed = flow(group);
    if (placed !== null) local.set(group.id, placed);
  }
  const frameWidth = (id: string) => (local.get(id)?.width ?? 0) + 2 * BAND_PAD;
  const widest = (column: BandGroup['column'], least: number) =>
    Math.max(
      least,
      ...input.groups
        .filter((g) => g.column === column && local.has(g.id))
        .map((g) => frameWidth(g.id)),
    );
  const sideWidth = widest('side', MIN_SIDE);
  const rowWidth = widest('main', MIN_ROW);
  for (const group of input.groups) {
    if (local.has(group.id)) continue;
    const limit = group.column === 'side' ? sideWidth : rowWidth;
    local.set(group.id, wrap(group, limit - 2 * BAND_PAD));
  }

  const bands = new Map<string, Rect>();
  const frame = (group: BandGroup): Size => {
    const placed = local.get(group.id) as Local;
    return {
      width: placed.width + 2 * BAND_PAD,
      height: placed.height + BAND_TITLE + 2 * BAND_PAD,
    };
  };
  const shown = input.groups.filter((g) => members(g).length > 0);

  let y = 0;
  const side = shown.filter((g) => g.column === 'side');
  for (const group of side) {
    const size = frame(group);
    bands.set(group.id, { x: 0, y, ...size, width: sideWidth });
    y += size.height + BAND_GAP;
  }
  const left = side.length > 0 ? sideWidth + SIDE_GAP : 0;
  let x = left;
  y = 0;
  let rowHeight = 0;
  for (const group of shown.filter((g) => g.column === 'main')) {
    const size = frame(group);
    if (x > left && x + size.width > left + rowWidth) {
      x = left;
      y += rowHeight + BAND_GAP;
      rowHeight = 0;
    }
    bands.set(group.id, { x, y, ...size });
    x += size.width + BAND_GAP;
    rowHeight = Math.max(rowHeight, size.height);
  }

  const positions = new Map<string, Point>();
  const routes = new Map<string, Point[]>();
  for (const group of shown) {
    const band = bands.get(group.id) as Rect;
    const placed = local.get(group.id) as Local;
    const dx = band.x + BAND_PAD;
    const dy = band.y + BAND_TITLE + BAND_PAD;
    for (const [id, at] of placed.positions) {
      positions.set(id, { x: at.x + dx, y: at.y + dy });
    }
    for (const [key, points] of placed.routes) {
      routes.set(
        key,
        points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      );
    }
  }

  const curved = new Set<string>();
  for (const edge of edges) {
    if (routes.has(edge.key)) continue;
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (from === undefined || to === undefined) continue;
    const a = sized.get(edge.from) as Size;
    const b = sized.get(edge.to) as Size;
    const start = { x: from.x + a.width, y: from.y + a.height / 2 };
    const end = { x: to.x, y: to.y + b.height / 2 };
    const bend = Math.max(60, Math.abs(end.x - start.x) / 2);
    routes.set(edge.key, [
      start,
      { x: start.x + bend, y: start.y },
      { x: end.x - bend, y: end.y },
      end,
    ]);
    curved.add(edge.key);
  }

  let right = 0;
  let bottom = 0;
  for (const band of bands.values()) {
    right = Math.max(right, band.x + band.width);
    bottom = Math.max(bottom, band.y + band.height);
  }
  return {
    positions,
    routes,
    curved,
    bands,
    bounds: { x: 0, y: 0, width: right, height: bottom },
  };
}

/** A cubic curve through a four-point route: start, two controls, end. */
export function curvePath(points: Point[]): string {
  const [a, b, c, d] = points;
  if (a === undefined || b === undefined || c === undefined || d === undefined)
    return routePath(points);
  const at = (p: Point) => `${round(p.x)},${round(p.y)}`;
  return `M${at(a)} C${at(b)} ${at(c)} ${at(d)}`;
}

/**
 * An SVG path through the route: straight ends, and corners rounded by
 * curving through the midpoints of the segments around them.
 */
export function routePath(points: Point[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  const at = (p: Point) => `${round(p.x)},${round(p.y)}`;
  let d = `M${at(first)}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const corner = rest[i] as Point;
    const after = rest[i + 1] as Point;
    d += ` Q${at(corner)} ${at({ x: (corner.x + after.x) / 2, y: (corner.y + after.y) / 2 })}`;
  }
  const last = rest[rest.length - 1];
  if (last !== undefined) d += ` L${at(last)}`;
  return d;
}

/** A filled triangle pointing along the route's last segment, at its end. */
export function arrowPath(points: Point[], size = 7): string {
  const tip = points[points.length - 1];
  const before = points[points.length - 2];
  if (tip === undefined || before === undefined) return '';
  const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
  const corner = (turn: number): Point => ({
    x: tip.x - size * Math.cos(angle + turn),
    y: tip.y - size * Math.sin(angle + turn),
  });
  const a = corner(Math.PI / 7);
  const b = corner(-Math.PI / 7);
  const at = (p: Point) => `${round(p.x)},${round(p.y)}`;
  return `M${at(tip)} L${at(a)} L${at(b)} Z`;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Splits a label into lines no wider than `maxWidth`, breaking after
 * separators (`_ . - / |` and spaces) since doc names are mostly long
 * identifiers; a piece with no separator that is still too wide is cut.
 */
export function wrapLabel(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const pieces = text.match(/[^_.\-/| ]*[_.\-/| ]*/g)?.filter(Boolean) ?? [];
  const lines: string[] = [];
  let line = '';
  const push = (piece: string) => {
    if (line !== '' && measure((line + piece).trimEnd()) > maxWidth) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += piece;
  };
  for (const piece of pieces) {
    if (measure(piece.trimEnd()) <= maxWidth) {
      push(piece);
      continue;
    }
    for (const char of piece) push(char);
  }
  if (line.trim() !== '') lines.push(line.trimEnd());
  return lines.length > 0 ? lines : [text];
}
