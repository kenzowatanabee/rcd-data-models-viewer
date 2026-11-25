import type { Graph, GraphEdge, GraphNode } from '../indexer/types';
import { fold, matchesFilter } from './filter';

/** Tracing needs only each node's id and kind. */
type Nodes = readonly Pick<GraphNode, 'id' | 'kind'>[];
type Link = Pick<GraphEdge, 'from' | 'to'>;

export const edgeKey = (edge: Link): string => `${edge.from}\n${edge.to}`;

const kinds = (nodes: Nodes) =>
  new Map(nodes.map((node) => [node.id, node.kind]));

/**
 * A dataset -> dataset edge: declared only by `upstream` fields and touching
 * no pipeline. A `wrong-kind` upstream naming a pipeline is not one.
 */
export function isDirectLink(
  edge: GraphEdge,
  kindOf: Map<string, GraphNode['kind']>,
): boolean {
  return (
    kindOf.get(edge.from) !== 'pipeline' &&
    kindOf.get(edge.to) !== 'pipeline' &&
    edge.declaredBy.length > 0 &&
    edge.declaredBy.every((declared) => declared.endsWith('#upstream'))
  );
}

/**
 * Keys of direct dataset links that repeat what a pipeline already says:
 * A -> B is redundant when some pipeline P has A -> P and P -> B. Links
 * with no such pipeline are the only record of that flow and are kept.
 */
export function redundantLinks(graph: Pick<Graph, 'nodes' | 'edges'>) {
  const kindOf = kinds(graph.nodes);
  const keys = new Set(graph.edges.map(edgeKey));
  const pipelines = graph.nodes.filter((node) => node.kind === 'pipeline');
  const redundant = new Set<string>();
  for (const edge of graph.edges) {
    if (!isDirectLink(edge, kindOf)) continue;
    const viaPipeline = pipelines.some(
      ({ id }) =>
        keys.has(edgeKey({ from: edge.from, to: id })) &&
        keys.has(edgeKey({ from: id, to: edge.to })),
    );
    if (viaPipeline) redundant.add(edgeKey(edge));
  }
  return redundant;
}

export interface ViewOptions {
  showExternal: boolean;
  showRedundant: boolean;
}

export interface VisibleEdge extends GraphEdge {
  key: string;
  /** A direct dataset link that a pipeline also declares. */
  redundant: boolean;
}

export interface VisibleGraph {
  nodes: GraphNode[];
  edges: VisibleEdge[];
}

/** The nodes and edges the whole-graph view draws for these options. */
export function visibleGraph(graph: Graph, options: ViewOptions): VisibleGraph {
  const redundant = redundantLinks(graph);
  const nodes = graph.nodes.filter(
    (node) => options.showExternal || node.kind !== 'external',
  );
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges
    .map((edge) => ({
      ...edge,
      key: edgeKey(edge),
      redundant: redundant.has(edgeKey(edge)),
    }))
    .filter(
      (edge) =>
        ids.has(edge.from) &&
        ids.has(edge.to) &&
        (options.showRedundant || !edge.redundant),
    );
  return { nodes, edges };
}

/** 1 or 2 dataset steps, or null for no limit. */
export type Depth = 1 | 2 | null;

export interface Trace {
  root: string;
  /** Everything that flows into the root, with its distance in half steps. */
  upstream: Map<string, number>;
  downstream: Map<string, number>;
  upstreamEdges: Set<string>;
  downstreamEdges: Set<string>;
}

/**
 * Distances in half steps, so that a pipeline sits half way between the
 * datasets it connects: a step of depth is one dataset further, with the
 * pipeline that makes it, whether or not a direct link is shown too.
 */
function walk(
  start: string,
  next: Map<string, string[]>,
  isPipeline: (id: string) => boolean,
  limit: number,
): Map<string, number> {
  const distance = new Map<string, number>([
    [start, isPipeline(start) ? 1 : 0],
  ]);
  const queue = [start];
  // Label-correcting search: a node is revisited only when a shorter way to
  // it turns up, so cycles end once no distance can shrink
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const here = distance.get(id) ?? 0;
    for (const other of next.get(id) ?? []) {
      const cost = isPipeline(id) || isPipeline(other) ? 1 : 2;
      const there = here + cost;
      if (there > limit) continue;
      if (there < (distance.get(other) ?? Infinity)) {
        distance.set(other, there);
        queue.push(other);
      }
    }
  }
  distance.delete(start);
  return distance;
}

/**
 * Everything transitively upstream and downstream of `root`, following the
 * given edges only. Safe on cycles; a node on a cycle through the root is
 * both upstream and downstream.
 */
