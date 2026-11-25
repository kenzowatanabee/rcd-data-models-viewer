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
    const wrapAt = Math.max(right, 900);
    let x = 0;
    let y = top + CAPTION;
    let rowHeight = 0;
    for (const node of loose) {
      if (x > 0 && x + node.width > wrapAt) {
        x = 0;
        y += rowHeight + NODE_GAP;
        rowHeight = 0;
      }
      positions.set(node.id, { x, y });
      x += node.width + NODE_GAP;
      rowHeight = Math.max(rowHeight, node.height);
    }
  }

  return { positions, routes, unlinkedRow };
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
