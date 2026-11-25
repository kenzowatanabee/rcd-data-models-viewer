import type { GraphEdge, GraphNode } from '../indexer/types';
import { normaliseName } from '../indexer/names';
import type { BandGroup } from './graphLayout';

type FamilyNode = Pick<GraphNode, 'id' | 'kind' | 'name' | 'layer'>;
type Link = Pick<GraphEdge, 'from' | 'to'>;

export interface FamilyGraph {
  nodes: FamilyNode[];
  edges: Link[];
}

/**
 * On the real docs the dimension datasets are read by 12, 9, 8, 5 and 4
 * pipelines, and the next one by 2; 3 sits in that gap.
 */
export const LOOKUP_MIN_READERS = 3;

/**
 * Non-lookup datasets read by this many pipelines tie otherwise separate
 * families together; on the real docs they are read by 7, 5 and 4, the
 * next by 3.
 */
export const FEED_MIN_READERS = 4;

function readers(graph: FamilyGraph): Map<string, Set<string>> {
  const kindOf = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const read = new Map<string, Set<string>>();
  for (const { from, to } of graph.edges) {
    if (kindOf.get(to) !== 'pipeline' || from === to) continue;
    const set = read.get(from) ?? new Set<string>();
    set.add(to);
    read.set(from, set);
  }
  return read;
}

/**
 * Shared lookups: `dimension` datasets read by at least `minReaders`
 * distinct pipelines. Their links say little about how data flows, so
 * they are shown as tags on the readers instead of as wires.
 */
export function sharedLookups(
  graph: FamilyGraph,
  minReaders = LOOKUP_MIN_READERS,
): Set<string> {
  const read = readers(graph);
  return new Set(
    graph.nodes
      .filter(
        (n) =>
          n.kind === 'dataset' &&
          n.layer === 'dimension' &&
          (read.get(n.id)?.size ?? 0) >= minReaders,
      )
      .map((n) => n.id),
  );
}

/**
 * Shared feeds: other non-pipeline nodes read by at least `minReaders`
 * distinct pipelines. They keep their wires, but those wires do not join
 * families: a feed stays in the family of whatever produces it.
 */
export function sharedFeeds(
  graph: FamilyGraph,
  exclude: ReadonlySet<string>,
  minReaders = FEED_MIN_READERS,
): Set<string> {
  const read = readers(graph);
  return new Set(
    graph.nodes
      .filter(
        (n) =>
          n.kind !== 'pipeline' &&
          !exclude.has(n.id) &&
          (read.get(n.id)?.size ?? 0) >= minReaders,
      )
      .map((n) => n.id),
  );
}

export interface Family {
  /** The smallest node id in it, so it survives unrelated edits. */
  id: string;
  nodes: string[];
  /** A dataset a maintainer would recognise the family by. */
  name: string;
  /** How many other final datasets (or other feeds) it has. */
  more: number;
  /** Holds a shared feed. */
  feed: boolean;
}

export interface FamilyOptions {
  lookups: ReadonlySet<string>;
  feeds: ReadonlySet<string>;
}

/** Edges that hold a family together: none from a feed or touching a lookup. */
export function familyEdges<E extends Link>(
  edges: E[],
  { lookups, feeds }: FamilyOptions,
): E[] {
  return edges.filter(
    (e) => !lookups.has(e.from) && !lookups.has(e.to) && !feeds.has(e.from),
  );
}

/**
 * Weakly connected components of the graph without lookups and without
 * the edges out of feeds. Nodes with no edges at all are left out (they
 * belong to "not linked to anything"), and so are the lookups. Feed
 * families come first, by name; then the rest, largest first, then by name
 * and id, so the order does not depend on the order of the input.
 */