export function trace(
  graph: { nodes: Nodes; edges: Link[] },
  root: string,
  depth: Depth = null,
): Trace {
  const kindOf = kinds(graph.nodes);
  const isPipeline = (id: string) => kindOf.get(id) === 'pipeline';
  const into = new Map<string, string[]>();
  const outOf = new Map<string, string[]>();
  for (const { from, to } of graph.edges) {
    into.set(to, [...(into.get(to) ?? []), from]);
    outOf.set(from, [...(outOf.get(from) ?? []), to]);
  }
  const limit = depth === null ? Infinity : depth * 2;
  const upstream = walk(root, into, isPipeline, limit);
  const downstream = walk(root, outOf, isPipeline, limit);
  const upOrRoot = (id: string) => id === root || upstream.has(id);
  const downOrRoot = (id: string) => id === root || downstream.has(id);
  const upstreamEdges = new Set<string>();
  const downstreamEdges = new Set<string>();
  for (const edge of graph.edges) {
    if (upstream.has(edge.from) && upOrRoot(edge.to)) {
      upstreamEdges.add(edgeKey(edge));
    }
    if (downOrRoot(edge.from) && downstream.has(edge.to)) {
      downstreamEdges.add(edgeKey(edge));
    }
  }
  return { root, upstream, downstream, upstreamEdges, downstreamEdges };
}

/** Only the root and its traced lineage, joined by the traced edges. */
export function lineageOf(visible: VisibleGraph, lineage: Trace): VisibleGraph {
  const keep = (id: string) =>
    id === lineage.root ||
    lineage.upstream.has(id) ||
    lineage.downstream.has(id);
  return {
    nodes: visible.nodes.filter((node) => keep(node.id)),
    edges: visible.edges.filter(
      (edge) =>
        lineage.upstreamEdges.has(edge.key) ||
        lineage.downstreamEdges.has(edge.key),
    ),
  };
}

export interface Between {
  nodes: Set<string>;
  edges: Set<string>;
}

/**
 * Nodes and edges on some path from `a` to `b`, or from `b` to `a` when
 * that is the direction the data flows. Empty when neither reaches the other.
 */
export function between(
  graph: { nodes: Nodes; edges: Link[] },
  a: string,
  b: string,
): Between {
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    const down = trace(graph, from).downstream;
    if (!down.has(to)) continue;
    const up = trace(graph, to).upstream;
    const nodes = new Set([from, to]);
    for (const id of down.keys()) if (up.has(id)) nodes.add(id);
    const edges = new Set(
      graph.edges
        .filter((edge) => nodes.has(edge.from) && nodes.has(edge.to))
        // An edge into `from` or out of `to` is not between them
        .filter((edge) => edge.to !== from && edge.from !== to)
        .map(edgeKey),
    );
    return { nodes, edges };
  }
  return { nodes: new Set(), edges: new Set() };
}

/** Nodes with no edges in this graph. */
export function unlinked(graph: { nodes: Nodes; edges: Link[] }): Set<string> {
  const linked = new Set(graph.edges.flatMap((edge) => [edge.from, edge.to]));
  return new Set(
    graph.nodes.filter((node) => !linked.has(node.id)).map((node) => node.id),
  );
}

/**
 * Nodes whose name or an alias contains the query, ignoring case and
 * accents: names that start with it first, then other name matches, then
 * alias-only matches, each by name.
 */
export function findNodes(
  nodes: GraphNode[],
  query: string,
  limit = 8,
): GraphNode[] {
  const wanted = fold(query.trim());
  if (wanted === '') return [];
  const rank = (node: GraphNode) => {
    const name = fold(node.name);
    if (name.startsWith(wanted)) return 0;
    if (name.includes(wanted)) return 1;
    return 2;
  };
  return nodes
    .filter((node) => matchesFilter(query, [node.name, ...node.aliases]))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * The nodes of a path in the order the data flows through them; nodes the
 * path's edges leave unordered keep the order of `ids`.
 */
export function pathOrder(path: Between, edges: Link[], ids: string[]) {
  const links = edges.filter((edge) => path.edges.has(edgeKey(edge)));
  const rank = new Map(ids.map((id, index) => [id, index]));
  const waiting = new Map<string, number>();
  for (const id of path.nodes) waiting.set(id, 0);
  for (const { to } of links) waiting.set(to, (waiting.get(to) ?? 0) + 1);
  const byRank = (a: string, b: string) =>
    (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) ||
    (a < b ? -1 : a > b ? 1 : 0);
  const ready = [...path.nodes].filter((id) => waiting.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort(byRank);
    const id = ready.shift() as string;
    order.push(id);
    for (const { from, to } of links) {
      if (from !== id) continue;
      const left = (waiting.get(to) ?? 0) - 1;
      waiting.set(to, left);
      if (left === 0) ready.push(to);
    }
  }
  // A cycle leaves nodes waiting; list them after the rest
  const rest = [...path.nodes].filter((id) => !order.includes(id));
  return [...order, ...rest.sort(byRank)];
}