export function families(graph: FamilyGraph, options: FamilyOptions): Family[] {
  const linked = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
  const members = graph.nodes.filter(
    (n) => linked.has(n.id) && !options.lookups.has(n.id),
  );
  const ids = new Set(members.map((n) => n.id));
  const edges = familyEdges(graph.edges, options).filter(
    (e) => ids.has(e.from) && ids.has(e.to),
  );

  const parent = new Map<string, string>();
  const root = (id: string): string => {
    let at = id;
    while (parent.has(at) && parent.get(at) !== at) at = parent.get(at) ?? at;
    parent.set(id, at);
    return at;
  };
  for (const { from, to } of edges) {
    const a = root(from);
    const b = root(to);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const groups = new Map<string, string[]>();
  for (const { id } of members) {
    const key = root(id);
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const result = [...groups.values()].map((ids): Family => {
    const sorted = [...ids].sort();
    const set = new Set(sorted);
    const inside = edges.filter((e) => set.has(e.from) && set.has(e.to));
    const named = familyName(
      sorted.map((id) => byId.get(id) as FamilyNode),
      inside,
      options.feeds,
    );
    return {
      id: sorted[0] as string,
      nodes: sorted,
      ...named,
      feed: sorted.some((id) => options.feeds.has(id)),
    };
  });
  return result.sort(
    (a, b) =>
      Number(b.feed) - Number(a.feed) ||
      (a.feed ? 0 : b.nodes.length - a.nodes.length) ||
      a.name.localeCompare(b.name) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** How many nodes reach `id` (or `id` reaches), following `edges`. */
function reach(id: string, edges: Link[], backwards: boolean): number {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const at = queue.pop() as string;
    for (const e of edges) {
      const [here, there] = backwards ? [e.to, e.from] : [e.from, e.to];
      if (here === at && there !== id && !seen.has(there)) {
        seen.add(there);
        queue.push(there);
      }
    }
  }
  return seen.size;
}

/**
 * Names a family after what it produces, since the docs have no domain
 * field: its feed, if it holds one; otherwise the final dataset (nothing
 * in the family reads it) built from the most of the family, preferring
 * one whose name a pipeline of the family repeats (`X` made by `X_FLOW`).
 * With no final dataset, the dataset that feeds the most of it.
 */
export function familyName(
  nodes: FamilyNode[],
  edges: Link[],
  feeds: ReadonlySet<string>,
): { name: string; more: number } {
  const byName = (a: FamilyNode, b: FamilyNode) =>
    a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1);
  const own = nodes.filter((n) => feeds.has(n.id)).sort(byName);
  if (own[0] !== undefined) return { name: own[0].name, more: own.length - 1 };

  const pipelines = nodes
    .filter((n) => n.kind === 'pipeline')
    .map((n) => normaliseName(n.name));
  const echoed = (n: FamilyNode) =>
    pipelines.some(
      (p) => p !== normaliseName(n.name) && p.startsWith(normaliseName(n.name)),
    );
  const datasets = nodes.filter((n) => n.kind !== 'pipeline');
  const reads = new Set(edges.map((e) => e.from));
  const finals = datasets.filter((n) => !reads.has(n.id));
  const pick = (candidates: FamilyNode[], backwards: boolean) =>
    candidates
      .map((n) => ({ n, size: reach(n.id, edges, backwards) }))
      .sort(
        (a, b) =>
          b.size - a.size ||
          Number(echoed(b.n)) - Number(echoed(a.n)) ||
          byName(a.n, b.n),
      )[0]?.n;

  const best =
    pick(finals, true) ?? pick(datasets, false) ?? [...nodes].sort(byName)[0];
  if (best === undefined) return { name: '', more: 0 };
  return {
    name: best.name,
    more: finals.length > 0 ? finals.length - 1 : 0,
  };
}

export const LOOKUPS_BAND = 'lookups';
export const UNLINKED_BAND = 'unlinked';

export interface Band {
  /** Group id in the layout: `lookups`, `unlinked` or `family:<id>`. */
  id: string;
  title: string;
  kind: 'lookups' | 'feed' | 'family' | 'unlinked';
  nodes: string[];
}

export interface Arrangement {
  bands: Band[];
  groups: BandGroup[];
}

/**
 * The bands to draw, in order: shared lookups, feed families, the other
 * families, then the nodes linked to nothing. Feeds, and then the lookups
 * too, go in the side column.
 */
export function arrange(
  graph: FamilyGraph,
  options: FamilyOptions,
): Arrangement {
  const linked = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
  const byName = (a: FamilyNode, b: FamilyNode) =>
    a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1);
  const lookups = graph.nodes
    .filter((n) => options.lookups.has(n.id))
    .sort(byName)
    .map((n) => n.id);
  const loose = graph.nodes
    .filter((n) => !linked.has(n.id) && !options.lookups.has(n.id))
    .sort(byName)
    .map((n) => n.id);
  const bands: Band[] = [];
  if (lookups.length > 0) {
    bands.push({
      id: LOOKUPS_BAND,
      title: 'Shared lookups',
      kind: 'lookups',
      nodes: lookups,
    });
  }
  for (const family of families(graph, options)) {
    const more = family.more > 0 ? ` + ${family.more} more` : '';
    bands.push({
      id: `family:${family.id}`,
      title: family.feed
        ? `Shared feed: ${family.name}${more}`
        : `${family.name}${more}`,
      kind: family.feed ? 'feed' : 'family',
      nodes: family.nodes,
    });
  }
  if (loose.length > 0) {
    bands.push({
      id: UNLINKED_BAND,
      title: 'Not linked to anything',
      kind: 'unlinked',
      nodes: loose,
    });
  }
  // Feeds go on the left so their wires run rightwards into the families;
  // with none, the lookups take a row on top and leave the width to them
  const side = bands.some((band) => band.kind === 'feed');
  const groups = bands.map((band): BandGroup => ({
    id: band.id,
    nodes: band.nodes,
    column:
      band.kind === 'feed' || (band.kind === 'lookups' && side)
        ? 'side'
        : 'main',
    arrange:
      band.kind === 'lookups' || band.kind === 'unlinked' ? 'wrap' : 'flow',
  }));
  return { bands, groups };
}

/** The lookups each node reads, by node. */
export function lookupsRead(
  edges: Link[],
  lookups: ReadonlySet<string>,
): Map<string, string[]> {
  const read = new Map<string, string[]>();
  for (const { from, to } of edges) {
    if (!lookups.has(from) || from === to) continue;
    const list = read.get(to) ?? [];
    if (!list.includes(from)) list.push(from);
    read.set(to, list);
  }
  return read;
}
